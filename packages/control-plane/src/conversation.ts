import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Message, Channel } from '@singularity/shared';

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
  // Future options:
  // maxTokens?: number;
  // includeMemory?: boolean;
  // preserveImportant?: boolean;
}

export async function prepareHistory(options: PrepareHistoryOptions): Promise<string> {
  const { channel, maxMessages = 30 } = options;

  const messages = await getRecentMessages(channel, maxMessages);

  if (messages.length === 0) {
    return 'No previous conversation history.';
  }

  // Format as readable conversation
  return messages.map(m => {
    const role = m.from === 'human' ? 'Human' : 'Agent';
    const time = new Date(m.timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `[${time}] ${role}: ${m.text}`;
  }).join('\n');
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
