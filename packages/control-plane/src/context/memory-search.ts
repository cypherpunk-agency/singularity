/**
 * Vector search integration for memory retrieval
 * Queries the vector service to find relevant memory snippets
 */

import { estimateTokens } from './tokens.js';

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://vector:5000';

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

interface VectorSearchResponse {
  results: Array<{
    file: string;
    content: string;
    score: number;
  }>;
  query: string;
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
    const response = await fetch(
      `${VECTOR_SERVICE_URL}/search?q=${encodeURIComponent(query)}&limit=${maxResults}`
    );

    if (!response.ok) {
      console.error('Vector search returned non-OK status:', response.status);
      return { content: '', tokenEstimate: 0, sources: [] };
    }

    const data = await response.json() as VectorSearchResponse;
    const results = data.results || [];

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
  try {
    const response = await fetch(`${VECTOR_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
