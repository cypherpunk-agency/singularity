import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { AgentOutput } from '@singularity/shared';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

function getOutputDir(): string {
  return path.join(getBasePath(), 'logs', 'agent-output');
}

export async function registerOutputsRoutes(fastify: FastifyInstance) {
  // List agent outputs
  fastify.get<{
    Querystring: { limit?: string };
    Reply: { outputs: AgentOutput[] };
  }>('/api/outputs', async (request) => {
    const limit = parseInt(request.query.limit || '20');
    const outputDir = getOutputDir();

    try {
      const files = await fs.readdir(outputDir);
      const jsonFiles = files
        .filter(f => f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const outputs: AgentOutput[] = [];
      for (const file of jsonFiles) {
        try {
          const content = await fs.readFile(path.join(outputDir, file), 'utf-8');
          const data = JSON.parse(content);

          outputs.push({
            id: file.replace('.json', ''),
            timestamp: data.timestamp || file.replace('.json', ''),
            model: data.model || 'unknown',
            result: data.result || data.message || '',
            costUsd: data.cost_usd || data.costUsd,
            durationMs: data.duration_ms || data.durationMs,
            sessionId: data.session_id || data.sessionId,
          });
        } catch {
          // Skip invalid files
        }
      }

      return { outputs };
    } catch {
      return { outputs: [] };
    }
  });

  // Get specific output
  fastify.get<{
    Params: { id: string };
    Reply: AgentOutput | { error: string };
  }>('/api/outputs/:id', async (request, reply) => {
    const { id } = request.params;
    const outputDir = getOutputDir();

    // Security: sanitize ID
    const sanitizedId = path.basename(id).replace(/[^a-zA-Z0-9_\-]/g, '');
    const filePath = path.join(outputDir, `${sanitizedId}.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      return {
        id: sanitizedId,
        timestamp: data.timestamp || sanitizedId,
        model: data.model || 'unknown',
        result: data.result || data.message || '',
        costUsd: data.cost_usd || data.costUsd,
        durationMs: data.duration_ms || data.durationMs,
        sessionId: data.session_id || data.sessionId,
      };
    } catch {
      reply.code(404).send({ error: 'Output not found' });
    }
  });
}
