import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { QueuedRun } from '@singularity/shared';
import { queueManager } from './manager.js';
import { prepareContext } from '../context/index.js';
import { getUnprocessedMessages, markMessagesAsProcessed } from '../conversation.js';
import { extractAndRouteResponse } from '../response/extractor.js';
import { WSManager } from '../ws/events.js';

interface OutputValidation {
  isSuccess: boolean;
  errorMessage?: string;
}

/**
 * Validate agent output for semantic errors (e.g., API Error 500).
 * Even if the process exits with code 0, the output may contain error info.
 */
async function validateAgentOutput(outputFile: string): Promise<OutputValidation> {
  try {
    const content = await fs.readFile(outputFile, 'utf-8');
    const output = JSON.parse(content);

    // Check for explicit error in output
    if (output.subtype === 'error' || output.is_error === true) {
      return {
        isSuccess: false,
        errorMessage: output.result || 'API returned error',
      };
    }

    return { isSuccess: true };
  } catch {
    // Parse error or missing file - let existing logic handle
    return { isSuccess: true };
  }
}

/**
 * Generate a run ID in the format YYYYMMDD-HHMMSS
 */
function generateRunId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Get the base path for the application.
 */
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

/**
 * Write the restart request file to trigger a service restart.
 */
async function writeRestartFile(): Promise<void> {
  const basePath = getBasePath();
  const stateDir = path.join(basePath, 'state');
  const restartFile = path.join(stateDir, 'restart-requested');
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(restartFile, new Date().toISOString());
  console.log('[QueueWorker] Restart file written to:', restartFile);
}

/**
 * Queue worker that processes runs sequentially.
 */
export class QueueWorker {
  private processing: boolean = false;
  private wsManager: WSManager | null = null;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Set the WebSocket manager for broadcasting events.
   */
  setWSManager(wsManager: WSManager): void {
    this.wsManager = wsManager;
  }

  /**
   * Start the worker. Begins periodic checking and processes any pending runs.
   */
  start(): void {
    console.log('[QueueWorker] Starting worker...');

    // Check for pending runs periodically (every 5 seconds)
    this.checkInterval = setInterval(() => {
      this.processNext();
    }, 5000);

    // Also process immediately on start
    this.processNext();
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    console.log('[QueueWorker] Worker stopped');
  }

  /**
   * Notify the worker to check for new work immediately.
   */
  notify(): void {
    setImmediate(() => this.processNext());
  }

  /**
   * Check if the worker is currently processing a run.
   */
  isProcessing(): boolean {
    return this.processing;
  }

  /**
   * Process the next run in the queue.
   */
  async processNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    const next = await queueManager.dequeue();
    if (!next) {
      return;
    }

    this.processing = true;

    try {
      await this.executeRun(next);
      await queueManager.markCompleted(next.id);
    } catch (error: any) {
      console.error(`[QueueWorker] Run failed: ${error.message}`);
      await queueManager.markFailed(next.id, error.message || 'Unknown error');
    } finally {
      this.processing = false;
      // Check for more work
      setImmediate(() => this.processNext());
    }
  }

  /**
   * Execute a queued run.
   */
  private async executeRun(queuedRun: QueuedRun): Promise<void> {
    const { type, channel, query, prompt } = queuedRun;
    const basePath = getBasePath();
    const runId = generateRunId();

    // Mark as processing
    await queueManager.markProcessing(queuedRun.id, runId);

    // Get unprocessed messages for context (chat mode only)
    let messageIds: string[] = [];
    if (type === 'chat' && channel) {
      const unprocessedMessages = await getUnprocessedMessages(channel);
      messageIds = unprocessedMessages.map(m => m.id);
      if (messageIds.length > 0) {
        console.log(`[QueueWorker] Found ${messageIds.length} unprocessed messages in ${channel}`);
      }
    }

    // Spawn the agent script with appropriate arguments
    const runAgentScript = path.join(basePath, 'scripts', 'run-agent.sh');

    const args: string[] = [runAgentScript];

    // Add type argument
    args.push('--type', type);

    // Add channel argument if provided (only relevant for chat type)
    if (channel && type === 'chat') {
      args.push('--channel', channel);
    }

    // Pass runId to the script
    args.push('--run-id', runId);

    // Use intelligent context preparation
    try {
      const context = await prepareContext({
        type,
        channel,
        query: query || prompt,
        focusMessageIds: messageIds,
      });

      // Write system prompt to temp file
      const tempDir = path.join(basePath, 'state', 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      const systemPromptFile = path.join(tempDir, `context-${Date.now()}.txt`);
      await fs.writeFile(systemPromptFile, context.systemPrompt);

      args.push('--system-prompt-file', systemPromptFile);
      args.push('--user-prompt', context.userPrompt);

      console.log(`[QueueWorker] Using prepared context: ${context.metadata.totalTokensEstimate} tokens, ` +
        `${context.metadata.memorySnippetsIncluded} memory snippets, ` +
        `${context.metadata.conversationMessagesIncluded} conversation messages, ` +
        `vectorSearch=${context.metadata.vectorSearchUsed}`);
    } catch (error) {
      console.error('[QueueWorker] Failed to prepare context, falling back to bash assembly:', error);
      // Fall through to legacy prompt handling
      if (prompt) {
        args.push('--prompt', prompt);
      }
    }

    // Broadcast agent:started
    if (this.wsManager) {
      let sessionId = 'unknown';
      try {
        sessionId = (await fs.readFile(path.join(basePath, 'state', 'session-id.txt'), 'utf-8')).trim();
      } catch {
        // Session file may not exist yet
      }
      this.wsManager.broadcastAgentStarted(sessionId, runId, channel);
    }

    // Execute the script and wait for completion
    await new Promise<void>((resolve, reject) => {
      console.log(`[QueueWorker] Spawning agent: runId=${runId}, type=${type}, channel=${channel || 'N/A'}`);

      const proc = spawn('bash', args, {
        cwd: basePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: '/home/agent' },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          console.error(`[QueueWorker] Agent failed with code ${code}: runId=${runId}`);
          console.error(`[QueueWorker] stderr: ${stderr.slice(-500)}`);
          reject(new Error(`Agent exited with code ${code}`));
          return;
        }

        // Process succeeded - validate output for semantic errors
        const outputFile = path.join(basePath, 'logs', 'agent-output', `${runId}.json`);
        const validation = await validateAgentOutput(outputFile);

        if (!validation.isSuccess) {
          console.error(`[QueueWorker] Agent returned error: ${validation.errorMessage}`);
          reject(new Error(validation.errorMessage || 'Agent returned error'));
          return;
        }

        console.log(`[QueueWorker] Agent completed successfully: runId=${runId}`);
        resolve();
      });

      proc.on('error', (error) => {
        console.error(`[QueueWorker] Failed to spawn agent: ${error.message}`);
        reject(error);
      });
    });

    // Mark messages as processed after successful completion
    if (messageIds.length > 0 && channel) {
      await markMessagesAsProcessed(channel, messageIds);
      console.log(`[QueueWorker] Marked ${messageIds.length} messages as processed`);
    }

    // Extract and route response for chat runs
    if (type === 'chat' && channel && this.wsManager) {
      try {
        await extractAndRouteResponse({
          runId,
          type,
          channel,
          exit_code: 0,
          outputFile: path.join(basePath, 'logs', 'agent-output', `${runId}.json`),
        }, this.wsManager);
        console.log(`[QueueWorker] Extracted and routed response for ${runId}`);
      } catch (error) {
        console.error(`[QueueWorker] Failed to extract response:`, error);
      }
    }

    // Execute pending restart if requested during this run
    if (queueManager.isPendingRestart()) {
      console.log('[QueueWorker] Executing pending restart');
      queueManager.setPendingRestart(false);
      await writeRestartFile();
    }
  }
}

// Singleton instance
export const queueWorker = new QueueWorker();
