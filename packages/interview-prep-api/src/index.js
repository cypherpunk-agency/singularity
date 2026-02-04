import Fastify from 'fastify';
import cors from '@fastify/cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

import topicsRoutes from './routes/topics.js';
import sessionsRoutes from './routes/sessions.js';
import problemsRoutes from './routes/problems.js';
import analyticsRoutes from './routes/analytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure data directory exists
mkdirSync(join(__dirname, '../data'), { recursive: true });

const fastify = Fastify({
  logger: true
});

// Enable CORS
await fastify.register(cors, {
  origin: true
});

// Health check
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', service: 'interview-prep-api' };
});

// Register routes
await fastify.register(topicsRoutes);
await fastify.register(sessionsRoutes);
await fastify.register(problemsRoutes);
await fastify.register(analyticsRoutes);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3003, host: '0.0.0.0' });
    console.log('Interview Prep API running on http://0.0.0.0:3003');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
