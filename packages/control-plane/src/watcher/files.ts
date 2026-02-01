import chokidar from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';
import { WATCH_CONFIG, Message, Channel } from '@singularity/shared';
import { WSManager } from '../ws/events.js';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

// Track last known content to detect actual changes
const fileCache = new Map<string, string>();

export function startFileWatcher(wsManager: WSManager): void {
  const basePath = getBasePath();

  // Build watch paths
  const watchPaths = WATCH_CONFIG.WATCH_PATTERNS.map(pattern =>
    path.join(basePath, pattern)
  );

  console.log('Starting file watcher for:', watchPaths);

  const watcher = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: WATCH_CONFIG.DEBOUNCE_MS,
      pollInterval: 50,
    },
  });

  watcher.on('add', async (filePath) => {
    console.log('File created:', filePath);
    const relativePath = path.relative(basePath, filePath);
    const content = await safeReadFile(filePath);

    if (content !== null) {
      fileCache.set(filePath, content);
      wsManager.broadcastFileChange(relativePath, content, 'created');

      // Check for new conversation entries
      if (isConversationFile(filePath)) {
        await processConversationFile(filePath, wsManager);
      }
    }
  });

  watcher.on('change', async (filePath) => {
    const relativePath = path.relative(basePath, filePath);
    const content = await safeReadFile(filePath);

    if (content === null) return;

    // Check if content actually changed
    const cached = fileCache.get(filePath);
    if (cached === content) return;

    fileCache.set(filePath, content);
    console.log('File changed:', relativePath);
    wsManager.broadcastFileChange(relativePath, content, 'modified');

    // Check for new conversation entries (in per-channel directories)
    if (isConversationFile(filePath)) {
      await processNewConversationEntries(filePath, cached || '', content, wsManager);
    }

    // Check for run history updates (agent started/completed)
    if (filePath.includes('run-history.jsonl')) {
      await processRunHistoryChange(filePath, cached || '', content, wsManager);
    }
  });

  watcher.on('unlink', (filePath) => {
    console.log('File deleted:', filePath);
    const relativePath = path.relative(basePath, filePath);
    fileCache.delete(filePath);
    wsManager.broadcastFileChange(relativePath, undefined, 'deleted');
  });

  watcher.on('error', (error) => {
    console.error('File watcher error:', error);
  });

  console.log('File watcher started');
}

/**
 * Check if a file is a conversation file (in per-channel directories)
 */
function isConversationFile(filePath: string): boolean {
  return (
    filePath.includes('conversation') &&
    filePath.endsWith('.jsonl') &&
    (filePath.includes('/web/') || filePath.includes('/telegram/'))
  );
}

/**
 * Extract channel from conversation file path
 */
function getChannelFromPath(filePath: string): Channel | null {
  if (filePath.includes('/web/')) return 'web';
  if (filePath.includes('/telegram/')) return 'telegram';
  return null;
}

async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

async function processConversationFile(filePath: string, wsManager: WSManager): Promise<void> {
  const content = await safeReadFile(filePath);
  if (!content) return;

  const lines = content.trim().split('\n').filter(l => l.trim());
  for (const line of lines) {
    try {
      const message = JSON.parse(line) as Message;
      wsManager.broadcastChatMessage(message);
    } catch {
      // Invalid line, skip
    }
  }
}

async function processNewConversationEntries(
  filePath: string,
  oldContent: string,
  newContent: string,
  wsManager: WSManager
): Promise<void> {
  const oldLines = new Set(oldContent.trim().split('\n').filter(l => l.trim()));
  const newLines = newContent.trim().split('\n').filter(l => l.trim());
  const channel = getChannelFromPath(filePath);

  for (const line of newLines) {
    if (!oldLines.has(line)) {
      try {
        const message = JSON.parse(line) as Message;
        // Ensure channel is set correctly
        if (channel && message.channel !== channel) {
          message.channel = channel;
        }
        wsManager.broadcastChatMessage(message);
        console.log(`New ${message.from} message in ${channel} channel`);
      } catch {
        // Invalid line, skip
      }
    }
  }
}

async function processRunHistoryChange(
  _filePath: string,
  oldContent: string,
  newContent: string,
  wsManager: WSManager
): Promise<void> {
  const oldLines = oldContent.trim().split('\n').filter(l => l.trim());
  const newLines = newContent.trim().split('\n').filter(l => l.trim());

  // Check for new entries
  if (newLines.length > oldLines.length) {
    const lastLine = newLines[newLines.length - 1];
    try {
      const entry = JSON.parse(lastLine);
      wsManager.broadcastAgentCompleted(
        entry.session_id || entry.sessionId || 'unknown',
        entry.duration_seconds || entry.duration || 0,
        entry.exit_code === 0
      );
      console.log(`Agent run completed: ${entry.runId || 'unknown'} (${entry.type}${entry.channel ? ':' + entry.channel : ''})`);
    } catch {
      // Invalid entry, skip
    }
  }
}
