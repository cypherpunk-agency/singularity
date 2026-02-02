/**
 * Response formatter for channel-specific formatting
 * Handles truncation for Telegram and formatting for web
 */

import { Channel } from '@singularity/shared';

// Telegram message limit is 4096 chars, leave room for truncation notice
const TELEGRAM_MAX_LENGTH = 3500;

export interface FormatOptions {
  runId?: string;
  duration?: number;  // ms
  cost?: number;      // USD
}

/**
 * Format a response for a specific channel
 */
export function formatForChannel(
  text: string,
  channel: Channel,
  options: FormatOptions = {}
): string {
  if (channel === 'telegram') {
    return formatForTelegram(text);
  }
  return formatForWeb(text, options);
}

/**
 * Format response for web UI
 * Keeps full markdown, adds session link if runId provided
 */
function formatForWeb(text: string, _options: FormatOptions): string {
  // Web UI supports full markdown, return as-is
  return text;
}

/**
 * Format response for Telegram
 * - Truncates to fit Telegram's 4096 char limit
 * - Converts some markdown to Telegram-compatible format
 */
function formatForTelegram(text: string): string {
  let formatted = text;

  // Convert some markdown to simpler format
  // Remove triple backticks (code blocks) - keep content but simplify
  formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
    // Extract content without the backticks and language identifier
    const lines = match.split('\n');
    if (lines.length > 2) {
      // Remove first and last line (```)
      return lines.slice(1, -1).join('\n');
    }
    return match.replace(/```/g, '');
  });

  // Convert inline code to regular text (Telegram has limited code support)
  formatted = formatted.replace(/`([^`]+)`/g, '$1');

  // Truncate if needed
  if (formatted.length > TELEGRAM_MAX_LENGTH) {
    formatted = formatted.substring(0, TELEGRAM_MAX_LENGTH);
    // Try to cut at a word boundary
    const lastSpace = formatted.lastIndexOf(' ');
    if (lastSpace > TELEGRAM_MAX_LENGTH - 100) {
      formatted = formatted.substring(0, lastSpace);
    }
    formatted += '\n\n(truncated)';
  }

  return formatted;
}

/**
 * Check if text needs truncation for a channel
 */
export function needsTruncation(text: string, channel: Channel): boolean {
  if (channel === 'telegram') {
    return text.length > TELEGRAM_MAX_LENGTH;
  }
  return false;
}
