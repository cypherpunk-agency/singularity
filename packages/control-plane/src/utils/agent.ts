import { spawn, execSync } from 'child_process';
import path from 'path';
import { Channel, RunType } from '@singularity/shared';

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
}

/**
 * Trigger the agent to run with the given options.
 * Returns true if the agent was triggered, false if already running.
 */
export function triggerAgentRun(options: TriggerOptions = {}): boolean {
  const { channel, type = 'chat', prompt } = options;
  const basePath = getBasePath();
  const lockPath = path.join(basePath, 'state', 'agent.lock');

  // Check if agent is already running
  if (isLockHeld(lockPath)) {
    return false;
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

  // Add prompt if provided
  if (prompt) {
    args.push('--prompt', prompt);
  }

  const proc = spawn('bash', args, {
    cwd: basePath,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOME: '/home/agent' },
  });
  proc.unref();

  return true;
}
