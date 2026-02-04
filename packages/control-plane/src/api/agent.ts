import { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { AgentStatus, RunHistoryEntry, TriggerRunRequest, TriggerRunResponse, Channel, RunType } from '@singularity/shared';
import { getBasePath, triggerAgentRun } from '../utils/agent.js';
import { prepareContext, PreparedContext } from '../context/index.js';
import { queueManager } from '../queue/manager.js';

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

    // Check if agent is currently running via queue (any channel)
    const processingRuns = await queueManager.getProcessingRuns();
    const isRunning = processingRuns.web || processingRuns.telegram || processingRuns.cron;
    const status: 'idle' | 'running' | 'error' = isRunning ? 'running' : 'idle';

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
  }>('/api/agent/run', async (request, reply) => {
    try {
      const { prompt, channel, type = 'cron' } = request.body;
      const queueId = await triggerAgentRun({ prompt, channel, type, query: prompt });

      if (queueId) {
        return { success: true, message: `Agent ${type} run queued (ID: ${queueId.slice(0, 8)}...)${channel ? ` for ${channel}` : ''}` };
      } else {
        return { success: true, message: `Agent ${type} run already pending${channel ? ` for ${channel}` : ''}` };
      }
    } catch (error) {
      fastify.log.error(error, 'Failed to trigger agent run');
      reply.code(500).send({ success: false, message: 'Failed to trigger agent run' });
    }
  });

  // Get prepared context for agent run
  fastify.get<{
    Querystring: {
      type?: RunType;
      channel?: Channel;
      query?: string;
      tokenBudget?: string;
    };
    Reply: PreparedContext;
  }>('/api/agent/context', async (request) => {
    const { type = 'chat', channel = 'web', query, tokenBudget } = request.query;

    const context = await prepareContext({
      type,
      channel,
      query,
      tokenBudget: tokenBudget ? parseInt(tokenBudget) : undefined,
    });

    return context;
  });

  // Request service restart (rebuild control-plane + UI and restart)
  fastify.post<{
    Reply: { status: string; message: string };
  }>('/api/agent/restart', async (_request, reply) => {
    const basePath = getBasePath();
    const stateDir = path.join(basePath, 'state');
    const restartFile = path.join(stateDir, 'restart-requested');

    try {
      // Check if any agent runs are currently processing
      const processingRuns = await queueManager.getProcessingRuns();
      const activeRuns = [processingRuns.web, processingRuns.telegram, processingRuns.cron].filter(Boolean);

      if (activeRuns.length > 0) {
        // Queue the restart to happen after all current runs complete
        queueManager.setPendingRestart(true);
        const runIds = activeRuns.map(r => r!.id.slice(0, 8)).join(', ');
        fastify.log.info('[Agent API] Restart queued, waiting for %d run(s) to complete: %s', activeRuns.length, runIds);

        return {
          status: 'restart_queued',
          message: `Restart will occur after ${activeRuns.length} active run(s) complete.`,
        };
      }

      // No run in progress - restart immediately
      await fs.mkdir(stateDir, { recursive: true });
      await fs.writeFile(restartFile, new Date().toISOString());
      fastify.log.info('[Agent API] Restart requested, file written to: %s', restartFile);

      return {
        status: 'restart_scheduled',
        message: 'Services will rebuild (control-plane + UI) and restart. This may take 30-60 seconds.',
      };
    } catch (error) {
      fastify.log.error(error, 'Failed to write restart request file');
      reply.code(500).send({
        status: 'error',
        message: 'Failed to schedule restart',
      });
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

      // Parse multi-line JSON entries (split on }\n{ pattern and handle first/last entries)
      const runs: RunHistoryEntry[] = [];
      let currentEntry = '';
      let braceDepth = 0;

      for (const char of content) {
        currentEntry += char;
        if (char === '{') braceDepth++;
        if (char === '}') braceDepth--;

        // When we close a complete JSON object, parse it
        if (braceDepth === 0 && currentEntry.trim()) {
          try {
            const raw = JSON.parse(currentEntry.trim());
            runs.push({
              timestamp: raw.timestamp,
              sessionId: raw.session_id || raw.sessionId,
              duration: (raw.duration_seconds || raw.duration || 0) * 1000, // Convert seconds to ms
              success: raw.exit_code === 0 || raw.success === true,
              tokensUsed: raw.tokensUsed || raw.tokens_used,
              cost: raw.cost_usd || raw.cost,
              output: raw.readableFile || raw.readable_file || raw.output,
            } as RunHistoryEntry);
          } catch (parseError) {
            // Skip invalid entries
          }
          currentEntry = '';
        }
      }

      return { runs: runs.reverse().slice(0, limit) };
    } catch {
      return { runs: [] };
    }
  });
}
