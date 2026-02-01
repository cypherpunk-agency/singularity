import { spawn, execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { Channel, RunType } from '@singularity/shared';
import { prepareContext } from '../context/index.js';
import { getUnprocessedMessages, markMessagesAsProcessed, hasUnprocessedMessages } from '../conversation.js';

/**
 * Get the base path for the application.
 */
export function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

/**
 * Check if the lock file is actually locked using flock.
 * Returns true if the lock is held by another process.
 */
export function isLockHeld(lockPath: string): boolean {
  try {
    // Try to acquire lock non-blocking - if it succeeds, no one else has it
    execSync(`flock -n "${lockPath}" -c 'exit 0'`, { stdio: 'ignore' });
    return false; // Lock was available, so not held
  } catch {
    return true; // Lock acquisition failed, someone else has it
  }
}

export interface TriggerOptions {
  channel?: Channel;
  type?: RunType;
  prompt?: string;
  query?: string;  // User's message for vector search context
  usePreparedContext?: boolean;  // Whether to use intelligent context preparation
}

/**
 * Trigger the agent to run with the given options.
 * Returns true if the agent was triggered, false if already running.
 */
export async function triggerAgentRun(options: TriggerOptions = {}): Promise<boolean> {
  const { channel, type = 'chat', prompt, query, usePreparedContext = true } = options;
  const basePath = getBasePath();
  const lockPath = path.join(basePath, 'state', 'agent.lock');

  // Check if agent is already running
  if (isLockHeld(lockPath)) {
    return false;
  }

  // Get unprocessed messages for context (chat mode only)
  let messageIds: string[] = [];
  if (type === 'chat' && channel) {
    const unprocessedMessages = await getUnprocessedMessages(channel);
    messageIds = unprocessedMessages.map(m => m.id);
    if (messageIds.length > 0) {
      console.log(`[triggerAgentRun] Found ${messageIds.length} unprocessed messages in ${channel}`);
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

  // Use intelligent context preparation if enabled
  if (usePreparedContext) {
    try {
      const context = await prepareContext({
        type,
        channel,
        query: query || prompt,  // Use query or prompt for vector search
        focusMessageIds: messageIds,  // Highlight unprocessed messages
      });

      // Write system prompt to temp file
      const tempDir = path.join(basePath, 'state', 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      const systemPromptFile = path.join(tempDir, `context-${Date.now()}.txt`);
      await fs.writeFile(systemPromptFile, context.systemPrompt);

      args.push('--system-prompt-file', systemPromptFile);
      args.push('--user-prompt', context.userPrompt);

      console.log(`[triggerAgentRun] Using prepared context: ${context.metadata.totalTokensEstimate} tokens, ` +
        `${context.metadata.memorySnippetsIncluded} memory snippets, ` +
        `${context.metadata.conversationMessagesIncluded} conversation messages, ` +
        `vectorSearch=${context.metadata.vectorSearchUsed}`);
    } catch (error) {
      console.error('[triggerAgentRun] Failed to prepare context, falling back to bash assembly:', error);
      // Fall through to legacy prompt handling
      if (prompt) {
        args.push('--prompt', prompt);
      }
    }
  } else {
    // Legacy: use prompt directly
    if (prompt) {
      args.push('--prompt', prompt);
    }
  }

  const proc = spawn('bash', args, {
    cwd: basePath,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOME: '/home/agent' },
  });
  proc.unref();

  // Mark messages as processed after successful spawn
  if (messageIds.length > 0 && channel) {
    await markMessagesAsProcessed(channel, messageIds);
    console.log(`[triggerAgentRun] Marked ${messageIds.length} messages as processed`);
  }

  return true;
}

// Re-export hasUnprocessedMessages for use in other modules
export { hasUnprocessedMessages };
