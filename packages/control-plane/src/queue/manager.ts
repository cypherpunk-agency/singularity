import { v4 as uuidv4 } from 'uuid';
import { QueuedRun, RunType, Channel } from '@singularity/shared';
import { readQueue, appendToQueue, updateQueueEntry, cleanupQueue } from './storage.js';

export interface EnqueueOptions {
  type: RunType;
  channel?: Channel;
  query?: string;
  prompt?: string;
}

/**
 * Queue manager for agent runs.
 * Handles enqueueing, dequeueing, and tracking runs.
 */
export class QueueManager {
  /**
   * Add a new run to the queue.
   * Returns the queued run with its ID.
   */
  async enqueue(options: EnqueueOptions): Promise<QueuedRun> {
    const { type, channel, query, prompt } = options;

    // Determine priority: chat=1 (higher), cron=2 (lower)
    const priority = type === 'chat' ? 1 : 2;

    const queuedRun: QueuedRun = {
      id: uuidv4(),
      type,
      channel,
      query,
      prompt,
      priority,
      status: 'pending',
      enqueuedAt: new Date().toISOString(),
    };

    await appendToQueue(queuedRun);
    console.log(`[QueueManager] Enqueued run: id=${queuedRun.id}, type=${type}, channel=${channel || 'N/A'}, priority=${priority}`);

    return queuedRun;
  }

  /**
   * Get the next pending run from the queue.
   * Returns the highest priority (lowest number) pending run, FIFO within same priority.
   * Returns null if no pending runs.
   */
  async dequeue(): Promise<QueuedRun | null> {
    const entries = await readQueue();
    const pending = entries.filter(e => e.status === 'pending');

    if (pending.length === 0) {
      return null;
    }

    // Sort by priority (ascending), then by enqueuedAt (ascending)
    pending.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
    });

    return pending[0];
  }

  /**
   * Mark a run as processing.
   */
  async markProcessing(id: string, runId: string): Promise<QueuedRun | null> {
    const updated = await updateQueueEntry(id, {
      status: 'processing',
      startedAt: new Date().toISOString(),
      runId,
    });

    if (updated) {
      console.log(`[QueueManager] Run started: id=${id}, runId=${runId}`);
    }

    return updated;
  }

  /**
   * Mark a run as completed.
   */
  async markCompleted(id: string): Promise<QueuedRun | null> {
    const updated = await updateQueueEntry(id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });

    if (updated) {
      console.log(`[QueueManager] Run completed: id=${id}`);
    }

    // Cleanup old entries periodically
    await cleanupQueue(50);

    return updated;
  }

  /**
   * Mark a run as failed.
   */
  async markFailed(id: string, error: string): Promise<QueuedRun | null> {
    const updated = await updateQueueEntry(id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    });

    if (updated) {
      console.log(`[QueueManager] Run failed: id=${id}, error=${error}`);
    }

    return updated;
  }

  /**
   * Get all pending runs.
   */
  async getPending(): Promise<QueuedRun[]> {
    const entries = await readQueue();
    return entries
      .filter(e => e.status === 'pending')
      .sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return new Date(a.enqueuedAt).getTime() - new Date(b.enqueuedAt).getTime();
      });
  }

  /**
   * Get the currently processing run (if any).
   */
  async getProcessing(): Promise<QueuedRun | null> {
    const entries = await readQueue();
    return entries.find(e => e.status === 'processing') || null;
  }

  /**
   * Get recent completed/failed runs.
   */
  async getRecentCompleted(limit: number = 10): Promise<QueuedRun[]> {
    const entries = await readQueue();
    return entries
      .filter(e => e.status === 'completed' || e.status === 'failed')
      .sort((a, b) => new Date(b.completedAt || b.enqueuedAt).getTime() - new Date(a.completedAt || a.enqueuedAt).getTime())
      .slice(0, limit);
  }

  /**
   * Get a specific run by ID.
   */
  async getById(id: string): Promise<QueuedRun | null> {
    const entries = await readQueue();
    return entries.find(e => e.id === id) || null;
  }

  /**
   * Get the position of a run in the pending queue.
   * Returns 0 if processing, null if not found or completed.
   */
  async getPosition(id: string): Promise<number | null> {
    const entries = await readQueue();
    const entry = entries.find(e => e.id === id);

    if (!entry) {
      return null;
    }

    if (entry.status === 'processing') {
      return 0;
    }

    if (entry.status !== 'pending') {
      return null;
    }

    const pending = await this.getPending();
    const position = pending.findIndex(e => e.id === id);
    return position >= 0 ? position + 1 : null;
  }
}

// Singleton instance
export const queueManager = new QueueManager();
