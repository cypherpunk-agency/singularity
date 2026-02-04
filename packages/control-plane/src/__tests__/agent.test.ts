import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';

// Mock child_process
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

// Mock queue worker singleton
const mockNotifyMessageArrived = vi.fn();
const mockNotify = vi.fn();
vi.mock('../queue/worker.js', () => ({
  queueWorker: {
    notifyMessageArrived: mockNotifyMessageArrived,
    notify: mockNotify,
  },
}));

const mockedExecSync = vi.mocked(execSync);

describe('agent utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNotifyMessageArrived.mockClear();
    mockNotify.mockClear();
    process.env.APP_DIR = '/app';
  });

  afterEach(() => {
    delete process.env.APP_DIR;
  });

  describe('isLockHeld', () => {
    it('returns false when lock is available', async () => {
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

  describe('triggerAgentRun - message-centric model', () => {
    it('chat runs notify worker and return null', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      const result = await triggerAgentRun({ channel: 'web', type: 'chat' });

      // Chat runs return null (message-driven, no queue ID)
      expect(result).toBeNull();
      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('web');
    });

    it('multiple chat calls all notify worker', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      const results = await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'web', type: 'chat' }),
      ]);

      // All return null (no queueing for chat)
      expect(results).toEqual([null, null, null]);

      // Worker notified each time (deduplication happens in worker)
      expect(mockNotifyMessageArrived).toHaveBeenCalledTimes(3);
    });

    it('telegram chat notifies with correct channel', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      await triggerAgentRun({ channel: 'telegram', type: 'chat' });

      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('telegram');
    });

    it('cron runs enqueue and return queue ID', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      const result = await triggerAgentRun({ type: 'cron' });

      // Cron runs return a queue ID
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(mockNotify).toHaveBeenCalled();
      // Chat notification should not be called for cron
      expect(mockNotifyMessageArrived).not.toHaveBeenCalled();
    });

    it('cron with channel still uses queue', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      const result = await triggerAgentRun({ channel: 'telegram', type: 'cron' });

      // Cron runs return a queue ID even with channel
      expect(result).toBeTruthy();
      expect(mockNotify).toHaveBeenCalled();
    });
  });
});
