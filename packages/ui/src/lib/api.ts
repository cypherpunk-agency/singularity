import { AgentStatus, Message, FileInfo, FileContent, AgentOutput, AgentSession } from '@singularity/shared';

const API_BASE = '/api';

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }

  return response.json();
}

// Status
export async function getStatus(): Promise<AgentStatus> {
  return fetchJson<AgentStatus>(`${API_BASE}/status`);
}

// Chat
export async function sendMessage(text: string): Promise<{ success: boolean; messageId: string }> {
  return fetchJson(`${API_BASE}/chat`, {
    method: 'POST',
    body: JSON.stringify({ text, channel: 'web' }),
  });
}

export async function getChatHistory(days?: number): Promise<{ messages: Message[]; dates: string[] }> {
  const params = days ? `?days=${days}` : '';
  return fetchJson(`${API_BASE}/chat/history${params}`);
}

export async function getChatHistoryByDate(date: string): Promise<{ messages: Message[]; date: string }> {
  return fetchJson(`${API_BASE}/chat/history/${date}`);
}

// Files
export async function getFiles(): Promise<{ files: FileInfo[] }> {
  return fetchJson(`${API_BASE}/files`);
}

export async function getFileContent(path: string): Promise<FileContent> {
  return fetchJson(`${API_BASE}/files/${path}`);
}

export async function updateFileContent(path: string, content: string): Promise<{ success: boolean }> {
  return fetchJson(`${API_BASE}/files/${path}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function searchFiles(query: string): Promise<{ results: { file: string; content: string; score: number }[] }> {
  return fetchJson(`${API_BASE}/files/search?q=${encodeURIComponent(query)}`);
}

// Outputs
export async function getOutputs(limit?: number): Promise<{ outputs: AgentOutput[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchJson(`${API_BASE}/outputs${params}`);
}

export async function getOutput(id: string): Promise<AgentOutput> {
  return fetchJson(`${API_BASE}/outputs/${id}`);
}

// Agent Control
export async function triggerRun(): Promise<{ success: boolean; message: string }> {
  return fetchJson(`${API_BASE}/agent/run`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getRuns(limit?: number): Promise<{ runs: unknown[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchJson(`${API_BASE}/runs${params}`);
}

// Sessions
export async function getSessions(limit?: number): Promise<{ sessions: AgentSession[] }> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchJson(`${API_BASE}/sessions${params}`);
}

export async function getSession(id: string): Promise<AgentSession & { inputContent?: string; outputContent?: string }> {
  return fetchJson(`${API_BASE}/sessions/${id}`);
}

// Usage
export interface UsageSummary {
  totalCost: number;
  totalRequests: number;
  byService: Record<string, { cost: number; requests: number }>;
  entries: UsageEntry[];
}

export interface UsageEntry {
  timestamp: string;
  provider: string;
  service: string;
  model: string;
  inputUnits: number;
  estimatedCost: number;
  status: 'success' | 'error';
  metadata?: string;
}

export async function getUsageToday(): Promise<UsageSummary> {
  return fetchJson(`${API_BASE}/usage/today`);
}

export async function getUsageMonth(): Promise<UsageSummary> {
  return fetchJson(`${API_BASE}/usage/month`);
}
