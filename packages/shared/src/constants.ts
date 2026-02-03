// File paths (relative to /app in container)
export const PATHS = {
  // Agent files
  AGENT_DIR: '/app/agent',
  HEARTBEAT_FILE: '/app/agent/config/HEARTBEAT.md',
  TASKS_FILE: '/app/agent/TASKS.md',
  MEMORY_FILE: '/app/agent/MEMORY.md',
  // INBOX_FILE removed - messages now go directly to conversation channels
  MEMORY_DIR: '/app/agent/memory',
  CONVERSATION_DIR: '/app/agent/conversation',

  // State files
  STATE_DIR: '/app/state',
  SESSION_ID_FILE: '/app/state/session-id.txt',
  RUN_HISTORY_FILE: '/app/state/run-history.jsonl',
  MEMORY_DB_FILE: '/app/state/memory.db',

  // Logs
  LOGS_DIR: '/app/logs',
  HEARTBEAT_LOG: '/app/logs/heartbeat.log',
  AGENT_OUTPUT_DIR: '/app/logs/agent-output',

  // Scripts
  SCRIPTS_DIR: '/app/scripts',
  HEARTBEAT_SCRIPT: '/app/scripts/heartbeat.sh',
  RUN_AGENT_SCRIPT: '/app/scripts/run-agent.sh',
} as const;

// WebSocket event names
export const WS_EVENTS = {
  FILE_CHANGED: 'file:changed',
  FILE_CREATED: 'file:created',
  FILE_DELETED: 'file:deleted',
  AGENT_STARTED: 'agent:started',
  AGENT_COMPLETED: 'agent:completed',
  CHAT_SEND: 'chat:send',
  CHAT_RECEIVED: 'chat:received',
  CHAT_TYPING: 'chat:typing',
  STATUS_UPDATE: 'status:update',
} as const;

// API endpoints
export const API = {
  // Chat
  CHAT: '/api/chat',
  CHAT_RESPOND: '/api/chat/respond',
  CHAT_HISTORY: '/api/chat/history',

  // Files
  FILES: '/api/files',
  FILES_SEARCH: '/api/files/search',

  // Outputs
  OUTPUTS: '/api/outputs',

  // Agent
  STATUS: '/api/status',
  AGENT_RUN: '/api/agent/run',
  RUNS: '/api/runs',

  // Debug
  DEBUG_CONVERSATIONS: '/api/debug/conversations',
  DEBUG_RUNS: '/api/debug/runs',
} as const;

// Server configuration defaults
export const SERVER_CONFIG = {
  CONTROL_PLANE_PORT: 3001,
  UI_PORT: 3000,
  WS_PATH: '/ws',
} as const;

// File watching configuration
export const WATCH_CONFIG = {
  // Files/directories to watch for changes
  WATCH_PATTERNS: [
    'agent/*.md',
    'agent/memory/*.md',
    'agent/conversation/web/*.jsonl',
    'agent/conversation/telegram/*.jsonl',
    'state/run-history.jsonl',
    'logs/agent-output/*.json',
  ],

  // Debounce delay for file changes (ms)
  DEBOUNCE_MS: 100,
} as const;

// Telegram commands
export const TELEGRAM_COMMANDS = {
  STATUS: '/status',
  HISTORY: '/history',
  SEARCH: '/search',
  RUN: '/run',
  TASKS: '/tasks',
  SETTINGS: '/settings',
  HELP: '/help',
} as const;
