/**
 * Vector search integration for memory retrieval
 * Queries the vector service to find relevant memory snippets
 */

import { estimateTokens } from './tokens.js';
import { vectorSearch, isVectorServiceAvailable as checkVectorAvailable } from '../services/vector-client.js';

export interface MemorySource {
  file: string;
  excerpt: string;
  score: number;
}

export interface MemorySearchResult {
  content: string;
  tokenEstimate: number;
  sources: MemorySource[];
}

/**
 * Format a search result excerpt for inclusion in context
 */
function formatExcerpt(result: { file: string; content: string; score: number }): string {
  const filename = result.file.split('/').pop() || result.file;
  return `### From ${filename}\n${result.content.trim()}`;
}

/**
 * Search memory using vector service
 * Returns relevant snippets from MEMORY.md and daily memory files
 */
export async function searchMemory(query: string, options: {
  maxResults?: number;
  maxTokens?: number;
} = {}): Promise<MemorySearchResult> {
  const { maxResults = 5, maxTokens = 1500 } = options;

  try {
    const results = await vectorSearch(query, maxResults);

    // Deduplicate and format results
    let content = '';
    let tokenCount = 0;
    const includedSources: MemorySource[] = [];
    const seenContent = new Set<string>();

    for (const result of results) {
      // Skip duplicates
      const contentHash = result.content.trim().slice(0, 100);
      if (seenContent.has(contentHash)) continue;
      seenContent.add(contentHash);

      const excerpt = formatExcerpt(result);
      const excerptTokens = estimateTokens(excerpt);

      if (tokenCount + excerptTokens > maxTokens) break;

      content += excerpt + '\n\n';
      tokenCount += excerptTokens;
      includedSources.push({
        file: result.file,
        excerpt: result.content.trim().slice(0, 200),
        score: result.score,
      });
    }

    return {
      content: content.trim(),
      tokenEstimate: tokenCount,
      sources: includedSources,
    };
  } catch (error) {
    console.error('Vector search failed:', error);
    return { content: '', tokenEstimate: 0, sources: [] };
  }
}

/**
 * Check if vector service is available
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  return checkVectorAvailable();
}
