import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs.promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    appendFile: vi.fn().mockResolvedValue(undefined),
    readdir: vi.fn().mockResolvedValue([]),
  },
}));

// Mock uuid to get predictable IDs
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-1234'),
}));

// Mock the context/index.js module to avoid import errors
vi.mock('../context/index.js', () => ({
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  truncateArrayToTokenBudget: vi.fn((arr: any[]) => arr),
}));

const mockedFs = vi.mocked(fs);

describe('conversation module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_DIR = '/app';

    // Set up a fixed date for consistent testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00Z'));
  });

  afterEach(() => {
    delete process.env.APP_DIR;
    vi.useRealTimers();
  });

  describe('saveHumanMessage', () => {
    it('creates message with correct fields for web channel', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      const message = await saveHumanMessage('Hello agent', 'web');

      expect(message).toEqual({
        id: 'test-uuid-1234',
        text: 'Hello agent',
        from: 'human',
        channel: 'web',
        timestamp: '2024-01-15T10:30:00.000Z',
      });
    });

    it('creates message with correct fields for telegram channel', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      const message = await saveHumanMessage('Hello from telegram', 'telegram');

      expect(message).toEqual({
        id: 'test-uuid-1234',
        text: 'Hello from telegram',
        from: 'human',
        channel: 'telegram',
        timestamp: '2024-01-15T10:30:00.000Z',
      });
    });

    it('creates conversation directory recursively', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      await saveHumanMessage('Test message', 'web');

      expect(mockedFs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('web'),
        { recursive: true }
      );
    });

    it('appends message as JSONL with correct content', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      await saveHumanMessage('Test message', 'web');

      expect(mockedFs.appendFile).toHaveBeenCalledTimes(1);
      const appendCall = mockedFs.appendFile.mock.calls[0];
      const filePath = appendCall[0] as string;
      const content = appendCall[1] as string;

      expect(filePath).toContain('web');
      expect(filePath).toContain('2024-01-15.jsonl');
      expect(content).toContain('"text":"Test message"');
      expect(content).toContain('"from":"human"');
      expect(content).toContain('"channel":"web"');
      expect(content.endsWith('\n')).toBe(true);
    });

    it('appends to telegram conversation directory', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      await saveHumanMessage('Telegram message', 'telegram');

      const appendCall = mockedFs.appendFile.mock.calls[0];
      const filePath = appendCall[0] as string;
      const content = appendCall[1] as string;

      expect(filePath).toContain('telegram');
      expect(content).toContain('"channel":"telegram"');
    });
  });

  describe('saveAgentResponse', () => {
    it('creates message with from: agent', async () => {
      const { saveAgentResponse } = await import('../conversation.js');

      const message = await saveAgentResponse('Hello human', 'web');

      expect(message.from).toBe('agent');
      expect(message.text).toBe('Hello human');
      expect(message.channel).toBe('web');
    });

    it('appends agent response to conversation file', async () => {
      const { saveAgentResponse } = await import('../conversation.js');

      await saveAgentResponse('Agent reply', 'telegram');

      const appendCall = mockedFs.appendFile.mock.calls[0];
      const content = appendCall[1] as string;

      expect(content).toContain('"from":"agent"');
    });
  });

  describe('getConversationHistory', () => {
    it('returns empty array when file does not exist', async () => {
      const { getConversationHistory } = await import('../conversation.js');

      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

      const messages = await getConversationHistory('web', '2024-01-15');

      expect(messages).toEqual([]);
    });

    it('parses JSONL file and returns messages', async () => {
      const { getConversationHistory } = await import('../conversation.js');

      const jsonlContent = [
        '{"id":"1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
        '{"id":"2","text":"Hi there","from":"agent","channel":"web","timestamp":"2024-01-15T10:01:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(jsonlContent);

      const messages = await getConversationHistory('web', '2024-01-15');

      expect(messages).toHaveLength(2);
      expect(messages[0].text).toBe('Hello');
      expect(messages[1].text).toBe('Hi there');
    });

    it('handles empty lines in JSONL', async () => {
      const { getConversationHistory } = await import('../conversation.js');

      const jsonlContent = [
        '{"id":"1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
        '',
        '{"id":"2","text":"World","from":"agent","channel":"web","timestamp":"2024-01-15T10:01:00Z"}',
        '',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(jsonlContent);

      const messages = await getConversationHistory('web', '2024-01-15');

      expect(messages).toHaveLength(2);
    });
  });

  describe('getRecentMessages', () => {
    it('returns messages from most recent files up to limit', async () => {
      const { getRecentMessages } = await import('../conversation.js');

      // Mock readdir to return available date files
      mockedFs.readdir.mockResolvedValue(['2024-01-14.jsonl', '2024-01-15.jsonl'] as any);

      // Mock readFile to return messages for each date
      mockedFs.readFile.mockImplementation(async (filePath: any) => {
        if (filePath.includes('2024-01-14')) {
          return '{"id":"old","text":"Old message","from":"human","channel":"web","timestamp":"2024-01-14T10:00:00Z"}';
        }
        return '{"id":"new","text":"New message","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}';
      });

      const messages = await getRecentMessages('web', 50);

      expect(messages.length).toBeGreaterThan(0);
    });

    it('respects the limit parameter', async () => {
      const { getRecentMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue(['2024-01-15.jsonl'] as any);

      // Create 10 messages
      const jsonlContent = Array.from({ length: 10 }, (_, i) =>
        `{"id":"${i}","text":"Message ${i}","from":"human","channel":"web","timestamp":"2024-01-15T10:0${i}:00Z"}`
      ).join('\n');

      mockedFs.readFile.mockResolvedValue(jsonlContent);

      const messages = await getRecentMessages('web', 5);

      // Should return last 5 messages
      expect(messages).toHaveLength(5);
      expect(messages[0].text).toBe('Message 5');
      expect(messages[4].text).toBe('Message 9');
    });
  });

  describe('getConversationDates', () => {
    it('returns dates in reverse order (newest first)', async () => {
      const { getConversationDates } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue([
        '2024-01-13.jsonl',
        '2024-01-15.jsonl',
        '2024-01-14.jsonl',
      ] as any);

      const dates = await getConversationDates('web');

      expect(dates).toEqual(['2024-01-15', '2024-01-14', '2024-01-13']);
    });

    it('returns empty array when directory does not exist', async () => {
      const { getConversationDates } = await import('../conversation.js');

      mockedFs.readdir.mockRejectedValue(new Error('ENOENT'));

      const dates = await getConversationDates('telegram');

      expect(dates).toEqual([]);
    });
  });
});
