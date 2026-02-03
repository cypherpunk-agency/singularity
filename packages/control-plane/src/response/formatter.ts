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
 * - Converts markdown to HTML for Telegram parse_mode: 'HTML'
 */
function formatForTelegram(text: string): string {
  let formatted = text;

  // Convert markdown to HTML for Telegram
  // Note: Telegram supports HTML parse mode with tags: <b>, <i>, <code>, <pre>, etc.

  // Convert bold **text** or __text__ to <b>text</b>
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/__(.+?)__/g, '<b>$1</b>');

  // Convert italic *text* or _text_ to <i>text</i>
  formatted = formatted.replace(/\*(.+?)\*/g, '<i>$1</i>');
  formatted = formatted.replace(/_(.+?)_/g, '<i>$1</i>');

  // Convert code blocks ```code``` to <pre>code</pre>
  // IMPORTANT: Must run BEFORE inline code to avoid backticks being partially matched
  formatted = formatted.replace(/```[\s\S]*?```/g, (match) => {
    // Extract content without the backticks and language identifier
    const lines = match.split('\n');
    let content = match;
    if (lines.length > 2) {
      // Remove first line (``` or ```language) and last line (```)
      content = lines.slice(1, -1).join('\n');
    } else {
      content = match.replace(/```/g, '');
    }
    // Escape HTML entities in code blocks
    content = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre>${content}</pre>`;
  });

  // Convert inline code `code` to <code>code</code>
  formatted = formatted.replace(/`([^`]+?)`/g, '<code>$1</code>');

  // Escape remaining HTML entities (but not our tags)
  // This is a simplified approach - in production, use a proper HTML escaping library
  formatted = formatted.replace(/&(?!(amp|lt|gt|quot);)/g, '&amp;');

  // Truncate if needed - safely close any open HTML tags
  if (formatted.length > TELEGRAM_MAX_LENGTH) {
    formatted = safeHtmlTruncate(formatted, TELEGRAM_MAX_LENGTH);
  }

  return formatted;
}

/**
 * Safely truncate HTML while closing any open tags
 * Prevents malformed HTML from breaking Telegram API
 */
function safeHtmlTruncate(html: string, maxLength: number): string {
  if (html.length <= maxLength) return html;

  // Track open tags
  const openTags: string[] = [];
  const tagRegex = /<(\/?)(pre|code|b|i)>/gi;
  let match;
  let lastSafeIndex = 0;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match.index >= maxLength) break;

    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();

    if (isClosing) {
      // Remove matching open tag
      const idx = openTags.lastIndexOf(tagName);
      if (idx !== -1) openTags.splice(idx, 1);
    } else {
      openTags.push(tagName);
    }

    // Safe truncation point is after complete tags (when all tags are closed)
    if (openTags.length === 0) {
      lastSafeIndex = match.index + match[0].length;
    }
  }

  // Truncate at safe point or max length
  let truncateAt = Math.min(lastSafeIndex || maxLength, maxLength);
  let result = html.substring(0, truncateAt);

  // Close any remaining open tags in reverse order
  while (openTags.length > 0) {
    const tag = openTags.pop();
    result += `</${tag}>`;
  }

  result += '\n\n<i>(truncated - full response in web UI)</i>';
  return result;
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
