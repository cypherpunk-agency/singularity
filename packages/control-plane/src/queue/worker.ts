import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { QueuedRun, Channel, Message, LockType, isAgentChannel } from '@singularity/shared';
import { queueManager } from './manager.js';
import { prepareContext } from '../context/index.js';
import { getUnprocessedMessages, markMessagesAsProcessed, saveAgentResponse, discoverAgentChannels } from '../conversation.js';
import { extractAndRouteResponse, deliverAgentErrorCallback } from '../response/extractor.js';
import { WSManager } from '../ws/events.js';

// Configuration for stuck job recovery
const AGENT_TIMEOUT_MS = parseInt(process.env.AGENT_TIMEOUT_MS || '1800000'); // 30 min default

// Chat retry configuration to prevent infinite retry loops (OOM protection)
const MAX_CHAT_RETRIES = 3;
const CHAT_RETRY_DELAYS_MS = [10_000, 30_000, 60_000]; // escalating backoff
const STUCK_THRESHOLD_MS = AGENT_TIMEOUT_MS + 5 * 60 * 1000; // timeout + 5 min buffer
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30 seconds

// Success-loop circuit breaker: prevents infinite loops where runs succeed
// but the same messages keep appearing (e.g., cross-day marking bug)
const MAX_SAME_MESSAGE_RUNS = 5;

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
  private channelRetries: Map<Channel, { count: number; messageIds: string[] }> = new Map();
  // Tracks how many times the same message IDs have been seen (success or failure)
  private channelSeenCount: Map<Channel, { count: number; messageIds: string[] }> = new Map();
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
    // Flatten all runs including agent channels
    const allRuns: [string, QueuedRun | null][] = [
      ['web', processingRuns.web],
      ['telegram', processingRuns.telegram],
      ['cron', processingRuns.cron],
      ...Object.entries(processingRuns.agents),
    ];
    for (const [lockType, run] of allRuns) {
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

    // Flatten all runs including agent channels
    const allRuns: [LockType, QueuedRun | null][] = [
      ['web', processingRuns.web],
      ['telegram', processingRuns.telegram],
      ['cron', processingRuns.cron],
      ...Object.entries(processingRuns.agents) as [LockType, QueuedRun | null][],
    ];

    for (const [lockType, run] of allRuns) {
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

    // Try agent channels (dynamically discovered)
    try {
      const agentChannels = await discoverAgentChannels();
      for (const channel of agentChannels) {
        promises.push(this.tryProcessChannel(channel));
      }
    } catch (error) {
      // Don't block processing if agent channel discovery fails
    }

    // Try cron runs
    promises.push(this.tryProcessCron());

    await Promise.all(promises);
  }

  /**
   * Try to process pending messages for a specific channel.
   */
  private async tryProcessChannel(channel: Channel): Promise<void> {
    // Acquire lock atomically — check and set with no await in between
    // to prevent race conditions from concurrent tryProcessChannel calls
    if (this.processingLocks.get(channel)) {
      return;
    }
    this.processingLocks.set(channel, true);

    // Check for unprocessed messages (now safe behind lock)
    const unprocessed = await getUnprocessedMessages(channel);
    if (unprocessed.length === 0) {
      this.processingLocks.set(channel, false);
      return;
    }

    const messageIds = unprocessed.map(m => m.id);
    const retryState = this.channelRetries.get(channel);

    // Check if these are the same messages (regardless of success/failure)
    const isSameMessages = retryState &&
      retryState.messageIds.length === messageIds.length &&
      retryState.messageIds.every(id => messageIds.includes(id));

    // Success-loop circuit breaker: if the same messages keep appearing
    // after successful runs, something is wrong (e.g., cross-day marking bug)
    const seenState = this.channelSeenCount.get(channel);
    const isSameSeen = seenState &&
      seenState.messageIds.length === messageIds.length &&
      seenState.messageIds.every(id => messageIds.includes(id));

    if (isSameSeen) {
      seenState!.count++;
      if (seenState!.count >= MAX_SAME_MESSAGE_RUNS) {
        console.error(`[QueueWorker] SUCCESS-LOOP DETECTED on ${channel}: same ${messageIds.length} message(s) seen ${seenState!.count} times. Force-marking as processed.`);
        await this.handleMaxRetriesExceeded(channel, messageIds);
        this.channelSeenCount.delete(channel);
        this.channelRetries.delete(channel);
        this.processingLocks.set(channel, false);
        return;
      }
    } else {
      // Different messages — reset seen counter
      this.channelSeenCount.set(channel, { count: 1, messageIds });
    }

    if (isSameMessages && retryState!.count >= MAX_CHAT_RETRIES) {
      console.error(`[QueueWorker] Max retries (${MAX_CHAT_RETRIES}) exceeded for ${channel}, giving up on ${messageIds.length} messages`);
      await this.handleMaxRetriesExceeded(channel, messageIds);
      this.channelRetries.delete(channel);
      this.channelSeenCount.delete(channel);
      this.processingLocks.set(channel, false);
      return;
    }

    // If same messages failing again, apply backoff delay
    if (isSameMessages) {
      const delayMs = CHAT_RETRY_DELAYS_MS[Math.min(retryState!.count, CHAT_RETRY_DELAYS_MS.length - 1)];
      console.log(`[QueueWorker] Retry ${retryState!.count + 1}/${MAX_CHAT_RETRIES} for ${channel} after ${delayMs}ms backoff`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    } else if (retryState) {
      // Different messages — reset retry counter
      this.channelRetries.delete(channel);
    }

    try {
      console.log(`[QueueWorker] Processing ${unprocessed.length} unprocessed messages from ${channel}`);
      await this.executeChatRun(channel, unprocessed);
      // Success — clear failure retry state (but NOT seenCount)
      this.channelRetries.delete(channel);
    } catch (error: any) {
      console.error(`[QueueWorker] Chat run failed for ${channel}: ${error.message}`);
      // Track retry state for these messages
      const currentRetry = this.channelRetries.get(channel);
      if (currentRetry && isSameMessages) {
        currentRetry.count++;
      } else {
        this.channelRetries.set(channel, { count: 1, messageIds });
      }
    } finally {
      this.processingLocks.set(channel, false);
      // Check for more work on this channel (retry logic above will gate retries)
      setImmediate(() => this.tryProcessChannel(channel));
    }
  }

  /**
   * Handle the case where chat messages have exceeded max retries.
   * Marks them as processed and sends an error response to the user.
   */
  private async handleMaxRetriesExceeded(channel: Channel, messageIds: string[]): Promise<void> {
    const errorText = 'Sorry, I encountered a persistent error processing your message(s). The issue has been logged. Please try sending your message again.';

    try {
      // Mark the stuck messages as processed so they don't block future messages
      await markMessagesAsProcessed(channel, messageIds);
      console.log(`[QueueWorker] Marked ${messageIds.length} failed messages as processed on ${channel}`);

      // Save an error response to the conversation
      const errorMessage = await saveAgentResponse(errorText, channel);

      // Broadcast via WebSocket
      if (this.wsManager) {
        this.wsManager.broadcastChatMessage(errorMessage);
      }

      // Send to Telegram if applicable
      if (channel === 'telegram') {
        try {
          const { sendToTelegram } = await import('../channels/telegram.js');
          await sendToTelegram(errorText);
        } catch (telegramError) {
          console.error('[QueueWorker] Failed to send error to Telegram:', telegramError);
        }
      }

      // Deliver error callback for agent channels
      if (isAgentChannel(channel)) {
        try {
          await deliverAgentErrorCallback(channel, messageIds);
        } catch (callbackError) {
          console.error('[QueueWorker] Failed to deliver agent error callback:', callbackError);
        }
      }
    } catch (error) {
      console.error('[QueueWorker] Failed to handle max retries exceeded:', error);
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
