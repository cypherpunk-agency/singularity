import { create } from 'zustand';
import { Message, AgentStatus, FileInfo, AgentOutput, AgentSession } from '@singularity/shared';
import * as api from './lib/api';

interface AppState {
  // Status
  status: AgentStatus | null;
  statusLoading: boolean;

  // Chat
  messages: Message[];
  messagesLoading: boolean;
  sendingMessage: boolean;
  agentProcessing: boolean;  // True when agent is processing a chat message
  currentRunId: string | null;  // Run ID of current processing job

  // Files
  files: FileInfo[];
  filesLoading: boolean;
  selectedFile: string | null;
  fileContent: string | null;
  fileContentLoading: boolean;

  // Outputs
  outputs: AgentOutput[];
  outputsLoading: boolean;

  // Sessions
  sessions: AgentSession[];
  sessionsLoading: boolean;

  // View
  activeView: 'chat' | 'files' | 'outputs' | 'history';

  // Actions
  setActiveView: (view: 'chat' | 'files' | 'outputs' | 'history') => void;
  fetchStatus: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  fetchFiles: () => Promise<void>;
  selectFile: (path: string | null) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  triggerRun: () => Promise<void>;
  addMessage: (message: Message) => void;
  updateStatus: (status: AgentStatus) => void;
  fetchOutputs: () => Promise<void>;
  fetchSessions: () => Promise<void>;
  setAgentProcessing: (processing: boolean, runId?: string | null) => void;
}

export const useStore = create<AppState>((set, _get) => ({
  // Initial state
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
  activeView: 'chat',

  // Actions
  setActiveView: (view) => set({ activeView: view }),

  fetchStatus: async () => {
    set({ statusLoading: true });
    try {
      const status = await api.getStatus();
      set({ status, statusLoading: false });
    } catch (error) {
      console.error('Failed to fetch status:', error);
      set({ statusLoading: false });
    }
  },

  fetchHistory: async () => {
    set({ messagesLoading: true });
    try {
      const { messages } = await api.getChatHistory();
      set({ messages, messagesLoading: false });
    } catch (error) {
      console.error('Failed to fetch history:', error);
      set({ messagesLoading: false });
    }
  },

  fetchFiles: async () => {
    set({ filesLoading: true });
    try {
      const { files } = await api.getFiles();
      set({ files, filesLoading: false });
    } catch (error) {
      console.error('Failed to fetch files:', error);
      set({ filesLoading: false });
    }
  },

  selectFile: async (path) => {
    if (!path) {
      set({ selectedFile: null, fileContent: null });
      return;
    }

    set({ selectedFile: path, fileContentLoading: true });
    try {
      const { content } = await api.getFileContent(path);
      set({ fileContent: content, fileContentLoading: false });
    } catch (error) {
      console.error('Failed to fetch file:', error);
      set({ fileContent: null, fileContentLoading: false });
    }
  },

  sendMessage: async (text) => {
    set({ sendingMessage: true });
    try {
      await api.sendMessage(text);
      // Message will be added via WebSocket
      set({ sendingMessage: false });
    } catch (error) {
      console.error('Failed to send message:', error);
      set({ sendingMessage: false });
    }
  },

  triggerRun: async () => {
    try {
      await api.triggerRun();
      // Status will be updated via WebSocket
    } catch (error) {
      console.error('Failed to trigger run:', error);
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: [...state.messages, message],
    }));
  },

  updateStatus: (status) => {
    set({ status });
  },

  fetchOutputs: async () => {
    set({ outputsLoading: true });
    try {
      const { outputs } = await api.getOutputs();
      set({ outputs, outputsLoading: false });
    } catch (error) {
      console.error('Failed to fetch outputs:', error);
      set({ outputsLoading: false });
    }
  },

  fetchSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const { sessions } = await api.getSessions();
      set({ sessions, sessionsLoading: false });
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      set({ sessionsLoading: false });
    }
  },

  setAgentProcessing: (processing, runId = null) => {
    set({ agentProcessing: processing, currentRunId: runId });
  },
}));
