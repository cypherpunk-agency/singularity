/**
 * Usage API routes - provides endpoints for usage data and cost tracking.
 */

import { FastifyInstance } from 'fastify';
import {
  getUsageToday,
  getUsageThisMonth,
  getUsageSince,
  getUsageEntries,
} from '../services/usage-tracker.js';

export async function registerUsageRoutes(fastify: FastifyInstance) {
  // Get today's usage summary
  fastify.get('/api/usage/today', async () => {
    return getUsageToday();
  });

  // Get this month's usage summary
  fastify.get('/api/usage/month', async () => {
    return getUsageThisMonth();
  });

  // Get usage since a specific date
  fastify.get<{ Params: { date: string } }>('/api/usage/since/:date', async (request) => {
    const { date } = request.params;
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      throw { statusCode: 400, message: 'Invalid date format. Use YYYY-MM-DD' };
    }
    return getUsageSince(date);
  });

  // Get raw usage entries with pagination
  fastify.get<{ Querystring: { limit?: string; offset?: string } }>(
    '/api/usage/entries',
    async (request) => {
      const limit = parseInt(request.query.limit || '100', 10);
      const offset = parseInt(request.query.offset || '0', 10);
      return { entries: getUsageEntries(limit, offset) };
    }
  );
}
