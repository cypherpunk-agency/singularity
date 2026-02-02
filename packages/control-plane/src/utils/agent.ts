import { execSync } from 'child_process';
import { Channel, RunType, QueuedRun } from '@singularity/shared';
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
 * Enqueues the run and returns the queue ID.
 * The queue worker will process it sequentially.
 *
 * For chat runs, deduplicates by channel - if there's already a pending or
 * processing chat run for the same channel, returns null instead of enqueueing.
 * This prevents message storms (e.g., multiple Telegram messages arriving at once)
 * from creating duplicate runs.
 */
export async function triggerAgentRun(options: TriggerOptions = {}): Promise<string | null> {
  const { channel, type = 'chat', prompt, query } = options;

  // For chat runs, check if there's already a pending/processing run for this channel
  if (type === 'chat') {
    const pending = await queueManager.getPending();
    const processing = await queueManager.getProcessing();
    const allActive = [...pending, processing].filter(Boolean) as QueuedRun[];

    // Find existing run for same channel (or any chat run if no channel specified)
    const existing = allActive.find(run =>
      run.type === 'chat' &&
      (channel ? run.channel === channel : true)
    );

    if (existing) {
      console.log(`[triggerAgentRun] Skipping duplicate: existing ${existing.status} run ${existing.id} for channel=${channel || 'any'}`);
      return null;
    }
  }

  // Enqueue the run
  const queuedRun = await queueManager.enqueue({
    type,
    channel,
    query,
    prompt,
  });

  // Wake worker immediately
  queueWorker.notify();

  console.log(`[triggerAgentRun] Enqueued run: queueId=${queuedRun.id}, type=${type}, channel=${channel || 'N/A'}`);

  return queuedRun.id;
}

// Re-export hasUnprocessedMessages for use in other modules
export { hasUnprocessedMessages };
