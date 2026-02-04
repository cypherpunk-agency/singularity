import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { QueuedRun, Channel, Message, LockType } from '@singularity/shared';
import { queueManager } from './manager.js';
import { prepareContext } from '../context/index.js';
import { getUnprocessedMessages, markMessagesAsProcessed } from '../conversation.js';
import { extractAndRouteResponse } from '../response/extractor.js';
import { WSManager } from '../ws/events.js';

// Configuration for stuck job recovery
const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || '1800000'); // 30 min default
const STUCK_THRESHOLD_MS = AGENT_TIMEOUT_MS + 5 * 60 * 1000; // timeout + 5 min buffer
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

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
    // Check file exists and has meaningful content
    const stats = await fs.stat(outputFile);

    if (stats.size < 100) {
      return {
        isSuccess: false,
        errorMessage: `Output file too small (${stats.size} bytes) - agent may not have run`,
      };
    }

    const content = await fs.readFile(outputFile, 'utf-8');

    // Try to parse JSON
    let output;
    try {
      output = JSON.parse(content);
    } catch {
      // Content is not valid JSON - could be error string
      return {
        isSuccess: false,
        errorMessage: `Invalid JSON output: ${content.slice(0, 100)}`,
      };
    }

    // Check for explicit error in output
    if (output.subtype === 'error' || output.is_error === true) {
      return {
        isSuccess: false,
        errorMessage: output.result || 'API returned error',
      };
    }

    // Check required fields exist
    if (!output.type || !output.result) {
      return {
        isSuccess: false,
        errorMessage: 'Output missing required fields (type, result)',
      };
    }

    // Check result is not empty
    if (typeof output.result === 'string' && output.result.trim() === '') {
      return {
        isSuccess: false,
        errorMessage: 'Output has empty result',
      };
    }

    return { isSuccess: true };
  } catch (error: any) {
    // File doesn't exist or can't be read
    return {
      isSuccess: false,
      errorMessage: `Cannot read output file: ${error.message}`,
    };
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
 * Queue worker that processes runs with per-channel locks.
 * Web and telegram channels can run concurrently, cron runs independently.
 */
export class QueueWorker {
  private processingLocks: Map<LockType, boolean> = new Map([
    ['web', false],
    ['telegram', false],
    ['cron', false],
  ]);
  private currentProcesses: Map<LockType, ChildProcess> = new Map();
  private wsManager: WSManager | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private healthInterval: NodeJS.Timeout | null = null;

  /**
   * Set the WebSocket manager for broadcasting events.
   */
  setWSManager(wsManager: WSManager): void {
    this.wsManager = wsManager;
  }

  /**
   * Start the worker. Begins periodic checking and processes any pending runs.
   */
  async start(): Promise<void> {
    console.log('[QueueWorker] Starting worker...');

    // Recover any stuck jobs from previous runs (e.g., container restart)
    await this.recoverStuckJobs();

    // Check for pending runs periodically (every 5 seconds)
    this.checkInterval = setInterval(() => {
      this.processNext();
    }, 5000);

    // Health check for stuck jobs (every 30 seconds)
    this.healthInterval = setInterval(() => {
      this.checkForStuckJobs();
    }, HEALTH_CHECK_INTERVAL_MS);

    // Also process immediately on start
    this.processNext();
  }

  /**
   * Recover stuck jobs from previous runs (e.g., after container restart).
   */
  private async recoverStuckJobs(): Promise<void> {
    const processingRuns = await queueManager.getProcessingRuns();
    for (const [lockType, run] of Object.entries(processingRuns)) {
      if (run) {
        console.log(`[QueueWorker] Recovering stuck job from previous run (${lockType}): ${run.id}`);
        await queueManager.markFailed(run.id, 'Server restart: job was interrupted');
      }
    }
  }

  /**
   * Health check that detects and recovers from stuck jobs.
   */
  private async checkForStuckJobs(): Promise<void> {
    const processingRuns = await queueManager.getProcessingRuns();

    for (const [lockType, run] of Object.entries(processingRuns) as [LockType, QueuedRun | null][]) {
      if (!run?.startedAt) continue;

      const elapsedMs = Date.now() - new Date(run.startedAt).getTime();
      if (elapsedMs > STUCK_THRESHOLD_MS) {
        console.error(`[QueueWorker] Detected stuck job (${lockType}): ${run.id} (${Math.round(elapsedMs / 1000)}s elapsed)`);

        // Kill the process if it's still running
        const proc = this.currentProcesses.get(lockType);
        if (proc && !proc.killed) {
          console.log(`[QueueWorker] Killing stuck process for ${lockType}`);
          proc.kill('SIGTERM');
          setTimeout(() => {
            if (!proc.killed) {
              proc.kill('SIGKILL');
            }
          }, 5000);
        }

        await queueManager.markFailed(run.id, `Timeout: exceeded ${Math.round(STUCK_THRESHOLD_MS / 1000)}s`);
        this.processingLocks.set(lockType, false);
        this.currentProcesses.delete(lockType);
        setImmediate(() => this.processNext());
      }
    }
  }

  /**
   * Stop the worker.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
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
   * Notify the worker that a message has arrived on a channel.
   * This triggers immediate processing check.
   */
  notifyMessageArrived(channel?: Channel): void {
    console.log(`[QueueWorker] Message arrived on channel: ${channel || 'unknown'}`);
    setImmediate(() => this.processNext());
  }

  /**
   * Check if the worker is currently processing any run.
   */
  isProcessing(): boolean {
    for (const isLocked of this.processingLocks.values()) {
      if (isLocked) return true;
    }
    return false;
  }

  /**
   * Check if a specific channel/lock type is currently processing.
   */
  isProcessingChannel(lockType: LockType): boolean {
    return this.processingLocks.get(lockType) ?? false;
  }

  /**
   * Process the next run in the queue.
   * Uses per-channel locks to allow concurrent processing of web, telegram, and cron.
   */
  async processNext(): Promise<void> {
    // Try to process each channel/type concurrently
    const promises: Promise<void>[] = [];

    // Try chat channels (web, telegram)
    for (const channel of ['telegram', 'web'] as Channel[]) {
      promises.push(this.tryProcessChannel(channel));
    }

    // Try cron runs
    promises.push(this.tryProcessCron());

    await Promise.all(promises);
  }

  /**
   * Try to process pending messages for a specific channel.
   */
  private async tryProcessChannel(channel: Channel): Promise<void> {
    // Check if this channel is already processing
    if (this.processingLocks.get(channel)) {
      return;
    }

    // Check for unprocessed messages
    const unprocessed = await getUnprocessedMessages(channel);
    if (unprocessed.length === 0) {
      return;
    }

    // Acquire lock
    this.processingLocks.set(channel, true);

    try {
      console.log(`[QueueWorker] Processing ${unprocessed.length} unprocessed messages from ${channel}`);
      await this.executeChatRun(channel, unprocessed);
    } catch (error: any) {
      console.error(`[QueueWorker] Chat run failed for ${channel}: ${error.message}`);
      // Don't mark messages as processed if run failed - they'll be retried
    } finally {
      this.processingLocks.set(channel, false);
      // Check for more work on this channel
      setImmediate(() => this.tryProcessChannel(channel));
    }
  }

  /**
   * Try to process the next cron run from the queue.
   */
  private async tryProcessCron(): Promise<void> {
    // Check if cron is already processing
    if (this.processingLocks.get('cron')) {
      return;
    }

    // Dequeue next cron run
    const next = await queueManager.dequeue();
    if (!next) {
      return;
    }

    // Acquire lock
    this.processingLocks.set('cron', true);

    try {
      await this.executeRun(next);
      await queueManager.markCompleted(next.id);
    } catch (error: any) {
      console.error(`[QueueWorker] Cron run failed: ${error.message}`);
      await queueManager.markFailed(next.id, error.message || 'Unknown error');
    } finally {
      this.processingLocks.set('cron', false);
      // Check for more cron work
      setImmediate(() => this.tryProcessCron());
    }
  }

  /**
   * Execute a chat run triggered by unprocessed messages (message-centric model).
   * This bypasses the queue system - messages in JSONL ARE the queue.
   */
  private async executeChatRun(channel: Channel, messages: Message[]): Promise<void> {
    const basePath = getBasePath();
    const runId = generateRunId();
    const messageIds = messages.map(m => m.id);

    console.log(`[QueueWorker] Executing chat run: runId=${runId}, channel=${channel}, messages=${messageIds.length}`);

    // Start typing indicator for telegram channel
    // This ensures the indicator runs even for batched messages (after first response stops it)
    if (channel === 'telegram') {
      try {
        const { startTypingIndicator, authorizedChatId } = await import('../channels/telegram.js');
        if (authorizedChatId) {
          startTypingIndicator(authorizedChatId);
        }
      } catch (error) {
        console.warn('[QueueWorker] Failed to start typing indicator:', error);
      }
    }

    // Spawn the agent script with appropriate arguments
    const runAgentScript = path.join(basePath, 'scripts', 'run-agent.sh');

    const args: string[] = [runAgentScript];
    args.push('--type', 'chat');
    args.push('--channel', channel);
    args.push('--run-id', runId);

    // Use intelligent context preparation
    try {
      const context = await prepareContext({
        type: 'chat',
        channel,
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
      console.error('[QueueWorker] Failed to prepare context:', error);
      throw error;
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

    // Execute the script and wait for completion with timeout
    await new Promise<void>((resolve, reject) => {
      console.log(`[QueueWorker] Spawning agent: runId=${runId}, type=chat, channel=${channel}, timeout=${AGENT_TIMEOUT_MS}ms`);

      const proc = spawn('bash', args, {
        cwd: basePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: '/home/agent' },
      });

      // Track process for health check to kill if stuck
      this.currentProcesses.set(channel, proc);

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;
      let completed = false;

      // Process-level timeout
      timeoutHandle = setTimeout(() => {
        if (completed) return;
        console.error(`[QueueWorker] Agent timeout after ${AGENT_TIMEOUT_MS}ms, killing process`);
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            console.error('[QueueWorker] Process did not terminate, sending SIGKILL');
            proc.kill('SIGKILL');
          }
        }, 5000);
        reject(new Error(`Agent timeout after ${Math.round(AGENT_TIMEOUT_MS / 1000)}s`));
      }, AGENT_TIMEOUT_MS);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.currentProcesses.delete(channel);

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
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.currentProcesses.delete(channel);
        console.error(`[QueueWorker] Failed to spawn agent: ${error.message}`);
        reject(error);
      });
    });

    // Mark messages as processed after successful completion
    await markMessagesAsProcessed(channel, messageIds);
    console.log(`[QueueWorker] Marked ${messageIds.length} messages as processed`);

    // Extract and route response
    if (this.wsManager) {
      try {
        await extractAndRouteResponse({
          runId,
          type: 'chat',
          channel,
          exit_code: 0,
          outputFile: path.join(basePath, 'logs', 'agent-output', `${runId}.json`),
        }, this.wsManager);
        console.log(`[QueueWorker] Extracted and routed response for ${runId}`);
      } catch (error) {
        console.error(`[QueueWorker] Failed to extract response:`, error);
      }
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

    // Determine lock type for this run
    const lockType: LockType = type === 'cron' ? 'cron' : (channel || 'web');

    // Execute the script and wait for completion with timeout
    await new Promise<void>((resolve, reject) => {
      console.log(`[QueueWorker] Spawning agent: runId=${runId}, type=${type}, channel=${channel || 'N/A'}, timeout=${AGENT_TIMEOUT_MS}ms`);

      const proc = spawn('bash', args, {
        cwd: basePath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, HOME: '/home/agent' },
      });

      // Track process for health check to kill if stuck
      this.currentProcesses.set(lockType, proc);

      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | null = null;
      let completed = false;

      // Process-level timeout
      timeoutHandle = setTimeout(() => {
        if (completed) return;
        console.error(`[QueueWorker] Agent timeout after ${AGENT_TIMEOUT_MS}ms, killing process`);
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) {
            console.error('[QueueWorker] Process did not terminate, sending SIGKILL');
            proc.kill('SIGKILL');
          }
        }, 5000);
        reject(new Error(`Agent timeout after ${Math.round(AGENT_TIMEOUT_MS / 1000)}s`));
      }, AGENT_TIMEOUT_MS);

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', async (code) => {
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.currentProcesses.delete(lockType);

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
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.currentProcesses.delete(lockType);
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
