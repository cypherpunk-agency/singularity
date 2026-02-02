import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync, spawn } from 'child_process';

// Track appendFile calls to verify message saving
const appendFileCalls: { path: string; content: string }[] = [];

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

const mockedExecSync = vi.mocked(execSync);
const mockedSpawn = vi.mocked(spawn);

describe('message flow integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appendFileCalls.length = 0;
    uuidCounter = 0;
    process.env.APP_DIR = '/app';

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));
  });

  afterEach(() => {
    delete process.env.APP_DIR;
    vi.useRealTimers();
  });

  describe('web channel message flow', () => {
    it('single message when agent idle - triggers agent', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Agent is idle (lock not held)
      mockedExecSync.mockReturnValue(Buffer.from(''));

      // Save message
      const message = await saveHumanMessage('Hello', 'web');

      // Trigger agent
      const triggered = await triggerAgentRun({ channel: 'web', type: 'chat', query: 'Hello' });

      expect(message.text).toBe('Hello');
      expect(message.channel).toBe('web');
      expect(triggered).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
    });

    it('single message when agent running - does not trigger', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Agent is running (lock held)
      mockedExecSync.mockImplementation(() => {
        throw new Error('flock failed');
      });

      // Save message (should still work)
      const message = await saveHumanMessage('Hello while busy', 'web');

      // Try to trigger agent
      const triggered = await triggerAgentRun({ channel: 'web', type: 'chat' });

      expect(message.text).toBe('Hello while busy');
      expect(triggered).toBe(false);
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('multiple messages while agent running - all saved, only first triggers', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      let lockHeld = false;
      mockedExecSync.mockImplementation(() => {
        if (lockHeld) {
          throw new Error('flock failed');
        }
        // After first successful trigger, lock is held
        lockHeld = true;
        return Buffer.from('');
      });

      // Simulate multiple messages arriving
      const messages = await Promise.all([
        saveHumanMessage('Message 1', 'web'),
        saveHumanMessage('Message 2', 'web'),
        saveHumanMessage('Message 3', 'web'),
      ]);

      // Try to trigger for each message
      const triggers = await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 1' }),
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 2' }),
        triggerAgentRun({ channel: 'web', type: 'chat', query: 'Message 3' }),
      ]);

      // All messages should be saved
      expect(messages).toHaveLength(3);
      const webCalls = appendFileCalls.filter(c => c.path.includes('web'));
      expect(webCalls).toHaveLength(3);

      // Only first trigger should succeed
      expect(triggers[0]).toBe(true);
      expect(triggers[1]).toBe(false);
      expect(triggers[2]).toBe(false);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('telegram channel message flow', () => {
    it('single message when agent idle - triggers agent', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      mockedExecSync.mockReturnValue(Buffer.from(''));

      const message = await saveHumanMessage('Telegram hello', 'telegram');
      const triggered = await triggerAgentRun({ channel: 'telegram', type: 'chat', query: 'Telegram hello' });

      expect(message.channel).toBe('telegram');
      expect(triggered).toBe(true);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);

      // Verify channel is passed to spawn
      const spawnArgs = mockedSpawn.mock.calls[0][1] as string[];
      expect(spawnArgs).toContain('--channel');
      expect(spawnArgs).toContain('telegram');
    });

    it('single message when agent running - saves but does not trigger', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      mockedExecSync.mockImplementation(() => {
        throw new Error('flock failed');
      });

      const message = await saveHumanMessage('Telegram while busy', 'telegram');
      const triggered = await triggerAgentRun({ channel: 'telegram', type: 'chat' });

      expect(message.text).toBe('Telegram while busy');
      expect(triggered).toBe(false);
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('multiple messages while running - simulates server-was-down scenario', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Agent becomes available after messages are queued
      let lockHeld = false;
      mockedExecSync.mockImplementation(() => {
        if (lockHeld) {
          throw new Error('flock failed');
        }
        lockHeld = true;
        return Buffer.from('');
      });

      // Simulate burst of messages (e.g., arrived while server was down)
      await Promise.all([
        saveHumanMessage('Missed message 1', 'telegram'),
        saveHumanMessage('Missed message 2', 'telegram'),
        saveHumanMessage('Missed message 3', 'telegram'),
      ]);

      // All saved to telegram conversation
      const telegramCalls = appendFileCalls.filter(c => c.path.includes('telegram'));
      expect(telegramCalls).toHaveLength(3);

      // Now try to trigger - only one should succeed
      const triggers = await Promise.all([
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
      ]);

      expect(triggers.filter(t => t !== null)).toHaveLength(1);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-channel behavior', () => {
    it('web message while telegram agent running - shares lock', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      // Lock is already held (by telegram run)
      mockedExecSync.mockImplementation(() => {
        throw new Error('flock failed');
      });

      // Try to send web message
      const message = await saveHumanMessage('Web message', 'web');
      const triggered = await triggerAgentRun({ channel: 'web', type: 'chat' });

      // Message saved but agent not triggered
      expect(message.channel).toBe('web');
      const webCalls = appendFileCalls.filter(c => c.path.includes('web'));
      expect(webCalls.length).toBeGreaterThan(0);
      expect(triggered).toBe(false);
      expect(mockedSpawn).not.toHaveBeenCalled();
    });

    it('messages on both channels - all saved, one agent run', async () => {
      const { saveHumanMessage } = await import('../conversation.js');
      const { triggerAgentRun } = await import('../utils/agent.js');

      let lockHeld = false;
      mockedExecSync.mockImplementation(() => {
        if (lockHeld) {
          throw new Error('flock failed');
        }
        lockHeld = true;
        return Buffer.from('');
      });

      // Messages arrive on both channels
      const [webMsg, telegramMsg] = await Promise.all([
        saveHumanMessage('Web message', 'web'),
        saveHumanMessage('Telegram message', 'telegram'),
      ]);

      // Both messages saved
      expect(webMsg.channel).toBe('web');
      expect(telegramMsg.channel).toBe('telegram');

      // Try to trigger from both
      const [webTrigger, telegramTrigger] = await Promise.all([
        triggerAgentRun({ channel: 'web', type: 'chat' }),
        triggerAgentRun({ channel: 'telegram', type: 'chat' }),
      ]);

      // Only one trigger succeeds (whichever happens first)
      expect([webTrigger, telegramTrigger].filter(t => t !== null)).toHaveLength(1);
      expect(mockedSpawn).toHaveBeenCalledTimes(1);
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
