import Fastify from 'fastify';
import cors from '@fastify/cors';
import { workoutRoutes } from './routes/workouts';

const PORT = 3004;
const HOST = '0.0.0.0';

async function start() {
  const fastify = Fastify({
    logger: true,
  });

  // Enable CORS
  await fastify.register(cors, {
    origin: true,
  });

  // Register routes
  await fastify.register(workoutRoutes, { prefix: '/api/fitness' });

  // Health check
  fastify.get('/health', async () => {
    return { status: 'ok', service: 'fitness-api' };
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`🏋️  Fitness API listening on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start();
