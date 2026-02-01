import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { SERVER_CONFIG } from '@singularity/shared';
import { registerChatRoutes } from './api/chat.js';
import { registerFilesRoutes } from './api/files.js';
import { registerAgentRoutes } from './api/agent.js';
import { registerOutputsRoutes } from './api/outputs.js';
import { registerDebugRoutes } from './api/debug.js';
import { setupWebSocket } from './ws/events.js';
import { startFileWatcher } from './watcher/files.js';
import { startTelegramBot } from './channels/telegram.js';
import path from 'path';
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
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Setup WebSocket first (before routes)
  const wsManager = setupWebSocket(fastify);

  // Register API routes (now they can use wsManager)
  await registerChatRoutes(fastify, wsManager);
  await registerFilesRoutes(fastify);
  await registerAgentRoutes(fastify);
  await registerOutputsRoutes(fastify);
  await registerDebugRoutes(fastify);

  // Start file watcher
  startFileWatcher(wsManager);

  // Start Telegram bot (if configured)
  if (process.env.TELEGRAM_BOT_TOKEN) {
    startTelegramBot(wsManager);
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
