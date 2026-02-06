import { Bot, Context, InlineKeyboard } from 'grammy';
import { TELEGRAM_COMMANDS } from '@singularity/shared';
import { WSManager } from '../ws/events.js';
import { saveHumanMessage } from '../conversation.js';
import { triggerAgentRun } from '../utils/agent.js';
import { queueWorker } from '../queue/worker.js';
import { transcribe } from '../services/transcription.js';
import { synthesize } from '../services/tts.js';
import { getTelegramPreferences, setTelegramPreferences } from './telegram-preferences.js';
import { InputFile } from 'grammy';
import { promises as fs } from 'fs';
import path from 'path';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

export let bot: Bot | null = null;
export let authorizedChatId: string | null = null;

// Track active typing indicators by chat ID
const activeTypingIntervals = new Map<string, NodeJS.Timeout>();

export async function startTelegramBot(wsManager: WSManager): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set, skipping Telegram bot');
    return;
  }

  // Skip if token looks like a placeholder
  if (token === 'PLACEHOLDER' || token.length < 20) {
    console.log('TELEGRAM_BOT_TOKEN appears to be a placeholder, skipping Telegram bot');
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
    await ctx.reply('Singularity Control Bot\n\nCommands:\n/schedule - Today\'s schedule\n/run - Trigger agent run\n/help - Show help');
  });

  bot.command('help', async (ctx) => {
    if (!isAuthorized(ctx)) return;
    await ctx.reply(`Available commands:
${TELEGRAM_COMMANDS.SCHEDULE} - Today's and tomorrow's schedule
${TELEGRAM_COMMANDS.SEARCH} <query> - Search memory/files
${TELEGRAM_COMMANDS.RUN} - Trigger immediate agent run
${TELEGRAM_COMMANDS.SETTINGS} - Output settings (text/voice)

Or just send any text to chat with the agent.`);
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

  bot.command('settings', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    try {
      const prefs = await getTelegramPreferences();
      const keyboard = new InlineKeyboard()
        .text(prefs.outputMode === 'text' ? '✓ Text' : 'Text', 'output:text')
        .text(prefs.outputMode === 'voice' ? '✓ Voice' : 'Voice', 'output:voice');

      await ctx.reply('Output Mode:', { reply_markup: keyboard });
    } catch (error) {
      await ctx.reply('Failed to load settings: ' + error);
    }
  });

  bot.command('schedule', async (ctx) => {
    if (!isAuthorized(ctx)) return;

    try {
      const basePath = getBasePath();
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const formatDate = (d: Date) => d.toISOString().split('T')[0];
      const todayFile = path.join(basePath, 'agent/operations/tommi-daily-plan', `${formatDate(today)}.md`);
      const tomorrowFile = path.join(basePath, 'agent/operations/tommi-daily-plan', `${formatDate(tomorrow)}.md`);

      let response = '';

      // Today's schedule
      try {
        const todayPlan = await fs.readFile(todayFile, 'utf-8');
        response += `<b>📅 Today (${formatDate(today)})</b>\n\n${extractSchedule(todayPlan)}\n\n`;
      } catch {
        response += `<b>📅 Today</b>\nNo plan found.\n\n`;
      }

      // Tomorrow's schedule
      try {
        const tomorrowPlan = await fs.readFile(tomorrowFile, 'utf-8');
        response += `<b>📆 Tomorrow (${formatDate(tomorrow)})</b>\n\n${extractSchedule(tomorrowPlan)}`;
      } catch {
        response += `<b>📆 Tomorrow</b>\nNo plan found.`;
      }

      await ctx.reply(response, { parse_mode: 'HTML' });
    } catch (error) {
      await ctx.reply('Failed to get schedule: ' + error);
    }
  });

  // Handle callback queries for settings buttons
  bot.callbackQuery(/^output:/, async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.answerCallbackQuery('Unauthorized');
      return;
    }

    try {
      const mode = ctx.callbackQuery.data.split(':')[1] as 'text' | 'voice';
      await setTelegramPreferences({ outputMode: mode });

      // Update keyboard to show new selection
      const keyboard = new InlineKeyboard()
        .text(mode === 'text' ? '✓ Text' : 'Text', 'output:text')
        .text(mode === 'voice' ? '✓ Voice' : 'Voice', 'output:voice');

      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery(`Output mode: ${mode}`);
    } catch (error) {
      await ctx.answerCallbackQuery('Failed to update setting');
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

      // Start typing indicator while agent processes
      startTypingIndicator(ctx.chat.id);

      // Notify worker that message arrived - it will poll for unprocessed messages
      // Agent response will be auto-extracted and sent when run completes
      queueWorker.notifyMessageArrived('telegram');
    } catch (error) {
      await ctx.reply('Failed to send message: ' + error);
    }
  });

  // Handle voice messages
  bot.on('message:voice', async (ctx) => {
    if (!isAuthorized(ctx)) {
      await ctx.reply('Unauthorized. Your chat ID: ' + ctx.chat.id);
      return;
    }

    try {
      // Start typing indicator while transcribing
      startTypingIndicator(ctx.chat.id);

      // Download voice file from Telegram
      const file = await ctx.getFile();
      if (!file.file_path) {
        await ctx.reply('Could not get voice file');
        return;
      }

      const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
      const response = await fetch(fileUrl);
      const audioBuffer = Buffer.from(await response.arrayBuffer());

      // Transcribe via GPU-accelerated service
      const transcription = await transcribe(audioBuffer);

      // Reply with transcription first
      await ctx.reply(`Transcription: ${transcription}`);

      // Restart typing indicator for agent processing
      startTypingIndicator(ctx.chat.id);

      // Then process as regular chat message
      const message = await saveHumanMessage(transcription, 'telegram');
      wsManager.broadcastChatMessage(message);

      // Notify worker that message arrived
      queueWorker.notifyMessageArrived('telegram');
    } catch (error) {
      console.error('Voice message error:', error);
      await ctx.reply('Failed to process voice message: ' + (error instanceof Error ? error.message : String(error)));
    }
  });

  // Error handler
  bot.catch((err) => {
    console.error('Telegram bot error:', err);
  });

  // Register commands menu (non-critical, don't crash on failure)
  try {
    await registerBotCommands();
  } catch (error) {
    console.error('Failed to register bot commands:', error);
  }

  // Start the bot
  try {
    bot.start();
    console.log('Telegram bot started');
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    console.log('Continuing without Telegram integration');
    bot = null;
  }
}

function isAuthorized(ctx: Context): boolean {
  if (!authorizedChatId) {
    // No chat ID configured, authorize all
    return true;
  }
  return String(ctx.chat?.id) === authorizedChatId;
}

export function startTypingIndicator(chatId: string | number): void {
  const id = String(chatId);
  // Clear any existing interval
  stopTypingIndicator(id);

  // Send immediately, then every 4 seconds
  bot?.api.sendChatAction(id, 'typing').catch(() => {});

  const interval = setInterval(() => {
    bot?.api.sendChatAction(id, 'typing').catch(() => {});
  }, 4000);

  activeTypingIntervals.set(id, interval);
}

function stopTypingIndicator(chatId: string): void {
  const interval = activeTypingIntervals.get(chatId);
  if (interval) {
    clearInterval(interval);
    activeTypingIntervals.delete(chatId);
  }
}

/**
 * Send a message to Telegram (called when agent responds via /api/chat/respond)
 * @param htmlText - HTML-formatted text for text messages
 * @param plainText - Optional plain/markdown text for TTS (avoids reading HTML tags aloud)
 */
export async function sendToTelegram(htmlText: string, plainText?: string): Promise<void> {
  if (!bot || !authorizedChatId) return;

  // Stop typing indicator when sending response
  stopTypingIndicator(authorizedChatId);

  try {
    const prefs = await getTelegramPreferences();

    if (prefs.outputMode === 'voice') {
      // Synthesize voice and send as voice message
      // Use plainText for TTS if available, otherwise strip HTML tags
      const ttsText = plainText || htmlText.replace(/<[^>]+>/g, '');
      try {
        const audioBuffer = await synthesize(ttsText);
        await bot.api.sendVoice(authorizedChatId, new InputFile(audioBuffer, 'response.ogg'));
      } catch (ttsError) {
        // TTS failed, fall back to text with error indicator
        console.error('TTS synthesis failed, falling back to text:', ttsError);
        const fallbackText = `⚠️ <i>[Voice unavailable]</i>\n\n${htmlText}`;
        await bot.api.sendMessage(authorizedChatId, fallbackText, { parse_mode: 'HTML' });
      }
    } else {
      await bot.api.sendMessage(authorizedChatId, htmlText, { parse_mode: 'HTML' });
    }
  } catch (error) {
    // If HTML parsing failed, fallback to plain text
    if (error instanceof Error && error.message.includes("can't parse entities")) {
      console.warn('Telegram HTML parsing failed, falling back to plain text');
      const strippedText = stripHtmlForPlainText(htmlText);
      try {
        await bot.api.sendMessage(authorizedChatId, strippedText);
      } catch (fallbackError) {
        console.error('Telegram fallback also failed:', fallbackError);
      }
    } else {
      console.error('Failed to send Telegram message:', error);
    }
  }
}

/**
 * Extract schedule table from daily plan markdown
 */
function extractSchedule(markdown: string): string {
  // Extract the Schedule section table
  const scheduleMatch = markdown.match(/## Schedule\n([\s\S]*?)(?=\n##|$)/);
  if (!scheduleMatch) return 'No schedule section found.';

  // Parse and format the table for Telegram
  const lines = scheduleMatch[1].trim().split('\n').filter(l => l.startsWith('|'));
  if (lines.length <= 2) return 'No tasks scheduled.';

  // Skip header and separator, format tasks
  return lines.slice(2).map(line => {
    const cols = line.split('|').map(c => c.trim()).filter(Boolean);
    if (cols.length >= 2) {
      const time = cols[0];
      const task = cols[1];
      const pri = cols[2] || '';
      return `${time} - ${task}${pri ? ` [${pri}]` : ''}`;
    }
    return line;
  }).join('\n');
}

/**
 * Strip HTML tags and convert back to markdown-ish plain text
 * Used as fallback when Telegram rejects malformed HTML
 */
function stripHtmlForPlainText(html: string): string {
  return html
    .replace(/<pre>/g, '```\n')
    .replace(/<\/pre>/g, '\n```')
    .replace(/<code>/g, '`')
    .replace(/<\/code>/g, '`')
    .replace(/<b>/g, '*')
    .replace(/<\/b>/g, '*')
    .replace(/<i>/g, '_')
    .replace(/<\/i>/g, '_')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Register bot commands in Telegram's menu
 */
async function registerBotCommands(): Promise<void> {
  if (!bot) return;

  try {
    await bot.api.setMyCommands([
      { command: 'schedule', description: "Today's and tomorrow's schedule" },
      { command: 'run', description: 'Trigger agent run' },
      { command: 'settings', description: 'Output settings' },
      { command: 'help', description: 'Show commands' },
    ]);
    console.log('Telegram bot commands registered');
  } catch (error) {
    console.error('Failed to register bot commands:', error);
  }
}
