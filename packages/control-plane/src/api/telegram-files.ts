import { FastifyInstance } from 'fastify';
import { sendFileToTelegram } from '../channels/telegram-files.js';
import path from 'path';

export async function registerTelegramFilesRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { filePath: string; format?: 'pdf' | 'raw'; caption?: string }
  }>('/api/telegram/send-file', async (request, reply) => {
    const { filePath, format = 'pdf', caption } = request.body;

    if (!filePath) {
      return reply.code(400).send({ error: 'filePath is required' });
    }

    // Security: only allow files within /app/agent/
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith('/app/agent/')) {
      return reply.code(403).send({ error: 'Path not allowed - must be within /app/agent/' });
    }

    try {
      await sendFileToTelegram(filePath, { format, caption });
      return { success: true };
    } catch (error) {
      fastify.log.error(error, 'Failed to send file to Telegram');
      const message = error instanceof Error ? error.message : 'Unknown error';
      return reply.code(500).send({ error: `Failed to send file: ${message}` });
    }
  });
}
