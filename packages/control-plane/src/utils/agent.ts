import { execSync } from 'child_process';
import { Channel, RunType } from '@singularity/shared';
import { hasUnprocessedMessages } from '../conversation.js';
import { queueManager } from '../queue/manager.js';
import { queueWorker } from '../queue/worker.js';

/**
 * Generate a run ID in the format YYYYMMDD-HHMMSS
 */
export function generateRunId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Get the base path for the application.
 */
export function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

/**
 * Check if the lock file is actually locked using flock.
 * Returns true if the lock is held by another process.
 * @deprecated Queue handles serialization now. Kept for status checks.
 */
export function isLockHeld(lockPath: string): boolean {
  try {
    // Try to acquire lock non-blocking - if it succeeds, no one else has it
    execSync(`flock -n "${lockPath}" -c 'exit 0'`, { stdio: 'ignore' });
    return false; // Lock was available, so not held
  } catch {
    return true; // Lock acquisition failed, someone else has it
  }
}

export interface TriggerOptions {
  channel?: Channel;
  type?: RunType;
  prompt?: string;
  query?: string;  // User's message for vector search context
}

/**
 * Trigger the agent to run with the given options.
 *
 * For chat runs: Simply notifies the worker that messages arrived.
 * The worker polls for unprocessed messages (message-centric model).
 * Messages saved to JSONL ARE the queue - no separate queue entry needed.
 *
 * For cron runs: Enqueues to the queue and returns the queue ID.
 */
export async function triggerAgentRun(options: TriggerOptions = {}): Promise<string | null> {
  const { channel, type = 'chat', prompt, query } = options;

  // Chat runs are now message-driven - just notify the worker
  if (type === 'chat') {
    console.log(`[triggerAgentRun] Chat run requested, notifying worker (channel=${channel || 'N/A'})`);
    queueWorker.notifyMessageArrived(channel);
    return null; // No queue ID for message-driven runs
  }

  // Cron runs still use the queue
  const queuedRun = await queueManager.enqueue({
    type,
    channel,
    query,
    prompt,
  });

  // Wake worker immediately
  queueWorker.notify();

  console.log(`[triggerAgentRun] Enqueued cron run: queueId=${queuedRun.id}`);

  return queuedRun.id;
}

// Re-export hasUnprocessedMessages for use in other modules
export { hasUnprocessedMessages };
