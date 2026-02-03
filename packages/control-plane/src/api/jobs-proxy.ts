import { FastifyInstance } from 'fastify';
import { proxyRequest } from './proxy.js';

const JOB_TRACKER_API_URL = process.env.JOB_TRACKER_API_URL || 'http://localhost:3002';

export async function registerJobsProxyRoutes(fastify: FastifyInstance) {
  // Proxy all /api/jobs-backend/* requests to the Job Tracker API
  // Maps /api/jobs-backend/* -> http://localhost:3002/api/*
  fastify.all('/api/jobs-backend/*', async (request, reply) => {
    try {
      const result = await proxyRequest(
        {
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
          body: request.body,
        },
        {
          targetUrl: JOB_TRACKER_API_URL,
          stripPrefix: '/api/jobs-backend',
          addPrefix: '/api',
        }
      );

      // Set response headers
      for (const [key, value] of Object.entries(result.headers)) {
        reply.header(key, value);
      }

      return reply.code(result.status).send(result.body);
    } catch (error) {
      fastify.log.error(error, 'Job Tracker API proxy error');
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Failed to connect to Job Tracker API',
      });
    }
  });
}
