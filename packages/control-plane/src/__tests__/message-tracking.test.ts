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

describe('message tracking', () => {
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

  describe('saveHumanMessage without processedAt', () => {
    it('creates message without processedAt field', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      const message = await saveHumanMessage('Hello agent', 'web');

      expect(message).toEqual({
        id: 'test-uuid-1234',
        text: 'Hello agent',
        from: 'human',
        channel: 'web',
        timestamp: '2024-01-15T10:30:00.000Z',
        // Note: no processedAt field
      });
      expect(message.processedAt).toBeUndefined();
    });

    it('JSONL output does not contain processedAt', async () => {
      const { saveHumanMessage } = await import('../conversation.js');

      await saveHumanMessage('Test message', 'web');

      const appendCall = mockedFs.appendFile.mock.calls[0];
      const content = appendCall[1] as string;

      // Should not contain processedAt in the JSON
      expect(content).not.toContain('processedAt');
    });
  });

  describe('markMessagesAsProcessed', () => {
    it('updates messages with matching IDs', async () => {
      const { markMessagesAsProcessed } = await import('../conversation.js');

      const existingMessages = [
        '{"id":"msg-1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
        '{"id":"msg-2","text":"World","from":"human","channel":"web","timestamp":"2024-01-15T10:01:00Z"}',
        '{"id":"msg-3","text":"Reply","from":"agent","channel":"web","timestamp":"2024-01-15T10:02:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(existingMessages);

      await markMessagesAsProcessed('web', ['msg-1', 'msg-2'], '2024-01-15T10:30:00.000Z');

      expect(mockedFs.writeFile).toHaveBeenCalledTimes(1);
      const writeCall = mockedFs.writeFile.mock.calls[0];
      const writtenContent = writeCall[1] as string;

      const lines = writtenContent.trim().split('\n');
      expect(lines).toHaveLength(3);

      const msg1 = JSON.parse(lines[0]);
      const msg2 = JSON.parse(lines[1]);
      const msg3 = JSON.parse(lines[2]);

      expect(msg1.processedAt).toBe('2024-01-15T10:30:00.000Z');
      expect(msg2.processedAt).toBe('2024-01-15T10:30:00.000Z');
      expect(msg3.processedAt).toBeUndefined(); // Agent message unchanged
    });

    it('does nothing when messageIds is empty', async () => {
      const { markMessagesAsProcessed } = await import('../conversation.js');

      await markMessagesAsProcessed('web', []);

      expect(mockedFs.readFile).not.toHaveBeenCalled();
      expect(mockedFs.writeFile).not.toHaveBeenCalled();
    });

    it('handles file not existing gracefully', async () => {
      const { markMessagesAsProcessed } = await import('../conversation.js');

      mockedFs.readFile.mockRejectedValue(new Error('ENOENT'));

      // Should not throw
      await expect(
        markMessagesAsProcessed('web', ['msg-1'])
      ).resolves.toBeUndefined();
    });
  });

  describe('getUnprocessedMessages', () => {
    it('returns only human messages without processedAt', async () => {
      const { getUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue(['2024-01-15.jsonl'] as any);

      const messages = [
        '{"id":"1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
        '{"id":"2","text":"Processed","from":"human","channel":"web","timestamp":"2024-01-15T10:01:00Z","processedAt":"2024-01-15T10:05:00Z"}',
        '{"id":"3","text":"Reply","from":"agent","channel":"web","timestamp":"2024-01-15T10:02:00Z"}',
        '{"id":"4","text":"Another","from":"human","channel":"web","timestamp":"2024-01-15T10:03:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(messages);

      const unprocessed = await getUnprocessedMessages('web');

      expect(unprocessed).toHaveLength(2);
      expect(unprocessed[0].id).toBe('1');
      expect(unprocessed[1].id).toBe('4');
    });

    it('excludes agent messages', async () => {
      const { getUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue(['2024-01-15.jsonl'] as any);

      const messages = [
        '{"id":"1","text":"Reply","from":"agent","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(messages);

      const unprocessed = await getUnprocessedMessages('web');

      expect(unprocessed).toHaveLength(0);
    });

    it('returns empty array when no messages exist', async () => {
      const { getUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue([] as any);

      const unprocessed = await getUnprocessedMessages('web');

      expect(unprocessed).toEqual([]);
    });
  });

  describe('hasUnprocessedMessages', () => {
    it('returns true if channel has unprocessed messages', async () => {
      const { hasUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue(['2024-01-15.jsonl'] as any);

      const messages = [
        '{"id":"1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(messages);

      const result = await hasUnprocessedMessages('web');

      expect(result).toBe(true);
    });

    it('returns false if all messages are processed', async () => {
      const { hasUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue(['2024-01-15.jsonl'] as any);

      const messages = [
        '{"id":"1","text":"Hello","from":"human","channel":"web","timestamp":"2024-01-15T10:00:00Z","processedAt":"2024-01-15T10:05:00Z"}',
      ].join('\n');

      mockedFs.readFile.mockResolvedValue(messages);

      const result = await hasUnprocessedMessages('web');

      expect(result).toBe(false);
    });

    it('checks all channels when no channel specified', async () => {
      const { hasUnprocessedMessages } = await import('../conversation.js');

      // First call for web (empty), second for telegram (has unprocessed)
      mockedFs.readdir
        .mockResolvedValueOnce([] as any) // web: no files
        .mockResolvedValueOnce(['2024-01-15.jsonl'] as any); // telegram: has files

      mockedFs.readFile.mockResolvedValue(
        '{"id":"1","text":"Hello","from":"human","channel":"telegram","timestamp":"2024-01-15T10:00:00Z"}'
      );

      const result = await hasUnprocessedMessages();

      expect(result).toBe(true);
    });

    it('returns false when all channels are empty', async () => {
      const { hasUnprocessedMessages } = await import('../conversation.js');

      mockedFs.readdir.mockResolvedValue([] as any);

      const result = await hasUnprocessedMessages();

      expect(result).toBe(false);
    });
  });
});
