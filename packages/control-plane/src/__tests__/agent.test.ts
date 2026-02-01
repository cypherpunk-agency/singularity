import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(() => ({
    unref: vi.fn(),
  })),
}));

// Mock fs.promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    appendFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

// Mock the context module to avoid complex dependencies
vi.mock('../context/index.js', () => ({
  prepareContext: vi.fn().mockResolvedValue({
    systemPrompt: 'mock system prompt',
    userPrompt: 'mock user prompt',
    metadata: {
      totalTokensEstimate: 100,
      memorySnippetsIncluded: 0,
      conversationMessagesIncluded: 0,
      vectorSearchUsed: false,
    },
  }),
}));

const mockedExecSync = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawn);

describe('agent utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_DIR = '/app';
  });

  afterEach(() => {
    delete process.env.APP_DIR;
  });

  describe('isLockHeld', () => {
    it('returns false when lock is available', async () => {
      // Import fresh module after mocks are set up
      const { isLockHeld } = await import('../utils/agent.js');

      // flock succeeds (exit 0) means lock is NOT held
      mockedExecSync.mockReturnValue(Buffer.from(''));

      const result = isLockHeld('/app/state/agent.lock');

      expect(result).toBe(false);
      expect(mockedExecSync).toHaveBeenCalled();
    });

    it('returns true when lock is held by another process', async () => {
      const { isLockHeld } = await import('../utils/agent.js');

      // flock fails means lock IS held
      mockedExecSync.mockImplementation(() => {
        throw new Error('flock failed');
      });

      const result = isLockHeld('/app/state/agent.lock');

      expect(result).toBe(true);
    });
  });

  describe('triggerAgentRun', () => {
    it('returns true and spawns process when lock is not held', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Lock is not held (flock succeeds)
      mockedExecSync.mockReturnValue(Buffer.from(''));

      const result = await triggerAgentRun({ channel: 'web', type: 'chat' });

      expect(result).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);

      // Verify spawn was called with correct arguments (platform-independent)
      const spawnArgs = mockedSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--type');
      expect(spawnArgs).toContain('chat');
      expect(spawnArgs).toContain('--channel');
      expect(spawnArgs).toContain('web');

      // Check options
      const spawnOpts = mockedSpawn.mock.calls[0][2] as any;
      expect(spawnOpts.detached).toBe(true);
      expect(spawnOpts.stdio).toBe('ignore');
    });

    it('returns false and does not spawn when lock is held', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Lock is held (flock fails)
      mockedExecSync.mockImplementation(() => {
        throw new Error('flock failed');
      });

      const result = await triggerAgentRun({ channel: 'web', type: 'chat' });

      expect(result).toBe(false);
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('multiple rapid calls - first succeeds, subsequent fail', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      let callCount = 0;
      mockedExecSync.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: lock is available
          return Buffer.from('');
        }
        // Subsequent calls: lock is now held
        throw new Error('flock failed');
      });

      const results = await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'web', type: 'chat' }),
      ]);

      // First call returns true, rest return false
      expect(results[0]).toBe(true);
      expect(results[1]).toBe(false);
      expect(results[2]).toBe(false);

      // spawn should only be called once
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
    });

    it('passes channel argument only for chat type', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      mockedExecSync.mockReturnValue(Buffer.from(''));

      await triggerAgentRun({ channel: 'telegram', type: 'cron' });

      // Channel should NOT be in args for cron type
      const spawnArgs = mockedSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--type');
      expect(spawnArgs).toContain('cron');
      expect(spawnArgs).not.toContain('--channel');
    });

    it('includes channel for chat type', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      mockedExecSync.mockReturnValue(Buffer.from(''));

      await triggerAgentRun({ channel: 'telegram', type: 'chat' });

      const spawnArgs = mockedSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--channel');
      expect(spawnArgs).toContain('telegram');
    });
  });
});
