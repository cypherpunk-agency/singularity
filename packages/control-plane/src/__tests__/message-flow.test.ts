import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Track appendFile calls to verify message saving
const appendFileCalls: { path: string; content: string }[] = [];

// Mock child_process (no longer needed for chat runs, but kept for cron)
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
    appendFile: vi.fn().mockImplementation(async (path: string, content: string) => {
      appendFileCalls.push({ path: path.toString(), content });
    }),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

// Mock uuid with incrementing IDs
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `msg-${++uuidCounter}`),
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

// Mock queue worker singleton
const mockNotifyMessageArrived = vi.fn();
const mockNotify = vi.fn();
vi.mock('../queue/worker.js', () => ({
  queueWorker: {
    notifyMessageArrived: mockNotifyMessageArrived,
    notify: mockNotify,
  },
}));

describe('message flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appendFileCalls.length = 0;
    uuidCounter = 0;
    mockNotifyMessageArrived.mockClear();
    mockNotify.mockClear();
    process.env.APP_DIR = '/app';

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));
  });

  afterEach(() => {
    delete process.env.APP_DIR;
    vi.useRealTimers();
  });

  describe('web channel message flow', () => {
    it('single message triggers worker notification', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Save message
      const message = await saveHumanMessage('Hello', 'web');

      // Trigger agent (now just notifies worker)
      const result = await triggerAgentRun({ channel: 'web', type: 'chat', query: 'Hello' });

      expect(message.text).toBe('Hello');
      expect(message.channel).toBe('web');
      expect(result).toBeNull(); // Chat runs return null (message-driven)
      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('web');
    });

    it('multiple messages each trigger worker notification', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Simulate multiple messages arriving
      const messages = await Promise.all([
        saveHumanMessage('Message 1', 'web'),
        saveHumanMessage('Message 2', 'web'),
        saveHumanMessage('Message 3', 'web'),
      ]);

      // Each message triggers notification
      await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 1' }),
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 2' }),
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 3' }),
      ]);

      // All messages should be saved
      expect(messages).toHaveLength(3);
      const webCalls = appendFileCalls.filter(c => c.path.includes('web'));
      expect(webCalls).toHaveLength(3);

      // Worker notified for each message (worker handles deduplication)
      expect(mockNotifyMessageArrived).toHaveBeenCalledTimes(3);
    });
  });

  describe('telegram channel message flow', () => {
    it('single message triggers worker notification', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      const message = await saveHumanMessage('Telegram hello', 'telegram');
      const result = await triggerAgentRun({ channel: 'telegram', type: 'chat', query: 'Telegram hello' });

      expect(message.channel).toBe('telegram');
      expect(result).toBeNull(); // Chat runs return null
      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('telegram');
    });

    it('multiple rapid messages all saved and all notify worker', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Simulate burst of messages (e.g., arrived while server was down)
      await Promise.all([
        saveHumanMessage('Missed message 1', 'telegram'),
        saveHumanMessage('Missed message 2', 'telegram'),
        saveHumanMessage('Missed message 3', 'telegram'),
      ]);

      // All saved to telegram conversation
      const telegramCalls = appendFileCalls.filter(c => c.path.includes('telegram'));
      expect(telegramCalls).toHaveLength(3);

      // Each trigger notifies worker (worker will batch process them)
      await Promise.all([
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
      ]);

      expect(mockNotifyMessageArrived).toHaveBeenCalledTimes(3);
    });
  });

  describe('cross-channel behavior', () => {
    it('messages on both channels both notify worker', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Messages arrive on both channels
      const [webMsg, telegramMsg] = await Promise.all([
        saveHumanMessage('Web message', 'web'),
        saveHumanMessage('Telegram message', 'telegram'),
      ]);

      // Both messages saved
      expect(webMsg.channel).toBe('web');
      expect(telegramMsg.channel).toBe('telegram');

      // Trigger from both
      await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
      ]);

      // Both channels notified (worker will process sequentially)
      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('web');
      expect(mockNotifyMessageArrived).toHaveBeenCalledWith('telegram');
    });

    it('different channels save to different files', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      await saveHumanMessage('Web content', 'web');
      await saveHumanMessage('Telegram content', 'telegram');

      const webCalls = appendFileCalls.filter(c => c.path.includes('web'));
      const telegramCalls = appendFileCalls.filter(c => c.path.includes('telegram'));

      expect(webCalls).toHaveLength(1);
      expect(telegramCalls).toHaveLength(1);
      expect(webCalls[0].content).toContain('Web content');
      expect(telegramCalls[0].content).toContain('Telegram content');
    });
  });

  describe('cron runs', () => {
    it('cron runs still use queue and return queue ID', async () => {
      const { triggerAgentRun } = await import('../utils/agent.js');

      const result = await triggerAgentRun({ type: 'cron' });

      // Cron runs return queue ID
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
      expect(mockNotify).toHaveBeenCalled();
    });
  });

  describe('agent response flow', () => {
    it('agent response saves correctly and includes channel', async () => {
      const { saveAgentResponse } = await import('../conversation.js');

      const response = await saveAgentResponse('Agent reply', 'web');

      expect(response.from).toBe('agent');
      expect(response.channel).toBe('web');
      expect(response.text).toBe('Agent reply');

      const webCalls = appendFileCalls.filter(c => c.path.includes('web'));
      expect(webCalls.length).toBeGreaterThan(0);
      expect(webCalls[0].content).toContain('"from":"agent"');
    });

    it('telegram response saves to telegram conversation', async () => {
      const { saveAgentResponse } = await import('../conversation.js');

      await saveAgentResponse('Telegram reply', 'telegram');

      const telegramCalls = appendFileCalls.filter(c => c.path.includes('telegram'));
      expect(telegramCalls).toHaveLength(1);
      expect(telegramCalls[0].content).toContain('"channel":"telegram"');
    });
  });
});
