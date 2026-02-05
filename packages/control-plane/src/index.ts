import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { SERVER_CONFIG } from '@singularity/shared';
import { registerChatRoutes } from './api/chat.js';
import { registerFilesRoutes } from './api/files.js';
import { registerAgentRoutes } from './api/agent.js';
import { registerOutputsRoutes } from './api/outputs.js';
import { registerSessionsRoutes } from './api/sessions.js';
import { registerDebugRoutes } from './api/debug.js';
import { registerQueueRoutes } from './api/queue.js';
import { registerInterviewProxyRoutes } from './api/interview-proxy.js';
import { registerJobsProxyRoutes } from './api/jobs-proxy.js';
import { registerTelegramFilesRoutes } from './api/telegram-files.js';
import { registerUsageRoutes } from './api/usage.js';
import { getVectorServiceStatus } from './services/vector-client.js';
import { setupWebSocket } from './ws/events.js';
import { startFileWatcher } from './watcher/files.js';
import { startTelegramBot } from './channels/telegram.js';
import { queueWorker } from './queue/worker.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.env.CONTROL_PLANE_PORT || String(SERVER_CONFIG.CONTROL_PLANE_PORT));
const HOST = process.env.CONTROL_PLANE_HOST || '0.0.0.0';

async function main() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // Register plugins
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576, // 1MB
    },
  });

  // Simple token auth middleware
  const authToken = process.env.CONTROL_PLANE_TOKEN;
  if (authToken) {
    fastify.addHook('onRequest', async (request, reply) => {
      // Skip auth for WebSocket upgrade and health check
      if (request.url === '/ws' || request.url === '/health') {
        return;
      }

      const token = request.headers.authorization?.replace('Bearer ', '');
      if (token !== authToken) {
        reply.code(401).send({ error: 'Unauthorized' });
      }
    });
  }

  // Health check
  fastify.get('/health', async () => {
    const vectorStatus = await getVectorServiceStatus();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: { vector: vectorStatus },
    };
  });

  // Setup WebSocket first (before routes)
  const wsManager = setupWebSocket(fastify);

  // Register API routes (now they can use wsManager)
  await registerChatRoutes(fastify, wsManager);
  await registerFilesRoutes(fastify);
  await registerAgentRoutes(fastify);
  await registerOutputsRoutes(fastify);
  await registerSessionsRoutes(fastify);
  await registerDebugRoutes(fastify);
  await registerQueueRoutes(fastify);
  await registerInterviewProxyRoutes(fastify);
  await registerJobsProxyRoutes(fastify);
  await registerTelegramFilesRoutes(fastify);
  await registerUsageRoutes(fastify);

  // Start file watcher
  startFileWatcher(wsManager);

  // Start queue worker and set WebSocket manager
  queueWorker.setWSManager(wsManager);
  queueWorker.start();

  // Start Telegram bot (if configured)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await startTelegramBot(wsManager);
  }

  // Serve static UI files in production
  const uiDistPath = path.join(__dirname, '../../ui/dist');
  try {
    await fastify.register(fastifyStatic, {
      root: uiDistPath,
      prefix: '/',
      decorateReply: false,
    });
    fastify.log.info(`Serving UI from ${uiDistPath}`);

    // SPA fallback for client-side routing
    const indexHtml = fs.readFileSync(path.join(uiDistPath, 'index.html'), 'utf-8');
    fastify.setNotFoundHandler(async (request, reply) => {
      if (!request.url.startsWith('/api') && !request.url.startsWith('/ws') && !request.url.startsWith('/health')) {
        return reply.type('text/html').send(indexHtml);
      }
      return reply.code(404).send({ error: 'Not found' });
    });
  } catch {
    fastify.log.info('UI dist not found, skipping static file serving');
  }

  // Start server
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Singularity Control Plane                       ║
╠═══════════════════════════════════════════════════════════╣
║  API:       http://${HOST}:${PORT}
║  WebSocket: ws://${HOST}:${PORT}/ws
║  Health:    http://${HOST}:${PORT}/health
╚═══════════════════════════════════════════════════════════╝
`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
