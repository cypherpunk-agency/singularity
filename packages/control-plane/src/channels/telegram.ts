import { Bot, Context } from 'grammy';
import { TELEGRAM_COMMANDS } from '@singularity/shared';
import { WSManager } from '../ws/events.js';
import { saveHumanMessage, getRecentConversation } from '../conversation.js';
import { triggerAgentRun } from '../utils/agent.js';
import { queueManager } from '../queue/manager.js';
import { promises as fs } from 'fs';
import path from 'path';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

let bot: Bot | null = null;
let authorizedChatId: string | null = null;

export function startTelegramBot(wsManager: WSManager): void {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot');
    return;
  }

  authorizedChatId = chatId || null;
  bot = new Bot(token);

  // Command handlers
  bot.command('start', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Unauthorized. Your chat ID: ' + ctx.chat.id);
      return;
    }
    await ctx.reply('Singularity Control Bot\n\nCommands:\n/status - Agent status\n/history - Recent conversation\n/run - Trigger agent run\n/help - Show help');
  });

  bot.command('help', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.reply(`Available commands:
${TELEGRAM_COMMANDS.STATUS} - Current agent status
${TELEGRAM_COMMANDS.HISTORY} - Recent conversation summary
${TELEGRAM_COMMANDS.SEARCH} <query> - Search memory/files
${TELEGRAM_COMMANDS.RUN} - Trigger immediate agent run

Or just send any text to chat with the agent.`);
  });

  bot.command('status', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    try {
      const status = await getAgentStatus();
      await ctx.reply(
        `Agent Status: ${status.status}\n` +
        `Session: ${status.sessionId || 'unknown'}\n` +
        `Last Run: ${status.lastRun || 'never'}\n` +
        `Last Run Success: ${status.lastRunSuccess ?? 'N/A'}\n` +
        `Next Scheduled: ${status.nextScheduledRun || 'unknown'}`
      );
    } catch (error) {
      await ctx.reply('Failed to get status: ' + error);
    }
  });

  bot.command('history', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    try {
      // Get telegram conversation history
      const messages = await getRecentConversation('telegram', 3);
      if (messages.length === 0) {
        await ctx.reply('No recent Telegram conversation history.');
        return;
      }

      const summary = messages.slice(-10).map(m => {
        const from = m.from === 'human' ? 'You' : 'Agent';
        const text = m.text.length > 100 ? m.text.substring(0, 100) + '...' : m.text;
        return `[${from}] ${text}`;
      }).join('\n\n');

      await ctx.reply(`Recent conversation:\n\n${summary}`);
    } catch (error) {
      await ctx.reply('Failed to get history: ' + error);
    }
  });

  bot.command('search', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    const query = ctx.message?.text?.replace('/search', '').trim();
    if (!query) {
      await ctx.reply('Usage: /search <query>');
      return;
    }

    await ctx.reply(`Searching for: ${query}\n(Vector search not yet implemented in Telegram)`);
  });

  bot.command('run', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    try {
      const queueId = await triggerAgentRun({ type: 'cron' });
      if (queueId) {
        await ctx.reply(`Agent run queued (ID: ${queueId.slice(0, 8)}...)`);
      } else {
        await ctx.reply('Agent run already pending');
      }
    } catch (error) {
      await ctx.reply('Failed to trigger run: ' + error);
    }
  });

  // Handle regular messages as chat
  bot.on('message:text', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Unauthorized. Your chat ID: ' + ctx.chat.id);
      return;
    }

    const text = ctx.message.text;

    // Skip if it's a command
    if (text.startsWith('/')) return;

    try {
      // Save message to telegram conversation channel
      const message = await saveHumanMessage(text, 'telegram');
      wsManager.broadcastChatMessage(message);

      // React with thumbs up to acknowledge receipt
      await ctx.react('👍');

      // Trigger agent with telegram channel context and vector search
      // Agent response will be auto-extracted and sent when run completes
      await triggerAgentRun({ channel: 'telegram', type: 'chat', query: text });
    } catch (error) {
      await ctx.reply('Failed to send message: ' + error);
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error('Telegram bot error:', err);
  });

  // Start the bot
  bot.start();
  console.log('Telegram bot started');
}

function isAuthorized(ctx: Context): boolean {
  if (!authorizedChatId) {
    // No chat ID configured, authorize all
    return true;
  }
  return String(ctx.chat?.id) === authorizedChatId;
}

async function getAgentStatus() {
  const basePath = getBasePath();

  let sessionId: string | null = null;
  try {
    sessionId = (await fs.readFile(path.join(basePath, 'state', 'session-id.txt'), 'utf-8')).trim();
  } catch {
    // No session file
  }

  let lastRun: { timestamp: string; exit_code: number } | null = null;
  try {
    const historyPath = path.join(basePath, 'state', 'run-history.jsonl');
    const content = await fs.readFile(historyPath, 'utf-8');
    const lines = content.trim().split('\n').filter(l => l.trim());
    if (lines.length > 0) {
      lastRun = JSON.parse(lines[lines.length - 1]);
    }
  } catch {
    // No history file
  }

  // Check queue for processing status
  const processingRun = await queueManager.getProcessing();
  const pendingRuns = await queueManager.getPending();
  const status: 'idle' | 'running' | 'error' = processingRun ? 'running' : 'idle';

  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0);
  nextHour.setSeconds(0);
  nextHour.setMilliseconds(0);
  nextHour.setHours(nextHour.getHours() + 1);

  return {
    status,
    lastRun: lastRun?.timestamp || null,
    lastRunSuccess: lastRun ? lastRun.exit_code === 0 : null,
    sessionId,
    nextScheduledRun: nextHour.toISOString(),
    pendingCount: pendingRuns.length,
  };
}

/**
 * Send a message to Telegram (called when agent responds via /api/chat/respond)
 */
export async function sendToTelegram(text: string): Promise<void> {
  if (!bot || !authorizedChatId) return;

  try {
    await bot.api.sendMessage(authorizedChatId, text);
  } catch (error) {
    console.error('Failed to send Telegram message:', error);
  }
}
