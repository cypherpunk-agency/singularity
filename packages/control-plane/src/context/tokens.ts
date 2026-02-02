/**
 * Token estimation utilities for context budgeting
 * Uses heuristics to avoid tiktoken dependency
 */

/**
 * Rough estimate: ~4 characters per token for English text
 * This is a fast approximation suitable for budgeting
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * More accurate estimate using word boundaries
 * Splits on whitespace and punctuation, accounts for long words
 */
export function estimateTokensAccurate(text: string): number {
  if (!text) return 0;

  // Split on whitespace and punctuation
  const words = text.split(/[\s\p{P}]+/u).filter(w => w.length > 0);

  // Most words are 1 token, long words might be 2+
  return words.reduce((sum, word) => {
    if (word.length <= 4) return sum + 1;
    return sum + Math.ceil(word.length / 4);
  }, 0);
}

/**
 * Truncate text to fit within a token budget
 * Truncates from the beginning, keeping the most recent content
 */
export function truncateToTokenBudget(text: string, maxTokens: number): string {
  const currentTokens = estimateTokens(text);
  if (currentTokens <= maxTokens) return text;

  // Calculate how many characters to keep (from the end)
  const targetChars = maxTokens * 4;
  return '...' + text.slice(-targetChars);
}

/**
 * Truncate an array of items to fit within a token budget
 * Returns items from the end (most recent) that fit
 */
export function truncateArrayToTokenBudget<T>(
  items: T[],
  getContent: (item: T) => string,
  maxTokens: number
): T[] {
  const result: T[] = [];
  let usedTokens = 0;

  // Start from the end (most recent)
  for (let i = items.length - 1; i >= 0; i--) {
    const content = getContent(items[i]);
    const itemTokens = estimateTokens(content);

    if (usedTokens + itemTokens > maxTokens) break;

    result.unshift(items[i]);
    usedTokens += itemTokens;
  }

  return result;
}
