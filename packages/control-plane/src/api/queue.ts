import { FastifyInstance } from 'fastify';
import { EnqueueRequest, EnqueueResponse, QueueStatusResponse, QueuedRun } from '@singularity/shared';
import { queueManager } from '../queue/manager.js';
import { queueWorker } from '../queue/worker.js';

export async function registerQueueRoutes(fastify: FastifyInstance) {
  // Enqueue a new run
  fastify.post<{
    Body: EnqueueRequest;
    Reply: EnqueueResponse;
  }>('/api/queue/enqueue', async (request, reply) => {
    const { type, channel, query, prompt } = request.body;

    if (!type || (type !== 'chat' && type !== 'cron')) {
      reply.code(400).send({ success: false, queueId: '', position: undefined });
      return;
    }

    try {
      const queuedRun = await queueManager.enqueue({
        type,
        channel,
        query,
        prompt,
      });

      // Notify worker to check for new work
      queueWorker.notify();

      const position = await queueManager.getPosition(queuedRun.id);

      return {
        success: true,
        queueId: queuedRun.id,
        position: position ?? undefined,
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to enqueue run');
      reply.code(500).send({ success: false, queueId: '', position: undefined });
    }
  });

  // Get queue status
  fastify.get<{
    Reply: QueueStatusResponse;
  }>('/api/queue/status', async () => {
    const pending = await queueManager.getPending();
    const processing = await queueManager.getProcessing();
    const recentCompleted = await queueManager.getRecentCompleted(5);

    return {
      pendingCount: pending.length,
      processingRun: processing,
      recentCompleted,
    };
  });

  // List pending runs
  fastify.get<{
    Reply: { runs: QueuedRun[] };
  }>('/api/queue', async () => {
    const runs = await queueManager.getPending();
    return { runs };
  });

  // Get specific run by ID
  fastify.get<{
    Params: { id: string };
    Reply: QueuedRun | { error: string };
  }>('/api/queue/:id', async (request, reply) => {
    const { id } = request.params;
    const run = await queueManager.getById(id);

    if (!run) {
      reply.code(404).send({ error: 'Run not found' });
      return;
    }

    return run;
  });
}
