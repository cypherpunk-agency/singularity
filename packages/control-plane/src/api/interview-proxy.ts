import { FastifyInstance } from 'fastify';
import { proxyRequest } from './proxy.js';

const INTERVIEW_API_URL = process.env.INTERVIEW_API_URL || 'http://localhost:3003';

export async function registerInterviewProxyRoutes(fastify: FastifyInstance) {
  // Proxy all /api/interview/* requests to the Interview Prep API
  fastify.all('/api/interview/*', async (request, reply) => {
    try {
      const result = await proxyRequest(
        {
          method: request.method,
          url: request.url,
          headers: request.headers as Record<string, string | string[] | undefined>,
          body: request.body,
        },
        {
          targetUrl: INTERVIEW_API_URL,
          stripPrefix: '/api/interview',
        }
      );

      // Set response headers
      for (const [key, value] of Object.entries(result.headers)) {
        reply.header(key, value);
      }

      return reply.code(result.status).send(result.body);
    } catch (error) {
      fastify.log.error(error, 'Interview API proxy error');
      return reply.code(502).send({
        error: 'Bad Gateway',
        message: 'Failed to connect to Interview Prep API',
      });
    }
  });
}
