// Message types for chat interface
export interface Message {
  id: string;
  text: string;
  from: 'human' | 'agent';
  channel: 'web' | 'telegram';
  timestamp: string; // ISO 8601
}

export interface ConversationEntry {
  messages: Message[];
  date: string; // YYYY-MM-DD
}

// Agent status
export type AgentRunStatus = 'idle' | 'running' | 'error';

export interface AgentStatus {
  status: AgentRunStatus;
  lastRun: string | null; // ISO 8601
  lastRunDuration: number | null; // ms
  lastRunSuccess: boolean | null;
  sessionId: string | null;
  nextScheduledRun: string | null; // ISO 8601
}

// Run history entry (from run-history.jsonl)
export interface RunHistoryEntry {
  timestamp: string;
  sessionId: string;
  duration: number; // ms
  success: boolean;
  tokensUsed?: number;
  cost?: number;
  output?: string;
}

// File system types
export interface FileInfo {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string; // ISO 8601
}

export interface FileContent {
  path: string;
  content: string;
  modified: string;
}

// Agent output (parsed from agent-output JSON files)
export interface AgentOutput {
  id: string;
  timestamp: string;
  model: string;
  result: string;
  costUsd?: number;
  durationMs?: number;
  sessionId?: string;
}

// WebSocket event types
export type WSEventType =
  | 'file:changed'
  | 'file:created'
  | 'file:deleted'
  | 'agent:started'
  | 'agent:completed'
  | 'chat:received'
  | 'chat:typing'
  | 'status:update';

export interface WSEvent<T = unknown> {
  type: WSEventType;
  payload: T;
  timestamp: string;
}

export interface FileChangedPayload {
  path: string;
  content?: string;
  changeType: 'modified' | 'created' | 'deleted';
}

export interface AgentStartedPayload {
  sessionId: string;
  timestamp: string;
}

export interface AgentCompletedPayload {
  sessionId: string;
  duration: number;
  success: boolean;
}

export interface ChatReceivedPayload {
  message: Message;
}

export interface ChatTypingPayload {
  active: boolean;
}

export interface StatusUpdatePayload {
  status: AgentStatus;
}

// API request/response types
export interface SendMessageRequest {
  text: string;
  channel?: 'web' | 'telegram';
}

export interface SendMessageResponse {
  success: boolean;
  messageId: string;
}

export interface TriggerRunRequest {
  immediate?: boolean;
  prompt?: string;
}

export interface TriggerRunResponse {
  success: boolean;
  message: string;
}

export interface SearchRequest {
  query: string;
  limit?: number;
}

export interface SearchResult {
  file: string;
  content: string;
  score: number;
}

export interface SearchResponse {
  results: SearchResult[];
  query: string;
}
