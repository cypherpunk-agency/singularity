import { promises as fs } from 'fs';
import path from 'path';
import { QueuedRun } from '@singularity/shared';

const QUEUE_FILE = 'queue.jsonl';

function getQueuePath(): string {
  const basePath = process.env.APP_DIR || '/app';
  return path.join(basePath, 'state', QUEUE_FILE);
}

/**
 * Read all queue entries from the JSONL file.
 */
export async function readQueue(): Promise<QueuedRun[]> {
  const queuePath = getQueuePath();

  try {
    const content = await fs.readFile(queuePath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    return lines.map(line => JSON.parse(line) as QueuedRun);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

/**
 * Append a new entry to the queue file.
 */
export async function appendToQueue(entry: QueuedRun): Promise<void> {
  const queuePath = getQueuePath();
  const stateDir = path.dirname(queuePath);

  // Ensure state directory exists
  await fs.mkdir(stateDir, { recursive: true });

  // Append entry as JSON line
  await fs.appendFile(queuePath, JSON.stringify(entry) + '\n');
}

/**
 * Update an existing entry in the queue file.
 * Rewrites the entire file with the updated entry.
 */
export async function updateQueueEntry(id: string, updates: Partial<QueuedRun>): Promise<QueuedRun | null> {
  const entries = await readQueue();
  const index = entries.findIndex(e => e.id === id);

  if (index === -1) {
    return null;
  }

  // Apply updates
  entries[index] = { ...entries[index], ...updates };

  // Rewrite the file
  await writeQueue(entries);

  return entries[index];
}

/**
 * Write all entries to the queue file (overwrites existing).
 */
export async function writeQueue(entries: QueuedRun[]): Promise<void> {
  const queuePath = getQueuePath();
  const stateDir = path.dirname(queuePath);

  await fs.mkdir(stateDir, { recursive: true });

  const content = entries.map(e => JSON.stringify(e)).join('\n') + (entries.length > 0 ? '\n' : '');
  await fs.writeFile(queuePath, content);
}

/**
 * Clean up old completed/failed entries (keep last N).
 * This prevents the queue file from growing indefinitely.
 */
export async function cleanupQueue(keepCompleted: number = 50): Promise<void> {
  const entries = await readQueue();

  // Separate active and completed entries
  const active = entries.filter(e => e.status === 'pending' || e.status === 'processing');
  const completed = entries.filter(e => e.status === 'completed' || e.status === 'failed');

  // Keep only the last N completed entries
  const recentCompleted = completed.slice(-keepCompleted);

  // Combine and write
  await writeQueue([...active, ...recentCompleted]);
}
