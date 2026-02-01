import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { Channel } from '@singularity/shared';
import { getAllRecentConversations, getRecentMessages } from '../conversation.js';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

interface RunHistoryEntry {
  runId: string;
  timestamp: string;
  session_id: string;
  type: string;
  channel: string | null;
  prompt: string;
  duration_seconds: number;
  exit_code: number;
  cost_usd: number;
  inputFile: string;
  outputFile: string;
  readableFile: string;
}

interface RunDetails extends RunHistoryEntry {
  inputContent?: string;
  outputContent?: string;
  readableContent?: string;
}

async function getRecentRuns(limit: number = 10): Promise<RunHistoryEntry[]> {
  const basePath = getBasePath();
  const historyPath = path.join(basePath, 'state', 'run-history.jsonl');

  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    const runs = lines.map(line => JSON.parse(line) as RunHistoryEntry);

    // Return most recent runs first
    return runs.reverse().slice(0, limit);
  } catch {
    return [];
  }
}

async function getRunDetails(runId: string): Promise<RunDetails | null> {
  const basePath = getBasePath();
  const historyPath = path.join(basePath, 'state', 'run-history.jsonl');

  try {
    const content = await fs.readFile(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());

    for (const line of lines) {
      const run = JSON.parse(line) as RunHistoryEntry;
      if (run.runId === runId) {
        const details: RunDetails = { ...run };

        // Try to read input file
        try {
          details.inputContent = await fs.readFile(run.inputFile, 'utf-8');
        } catch {
          // File not found
        }

        // Try to read output file
        try {
          details.outputContent = await fs.readFile(run.outputFile, 'utf-8');
        } catch {
          // File not found
        }

        // Try to read readable file
        try {
          details.readableContent = await fs.readFile(run.readableFile, 'utf-8');
        } catch {
          // File not found
        }

        return details;
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function registerDebugRoutes(fastify: FastifyInstance) {
  // GET /api/debug/conversations - View all recent conversations across channels
  fastify.get<{
    Querystring: { limit?: string };
  }>('/api/debug/conversations', async (request) => {
    const limit = parseInt(request.query.limit || '20');
    const conversations = await getAllRecentConversations(limit);
    return conversations;
  });

  // GET /api/debug/conversations/:channel - View recent conversation for a specific channel
  fastify.get<{
    Params: { channel: Channel };
    Querystring: { limit?: string };
  }>('/api/debug/conversations/:channel', async (request, reply) => {
    const { channel } = request.params;
    const limit = parseInt(request.query.limit || '50');

    if (channel !== 'web' && channel !== 'telegram') {
      reply.code(400).send({ error: 'Invalid channel. Must be "web" or "telegram".' });
      return;
    }

    const messages = await getRecentMessages(channel, limit);
    return { channel, messages };
  });

  // GET /api/debug/runs - View recent agent runs
  fastify.get<{
    Querystring: { limit?: string };
  }>('/api/debug/runs', async (request) => {
    const limit = parseInt(request.query.limit || '10');
    const runs = await getRecentRuns(limit);
    return { runs };
  });

  // GET /api/debug/runs/:id - View specific run details with full input/output
  fastify.get<{
    Params: { id: string };
  }>('/api/debug/runs/:id', async (request, reply) => {
    const { id } = request.params;
    const run = await getRunDetails(id);

    if (!run) {
      reply.code(404).send({ error: 'Run not found' });
      return;
    }

    return run;
  });

  // GET /api/debug/runs/:id/input - Get just the input for a run
  fastify.get<{
    Params: { id: string };
  }>('/api/debug/runs/:id/input', async (request, reply) => {
    const { id } = request.params;
    const run = await getRunDetails(id);

    if (!run) {
      reply.code(404).send({ error: 'Run not found' });
      return;
    }

    if (!run.inputContent) {
      reply.code(404).send({ error: 'Input file not found' });
      return;
    }

    reply.type('text/markdown').send(run.inputContent);
  });

  // GET /api/debug/runs/:id/output - Get just the readable output for a run
  fastify.get<{
    Params: { id: string };
  }>('/api/debug/runs/:id/output', async (request, reply) => {
    const { id } = request.params;
    const run = await getRunDetails(id);

    if (!run) {
      reply.code(404).send({ error: 'Run not found' });
      return;
    }

    if (!run.readableContent) {
      reply.code(404).send({ error: 'Output file not found' });
      return;
    }

    reply.type('text/markdown').send(run.readableContent);
  });
}
