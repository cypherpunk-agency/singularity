import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { AgentStatus, RunHistoryEntry, TriggerRunRequest, TriggerRunResponse } from '@singularity/shared';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

export async function registerAgentRoutes(fastify: FastifyInstance) {
  // Get agent status
  fastify.get<{
    Reply: AgentStatus;
  }>('/api/status', async () => {
    const basePath = getBasePath();

    // Read session ID
    let sessionId: string | null = null;
    try {
      sessionId = (await fs.readFile(path.join(basePath, 'state', 'session-id.txt'), 'utf-8')).trim();
    } catch {
      // No session file
    }

    // Read last run from history
    let lastRun: RunHistoryEntry | null = null;
    try {
      const historyPath = path.join(basePath, 'state', 'run-history.jsonl');
      const content = await fs.readFile(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      if (lines.length > 0) {
        lastRun = JSON.parse(lines[lines.length - 1]);
      }
    } catch {
      // No history file
    }

    // Check if agent is currently running by looking for lock file
    let status: 'idle' | 'running' | 'error' = 'idle';
    try {
      await fs.access(path.join(basePath, 'state', 'agent.lock'));
      status = 'running';
    } catch {
      // No lock file, agent is idle
    }

    // Calculate next scheduled run (next hour)
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(0);
    nextHour.setSeconds(0);
    nextHour.setMilliseconds(0);
    nextHour.setHours(nextHour.getHours() + 1);

    return {
      status,
      lastRun: lastRun?.timestamp || null,
      lastRunDuration: lastRun?.duration || null,
      lastRunSuccess: lastRun?.success ?? null,
      sessionId,
      nextScheduledRun: nextHour.toISOString(),
    };
  });

  // Trigger immediate agent run
  fastify.post<{
    Body: TriggerRunRequest;
    Reply: TriggerRunResponse;
  }>('/api/agent/run', async (_request, reply) => {
    const basePath = getBasePath();

    // Check if agent is already running
    try {
      await fs.access(path.join(basePath, 'state', 'agent.lock'));
      return { success: false, message: 'Agent is already running' };
    } catch {
      // Good, agent is not running
    }

    // Trigger the agent script with optional prompt
    try {
      const runAgentScript = path.join(basePath, 'scripts', 'run-agent.sh');
      const prompt = request.body.prompt || 'Process any pending messages.';
      const proc = spawn('bash', [runAgentScript, prompt], {
        cwd: basePath,
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();

      return { success: true, message: 'Agent run triggered' };
    } catch (error) {
      fastify.log.error(error, 'Failed to trigger agent run');
      reply.code(500).send({ success: false, message: 'Failed to trigger agent run' });
    }
  });

  // Get run history
  fastify.get<{
    Querystring: { limit?: string };
    Reply: { runs: RunHistoryEntry[] };
  }>('/api/runs', async (request) => {
    const limit = parseInt(request.query.limit || '50');
    const basePath = getBasePath();

    try {
      const historyPath = path.join(basePath, 'state', 'run-history.jsonl');
      const content = await fs.readFile(historyPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l.trim());
      const runs = lines
        .map(line => JSON.parse(line) as RunHistoryEntry)
        .reverse()
        .slice(0, limit);

      return { runs };
    } catch {
      return { runs: [] };
    }
  });
}
