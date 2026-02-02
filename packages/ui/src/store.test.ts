import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStore } from './store';

// Mock the API module
vi.mock('./lib/api', () => ({
  getStatus: vi.fn(),
  getChatHistory: vi.fn(),
  getFiles: vi.fn(),
  getFileContent: vi.fn(),
  sendMessage: vi.fn(),
  triggerRun: vi.fn(),
  getOutputs: vi.fn(),
  getSessions: vi.fn(),
}));

import * as api from './lib/api';
const mockApi = vi.mocked(api);

describe('store', () => {
  beforeEach(() => {
    // Reset store state between tests
    useStore.setState({
      status: null,
      statusLoading: false,
      messages: [],
      messagesLoading: false,
      sendingMessage: false,
      agentProcessing: false,
      currentRunId: null,
      files: [],
      filesLoading: false,
      selectedFile: null,
      fileContent: null,
      fileContentLoading: false,
      outputs: [],
      outputsLoading: false,
      sessions: [],
      sessionsLoading: false,
    });
    vi.clearAllMocks();
  });

  describe('initial state', () => {
    it('has correct default values', () => {
      const state = useStore.getState();
      expect(state.status).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.files).toEqual([]);
      expect(state.agentProcessing).toBe(false);
      expect(state.currentRunId).toBeNull();
    });
  });

  describe('fetchStatus', () => {
    it('sets loading state and fetches status', async () => {
      const mockStatus = { state: 'idle', lastRun: null } as any;
      mockApi.getStatus.mockResolvedValue(mockStatus);

      await useStore.getState().fetchStatus();

      expect(useStore.getState().status).toEqual(mockStatus);
      expect(useStore.getState().statusLoading).toBe(false);
    });

    it('handles fetch errors gracefully', async () => {
      mockApi.getStatus.mockRejectedValue(new Error('Network error'));

      await useStore.getState().fetchStatus();

      expect(useStore.getState().status).toBeNull();
      expect(useStore.getState().statusLoading).toBe(false);
    });
  });

  describe('fetchHistory', () => {
    it('fetches and sets messages', async () => {
      const mockMessages = [
        { id: '1', from: 'human' as const, text: 'Hello', timestamp: '2024-01-01T00:00:00Z', channel: 'web' as const },
      ];
      mockApi.getChatHistory.mockResolvedValue({ messages: mockMessages, dates: [] });

      await useStore.getState().fetchHistory();

      expect(useStore.getState().messages).toEqual(mockMessages);
      expect(useStore.getState().messagesLoading).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('calls API and resets sending state', async () => {
      mockApi.sendMessage.mockResolvedValue({ success: true, messageId: '123' });

      await useStore.getState().sendMessage('Hello');

      expect(mockApi.sendMessage).toHaveBeenCalledWith('Hello');
      expect(useStore.getState().sendingMessage).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('appends message to the list', () => {
      const message = { id: '1', from: 'human' as const, text: 'Hello', timestamp: '2024-01-01T00:00:00Z', channel: 'web' as const };

      useStore.getState().addMessage(message);

      expect(useStore.getState().messages).toContainEqual(message);
    });

    it('preserves existing messages', () => {
      const existingMessage = { id: '1', from: 'human' as const, text: 'Hello', timestamp: '2024-01-01T00:00:00Z', channel: 'web' as const };
      const newMessage = { id: '2', from: 'agent' as const, text: 'Hi', timestamp: '2024-01-01T00:00:01Z', channel: 'web' as const };

      useStore.setState({ messages: [existingMessage] });

      useStore.getState().addMessage(newMessage);

      expect(useStore.getState().messages).toHaveLength(2);
      expect(useStore.getState().messages[0]).toEqual(existingMessage);
      expect(useStore.getState().messages[1]).toEqual(newMessage);
    });
  });

  describe('setAgentProcessing', () => {
    it('sets processing state and run ID', () => {
      useStore.getState().setAgentProcessing(true, 'run-123');

      expect(useStore.getState().agentProcessing).toBe(true);
      expect(useStore.getState().currentRunId).toBe('run-123');
    });

    it('clears processing state and run ID', () => {
      useStore.setState({ agentProcessing: true, currentRunId: 'run-123' });

      useStore.getState().setAgentProcessing(false);

      expect(useStore.getState().agentProcessing).toBe(false);
      expect(useStore.getState().currentRunId).toBeNull();
    });
  });

  describe('selectFile', () => {
    it('fetches file content when path is provided', async () => {
      mockApi.getFileContent.mockResolvedValue({ content: 'file contents', path: 'test.md', modified: '2024-01-01T00:00:00Z' });

      await useStore.getState().selectFile('test.md');

      expect(useStore.getState().selectedFile).toBe('test.md');
      expect(useStore.getState().fileContent).toBe('file contents');
      expect(useStore.getState().fileContentLoading).toBe(false);
    });

    it('clears file selection when path is null', async () => {
      useStore.setState({ selectedFile: 'test.md', fileContent: 'contents' });

      await useStore.getState().selectFile(null);

      expect(useStore.getState().selectedFile).toBeNull();
      expect(useStore.getState().fileContent).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('updates status directly', () => {
      const newStatus = { state: 'running', lastRun: '2024-01-01T00:00:00Z' };

      useStore.getState().updateStatus(newStatus as any);

      expect(useStore.getState().status).toEqual(newStatus);
    });
  });
});
