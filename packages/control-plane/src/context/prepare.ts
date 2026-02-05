/**
 * Context preparation for agent runs
 * Assembles system prompts with intelligent retrieval and token budgeting
 */

import { promises as fs } from 'fs';
import path from 'path';
import { Channel, RunType, Message } from '@singularity/shared';
import { estimateTokens, truncateArrayToTokenBudget } from './tokens.js';
import { searchMemory, isVectorServiceAvailable } from './memory-search.js';

// Default token budgets for context components
const DEFAULT_BUDGETS = {
  total: 8000,
  soul: 500,
  modeInstructions: 300,
  conversationHistory: 2000,
  relevantMemory: 1500,
  projects: 500,
  dailyLogs: 500,
};

export interface ContextOptions {
  type: RunType;
  channel?: Channel;
  query?: string;  // User's message for vector search
  tokenBudget?: number;
  focusMessageIds?: string[];  // Message IDs requiring response (unprocessed messages)
}

export interface PreparedContext {
  systemPrompt: string;
  userPrompt: string;
  metadata: {
    totalTokensEstimate: number;
    memorySnippetsIncluded: number;
    conversationMessagesIncluded: number;
    vectorSearchUsed: boolean;
    components: {
      soul: number;
      modeInstructions: number;
      conversationHistory: number;
      relevantMemory: number;
      projects: number;
    };
  };
}

/**
 * Get base path for application files
 */
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

/**
 * Read a file safely, returning empty string if not found
 */
async function readFileSafe(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Get conversation history with cross-day support and token-aware truncation
 */
async function getConversationHistoryForContext(
  channel: Channel,
  options: {
    maxMessages?: number;
    maxTokens?: number;
    crossDay?: boolean;
  } = {}
): Promise<{ formatted: string; tokenEstimate: number; messageCount: number }> {
  const { maxMessages = 30, maxTokens = 2000, crossDay = true } = options;
  const basePath = getBasePath();
  const conversationDir = path.join(basePath, 'agent', 'conversation', channel);

  const today = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let messages: Message[] = [];

  // Read today's messages
  const todayFile = path.join(conversationDir, `${today}.jsonl`);
  const todayContent = await readFileSafe(todayFile);
  if (todayContent) {
    const lines = todayContent.trim().split('\n').filter(line => line.trim());
    messages = lines.map(line => JSON.parse(line) as Message);
  }

  // If crossDay enabled and we need more messages, read yesterday
  if (crossDay && messages.length < maxMessages) {
    const yesterdayFile = path.join(conversationDir, `${yesterday}.jsonl`);
    const yesterdayContent = await readFileSafe(yesterdayFile);
    if (yesterdayContent) {
      const lines = yesterdayContent.trim().split('\n').filter(line => line.trim());
      const yesterdayMessages = lines.map(line => JSON.parse(line) as Message);
      messages = [...yesterdayMessages, ...messages];
    }
  }

  // Take last N messages
  messages = messages.slice(-maxMessages);

  if (messages.length === 0) {
    return {
      formatted: 'No previous messages in this conversation.',
      tokenEstimate: estimateTokens('No previous messages in this conversation.'),
      messageCount: 0,
    };
  }

  // Format messages
  const formatMessage = (m: Message): string => {
    const role = m.from === 'human' ? 'Human' : 'Agent';
    const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `[${time}] ${role}: ${m.text}`;
  };

  // Token-aware truncation (keep most recent)
  const truncatedMessages = truncateArrayToTokenBudget(
    messages,
    formatMessage,
    maxTokens
  );

  const formatted = truncatedMessages.map(formatMessage).join('\n');

  return {
    formatted,
    tokenEstimate: estimateTokens(formatted),
    messageCount: truncatedMessages.length,
  };
}

/**
 * Prepare context for an agent run
 * Assembles system prompt with intelligent retrieval and token budgeting
 */
export async function prepareContext(options: ContextOptions): Promise<PreparedContext> {
  const { type, channel, query, tokenBudget = DEFAULT_BUDGETS.total, focusMessageIds = [] } = options;
  const basePath = getBasePath();

  let usedTokens = 0;
  const parts: string[] = [];
  const metadata: PreparedContext['metadata'] = {
    totalTokensEstimate: 0,
    memorySnippetsIncluded: 0,
    conversationMessagesIncluded: 0,
    vectorSearchUsed: false,
    components: {
      soul: 0,
      modeInstructions: 0,
      conversationHistory: 0,
      relevantMemory: 0,
      projects: 0,
    },
  };

  // 1. SOUL.md (always included)
  const soul = await readFileSafe(path.join(basePath, 'agent', 'context', 'SOUL.md'));
  if (soul) {
    parts.push(soul);
    const soulTokens = estimateTokens(soul);
    usedTokens += soulTokens;
    metadata.components.soul = soulTokens;
  }

  // 2. SYSTEM.md (always included)
  const system = await readFileSafe(path.join(basePath, 'agent', 'context', 'SYSTEM.md'));
  if (system) {
    parts.push(system);
    const systemTokens = estimateTokens(system);
    usedTokens += systemTokens;
    metadata.components.soul += systemTokens; // Count with soul
  }

  // 2.5. Current timestamp (helps Claude with date/weekday accuracy)
  const now = new Date();
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Europe/Helsinki'
  });
  const timestampLine = `**Current Time:** It is ${weekday}, ${dateStr} ${timeStr} CET`;
  parts.push(timestampLine);
  usedTokens += estimateTokens(timestampLine);

  // 3. OPERATIONS.md (always included)
  const operations = await readFileSafe(path.join(basePath, 'agent', 'context', 'OPERATIONS.md'));
  if (operations) {
    parts.push(operations);
    const operationsTokens = estimateTokens(operations);
    usedTokens += operationsTokens;
    metadata.components.soul += operationsTokens; // Count with soul/system
  }

  // 4. PROJECTS.md (always included)
  const projects = await readFileSafe(path.join(basePath, 'agent', 'operations', 'PROJECTS.md'));
  if (projects) {
    parts.push(`## Projects Directory\n${projects}`);
    const tokens = estimateTokens(projects);
    usedTokens += tokens;
    metadata.components.projects = tokens;
  }

  // 5. MEMORY.md / vector search (always included)
  if (query) {
    const vectorAvailable = await isVectorServiceAvailable();
    if (vectorAvailable) {
      const remainingBudget = tokenBudget - usedTokens - 1000; // Reserve for mode-specific content
      const memorySnippets = await searchMemory(query, {
        maxResults: 5,
        maxTokens: Math.min(DEFAULT_BUDGETS.relevantMemory, remainingBudget),
      });

      if (memorySnippets.content) {
        parts.push(`## Relevant Memory\n${memorySnippets.content}`);
        usedTokens += memorySnippets.tokenEstimate;
        metadata.components.relevantMemory = memorySnippets.tokenEstimate;
        metadata.memorySnippetsIncluded = memorySnippets.sources.length;
        metadata.vectorSearchUsed = true;
      }
    } else {
      // Fallback: include full MEMORY.md if vector search unavailable
      const memory = await readFileSafe(path.join(basePath, 'agent', 'operations', 'MEMORY.md'));
      if (memory) {
        parts.push(`## Cross-Session Memory\n${memory}`);
        const tokens = estimateTokens(memory);
        usedTokens += tokens;
        metadata.components.relevantMemory = tokens;
      }
    }
  } else {
    // No query provided - include full MEMORY.md
    const memory = await readFileSafe(path.join(basePath, 'agent', 'operations', 'MEMORY.md'));
    if (memory) {
      parts.push(`## Cross-Session Memory\n${memory}`);
      const tokens = estimateTokens(memory);
      usedTokens += tokens;
      metadata.components.relevantMemory = tokens;
    }
  }

  // 6. Mode-specific instructions
  if (type === 'cron') {
    const heartbeat = await readFileSafe(path.join(basePath, 'agent', 'context', 'HEARTBEAT.md'));
    if (heartbeat) {
      parts.push(heartbeat);
      const tokens = estimateTokens(heartbeat);
      usedTokens += tokens;
      metadata.components.modeInstructions = tokens;
    }
  } else {
    const conversation = await readFileSafe(path.join(basePath, 'agent', 'context', 'CONVERSATION.md'));
    if (conversation) {
      parts.push(conversation);
      const tokens = estimateTokens(conversation);
      usedTokens += tokens;
      metadata.components.modeInstructions = tokens;
    }

    // 7. Channel-specific instructions (e.g., TELEGRAM.md, WEB.md)
    if (channel) {
      const channelConfig = await readFileSafe(
        path.join(basePath, 'agent', 'context', `${channel.toUpperCase()}.md`)
      );
      if (channelConfig) {
        parts.push(channelConfig);
        const tokens = estimateTokens(channelConfig);
        usedTokens += tokens;
        metadata.components.modeInstructions += tokens;
      }
    }

    // 8. Conversation history (with cross-day support)
    if (channel) {
      const remainingBudget = tokenBudget - usedTokens - 500; // Small reserve
      const history = await getConversationHistoryForContext(channel, {
        maxMessages: 30,
        maxTokens: Math.min(DEFAULT_BUDGETS.conversationHistory, remainingBudget),
        crossDay: true,
      });

      parts.push(`## Recent Conversation (${channel})\n${history.formatted}`);
      usedTokens += history.tokenEstimate;
      metadata.components.conversationHistory = history.tokenEstimate;
      metadata.conversationMessagesIncluded = history.messageCount;

      // Add channel info
      parts.push(`\n**Channel:** ${channel}`);

      // Highlight unprocessed messages requiring response
      if (focusMessageIds.length > 0) {
        parts.push(`**New messages requiring response:** ${focusMessageIds.length}`);
      }
    }
  }

  metadata.totalTokensEstimate = usedTokens;

  // Determine user prompt
  const userPrompt = type === 'cron'
    ? 'Begin heartbeat.'
    : 'Process the incoming message and respond.';

  return {
    systemPrompt: parts.join('\n\n'),
    userPrompt,
    metadata,
  };
}
