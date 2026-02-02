import Fastify from 'fastify';
import JobDatabase from './database.js';
import { registerJobTrackerRoutes } from './api/routes.js';

const PORT = parseInt(process.env.JOB_TRACKER_PORT || '3002');

async function start() {
  const fastify = Fastify({
    logger: true
  });

  // Initialize database
  const db = new JobDatabase();

  // Enable CORS for development
  fastify.addHook('onRequest', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
      reply.code(200).send();
    }
  });

  // Register routes
  await registerJobTrackerRoutes(fastify, db);

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'job-tracker' };
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    db.close();
    fastify.close().then(() => {
      console.log('Job tracker shut down gracefully');
      process.exit(0);
    });
  });

  try {
    await fastify.listen({ port: PORT, host: '0.0.0.0' });
    console.log(`Job tracker API listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    db.close();
    process.exit(1);
  }
}

start();
