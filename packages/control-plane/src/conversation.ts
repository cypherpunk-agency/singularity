import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Message, Channel } from '@singularity/shared';
import { estimateTokens, truncateArrayToTokenBudget } from './context/index.js';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getConversationDir(channel?: Channel): string {
  const base = getBasePath();
  if (channel) {
    return path.join(base, 'agent', 'conversation', channel);
  }
  return path.join(base, 'agent', 'conversation');
}

function getConversationFile(channel: Channel, date: string): string {
  return path.join(getConversationDir(channel), `${date}.jsonl`);
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Append a message to the channel-specific conversation log
 */
export async function appendToConversation(channel: Channel, message: Message): Promise<void> {
  const conversationDir = getConversationDir(channel);
  const conversationFile = getConversationFile(channel, getTodayDate());

  // Ensure conversation directory exists
  await fs.mkdir(conversationDir, { recursive: true });

  // Append message as JSONL
  await fs.appendFile(conversationFile, JSON.stringify(message) + '\n');
}

/**
 * Create and save a human message to the conversation
 */
export async function saveHumanMessage(text: string, channel: Channel): Promise<Message> {
  const message: Message = {
    id: uuidv4(),
    text,
    from: 'human',
    channel,
    timestamp: new Date().toISOString(),
  };

  await appendToConversation(channel, message);
  return message;
}

/**
 * Create and save an agent response to the conversation
 */
export async function saveAgentResponse(text: string, channel: Channel): Promise<Message> {
  const message: Message = {
    id: uuidv4(),
    text,
    from: 'agent',
    channel,
    timestamp: new Date().toISOString(),
  };

  await appendToConversation(channel, message);
  return message;
}

/**
 * Get conversation history for a specific channel and date
 */
export async function getConversationHistory(channel: Channel, date?: string): Promise<Message[]> {
  const targetDate = date || getTodayDate();
  const conversationFile = getConversationFile(channel, targetDate);

  try {
    const content = await fs.readFile(conversationFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as Message);
  } catch {
    return [];
  }
}

/**
 * Get all available conversation dates for a channel
 */
export async function getConversationDates(channel: Channel): Promise<string[]> {
  const conversationDir = getConversationDir(channel);

  try {
    const files = await fs.readdir(conversationDir);
    return files
      .filter(f => f.endsWith('.jsonl'))
      .map(f => f.replace('.jsonl', ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Get recent messages from a channel
 */
export async function getRecentMessages(channel: Channel, limit: number = 50): Promise<Message[]> {
  const dates = await getConversationDates(channel);

  const allMessages: Message[] = [];
  for (const date of dates.reverse()) {
    const messages = await getConversationHistory(channel, date);
    allMessages.push(...messages);

    // Stop if we have enough messages
    if (allMessages.length >= limit) {
      break;
    }
  }

  // Return the last N messages
  return allMessages.slice(-limit);
}

/**
 * Get recent conversation history (last N days) for a channel
 */
export async function getRecentConversation(channel: Channel, days: number = 7): Promise<Message[]> {
  const dates = await getConversationDates(channel);
  const recentDates = dates.slice(0, days);

  const allMessages: Message[] = [];
  for (const date of recentDates.reverse()) {
    const messages = await getConversationHistory(channel, date);
    allMessages.push(...messages);
  }

  return allMessages;
}

/**
 * Get all recent conversations across all channels
 */
export async function getAllRecentConversations(limit: number = 20): Promise<{ web: Message[]; telegram: Message[] }> {
  const [webMessages, telegramMessages] = await Promise.all([
    getRecentMessages('web', limit),
    getRecentMessages('telegram', limit),
  ]);

  return { web: webMessages, telegram: telegramMessages };
}

/**
 * Prepare conversation history for agent context
 * This is extensible for future enhancements like token counting, compaction, etc.
 */
export interface PrepareHistoryOptions {
  channel: Channel;
  maxMessages?: number;
  maxTokens?: number;
  crossDay?: boolean;
}

export interface PreparedHistory {
  messages: Message[];
  formatted: string;
  tokenEstimate: number;
}

/**
 * Format a message for context display
 */
function formatMessage(m: Message): string {
  const role = m.from === 'human' ? 'Human' : 'Agent';
  const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `[${time}] ${role}: ${m.text}`;
}

export async function prepareHistory(options: PrepareHistoryOptions): Promise<string> {
  const { channel, maxMessages = 30 } = options;

  const messages = await getRecentMessages(channel, maxMessages);

  if (messages.length === 0) {
    return 'No previous conversation history.';
  }

  // Format as readable conversation
  return messages.map(formatMessage).join('\n');
}

/**
 * Get conversation history with token-aware truncation and cross-day support
 * Returns formatted history and metadata
 */
export async function getConversationHistoryWithOptions(
  options: PrepareHistoryOptions
): Promise<PreparedHistory> {
  const { channel, maxMessages = 30, maxTokens = 2000, crossDay = true } = options;

  let messages: Message[] = [];

  if (crossDay) {
    // Get recent messages across multiple days
    messages = await getRecentMessages(channel, maxMessages);
  } else {
    // Get only today's messages
    messages = await getConversationHistory(channel);
    messages = messages.slice(-maxMessages);
  }

  if (messages.length === 0) {
    const emptyMsg = 'No previous conversation history.';
    return {
      messages: [],
      formatted: emptyMsg,
      tokenEstimate: estimateTokens(emptyMsg),
    };
  }

  // Token-aware truncation if maxTokens specified
  let truncatedMessages = messages;
  if (maxTokens) {
    truncatedMessages = truncateArrayToTokenBudget(
      messages,
      formatMessage,
      maxTokens
    );
  }

  const formatted = truncatedMessages.map(formatMessage).join('\n');

  return {
    messages: truncatedMessages,
    formatted,
    tokenEstimate: estimateTokens(formatted),
  };
}

// Legacy compatibility: Get conversation without channel (combines all channels)
export async function getRecentConversationAll(days: number = 7): Promise<Message[]> {
  const [webMessages, telegramMessages] = await Promise.all([
    getRecentConversation('web', days),
    getRecentConversation('telegram', days),
  ]);

  // Combine and sort by timestamp
  const allMessages = [...webMessages, ...telegramMessages];
  allMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  return allMessages;
}

/**
 * Mark messages as processed by updating their processedAt field
 * Updates messages in today's conversation file that match the given IDs
 */
export async function markMessagesAsProcessed(
  channel: Channel,
  messageIds: string[],
  processedAt: string = new Date().toISOString()
): Promise<void> {
  if (messageIds.length === 0) return;

  const conversationFile = getConversationFile(channel, getTodayDate());
  const idsSet = new Set(messageIds);

  try {
    const content = await fs.readFile(conversationFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());

    const updatedLines = lines.map(line => {
      try {
        const message = JSON.parse(line) as Message;
        if (idsSet.has(message.id)) {
          message.processedAt = processedAt;
          return JSON.stringify(message);
        }
        return line;
      } catch {
        return line;
      }
    });

    await fs.writeFile(conversationFile, updatedLines.join('\n') + '\n');
  } catch {
    // File doesn't exist or can't be read, nothing to update
  }
}

/**
 * Get unprocessed human messages from a channel
 * Returns messages where processedAt is undefined
 */
export async function getUnprocessedMessages(channel: Channel): Promise<Message[]> {
  const messages = await getRecentMessages(channel, 100);
  return messages.filter(m => m.from === 'human' && !m.processedAt);
}

/**
 * Check if there are any unprocessed human messages
 * Optionally check a specific channel, or all channels if not specified
 */
export async function hasUnprocessedMessages(channel?: Channel): Promise<boolean> {
  const channels: Channel[] = channel ? [channel] : ['web', 'telegram'];

  for (const ch of channels) {
    const unprocessed = await getUnprocessedMessages(ch);
    if (unprocessed.length > 0) return true;
  }

  return false;
}
