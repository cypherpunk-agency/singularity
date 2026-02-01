import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '@singularity/shared';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getInboxPath(): string {
  const base = getBasePath();
  return path.join(base, 'agent', 'INBOX.md');
}

function getConversationDir(): string {
  const base = getBasePath();
  return path.join(base, 'agent', 'conversation');
}

function getConversationFile(date: string): string {
  return path.join(getConversationDir(), `${date}.jsonl`);
}

function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Append a message to INBOX.md for the agent to process
 */
export async function appendToInbox(text: string, channel: 'web' | 'telegram'): Promise<Message> {
  const message: Message = {
    id: uuidv4(),
    text,
    from: 'human',
    channel,
    timestamp: new Date().toISOString(),
  };

  const inboxPath = getInboxPath();

  // Ensure inbox file exists
  try {
    await fs.access(inboxPath);
  } catch {
    await fs.writeFile(inboxPath, '# Inbox\n\nMessages from humans will appear here. Process them and respond in the conversation log.\n\n---\n\n');
  }

  // Append message to inbox
  const formattedMessage = `### Message from ${channel} (${message.timestamp})\n\n${text}\n\n---\n\n`;
  await fs.appendFile(inboxPath, formattedMessage);

  // Also log to conversation history
  await appendToConversation(message);

  return message;
}

/**
 * Append a message to today's conversation log
 */
export async function appendToConversation(message: Message): Promise<void> {
  const conversationDir = getConversationDir();
  const conversationFile = getConversationFile(getTodayDate());

  // Ensure conversation directory exists
  await fs.mkdir(conversationDir, { recursive: true });

  // Append message as JSONL
  await fs.appendFile(conversationFile, JSON.stringify(message) + '\n');
}

/**
 * Get conversation history for a specific date
 */
export async function getConversationHistory(date?: string): Promise<Message[]> {
  const targetDate = date || getTodayDate();
  const conversationFile = getConversationFile(targetDate);

  try {
    const content = await fs.readFile(conversationFile, 'utf-8');
    const lines = content.trim().split('\n').filter(line => line.trim());
    return lines.map(line => JSON.parse(line) as Message);
  } catch {
    return [];
  }
}

/**
 * Get all available conversation dates
 */
export async function getConversationDates(): Promise<string[]> {
  const conversationDir = getConversationDir();

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
 * Get recent conversation history (last N days)
 */
export async function getRecentConversation(days: number = 7): Promise<Message[]> {
  const dates = await getConversationDates();
  const recentDates = dates.slice(0, days);

  const allMessages: Message[] = [];
  for (const date of recentDates.reverse()) {
    const messages = await getConversationHistory(date);
    allMessages.push(...messages);
  }

  return allMessages;
}

/**
 * Clear processed messages from inbox
 * Called after agent processes messages
 */
export async function clearInbox(): Promise<void> {
  const inboxPath = getInboxPath();
  await fs.writeFile(inboxPath, '# Inbox\n\nMessages from humans will appear here. Process them and respond in the conversation log.\n\n---\n\n');
}

/**
 * Check if inbox has pending messages
 */
export async function hasInboxMessages(): Promise<boolean> {
  const inboxPath = getInboxPath();

  try {
    const content = await fs.readFile(inboxPath, 'utf-8');
    // Check if there's content after the header
    const lines = content.split('---');
    return lines.length > 1 && lines.slice(1).some(l => l.trim().length > 0);
  } catch {
    return false;
  }
}
