import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs.promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    appendFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
    stat: vi.fn().mockResolvedValue({ size: 1000 }),
  },
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => `test-uuid-${Date.now()}`),
}));

// Mock context module
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
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  truncateArrayToTokenBudget: vi.fn((arr: any[]) => arr),
}));

// Mock response extractor
vi.mock('../response/extractor.js', () => ({
  extractAndRouteResponse: vi.fn().mockResolvedValue(undefined),
}));

// Mock WebSocket manager
const mockWsManager = {
  broadcastAgentStarted: vi.fn(),
  broadcastChatMessage: vi.fn(),
  broadcastAgentCompleted: vi.fn(),
};

vi.mock('../ws/events.js', () => ({
  WSManager: vi.fn(() => mockWsManager),
}));

// Mock child_process.spawn to not actually spawn processes
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

const mockedFs = vi.mocked(fs);

describe('QueueWorker - Message-centric queue model', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.APP_DIR = '/app';

    // Set up fake timers
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));

    // Reset module cache to get fresh instances
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.APP_DIR;
    vi.useRealTimers();
  });

  describe('checkForUnprocessedMessages', () => {
    it('returns channel and messages when unprocessed messages exist', async () => {
      // Set up unprocessed messages in telegram channel
      mockedFs.readdir.mockImplementation(async (path) => {
        if (String(path).includes('telegram')) {
          return ['2024-01-15.jsonl'] as any;
        }
        return [] as any;
      });

      mockedFs.readFile.mockImplementation(async (path) => {
        if (String(path).includes('telegram')) {
          return '{"id":"msg-1","text":"Hello","from":"human","channel":"telegram","timestamp":"2024-01-15T10:00:00Z"}';
        }
        return '';
      });

      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      // Access the private method through the class
      const result = await (worker as any).checkForUnprocessedMessages();

      expect(result).not.toBeNull();
      expect(result.channel).toBe('telegram');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe('msg-1');
    });

    it('returns null when no unprocessed messages exist', async () => {
      mockedFs.readdir.mockResolvedValue([] as any);

      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      const result = await (worker as any).checkForUnprocessedMessages();

      expect(result).toBeNull();
    });

    it('checks telegram before web (priority order)', async () => {
      const readDirCalls: string[] = [];

      mockedFs.readdir.mockImplementation(async (path) => {
        readDirCalls.push(String(path));
        return [] as any;
      });

      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      await (worker as any).checkForUnprocessedMessages();

      // Should check telegram first, then web
      expect(readDirCalls[0]).toContain('telegram');
      expect(readDirCalls[1]).toContain('web');
    });
  });

  describe('notifyMessageArrived', () => {
    it('logs the arrival and triggers setImmediate', async () => {
      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      // Spy on processNext
      const processNextSpy = vi.spyOn(worker, 'processNext').mockResolvedValue();

      // Call notifyMessageArrived
      worker.notifyMessageArrived('telegram');

      // Process should not be called yet (setImmediate is async)
      expect(processNextSpy).not.toHaveBeenCalled();

      // Run pending immediates
      await vi.runAllTimersAsync();

      expect(processNextSpy).toHaveBeenCalled();
    });
  });

  describe('processNext - message priority', () => {
    it('checks for unprocessed messages before dequeuing', async () => {
      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      // Mock to return no unprocessed messages
      mockedFs.readdir.mockResolvedValue([] as any);

      // Call processNext (should check messages first, then queue)
      await worker.processNext();

      // Should have checked readdir for both telegram and web channels
      const readdirCalls = mockedFs.readdir.mock.calls.map(c => String(c[0]));
      const telegramCalls = readdirCalls.filter(c => c.includes('telegram'));
      const webCalls = readdirCalls.filter(c => c.includes('web'));

      expect(telegramCalls.length).toBeGreaterThan(0);
      expect(webCalls.length).toBeGreaterThan(0);
    });
  });

  describe('worker state', () => {
    it('isProcessing returns false initially', async () => {
      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      expect(worker.isProcessing()).toBe(false);
    });

    it('notify triggers processNext', async () => {
      const { QueueWorker } = await import('../queue/worker.js');
      const worker = new QueueWorker();

      const processNextSpy = vi.spyOn(worker, 'processNext').mockResolvedValue();

      worker.notify();

      await vi.runAllTimersAsync();

      expect(processNextSpy).toHaveBeenCalled();
    });
  });
});

describe('QueueWorker - Integration behavior', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.APP_DIR = '/app';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.APP_DIR;
  });

  it('worker has notifyMessageArrived method', async () => {
    const { queueWorker } = await import('../queue/worker.js');

    expect(typeof queueWorker.notifyMessageArrived).toBe('function');
  });

  it('worker has checkForUnprocessedMessages as private method', async () => {
    const { QueueWorker } = await import('../queue/worker.js');
    const worker = new QueueWorker();

    // Check that the method exists (even though private)
    expect(typeof (worker as any).checkForUnprocessedMessages).toBe('function');
  });

  it('worker has executeChatRun as private method', async () => {
    const { QueueWorker } = await import('../queue/worker.js');
    const worker = new QueueWorker();

    // Check that the method exists (even though private)
    expect(typeof (worker as any).executeChatRun).toBe('function');
  });
});
