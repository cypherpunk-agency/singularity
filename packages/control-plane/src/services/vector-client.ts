/**
 * Centralized vector service client
 * All HTTP calls to the vector service go through this module.
 */

const VECTOR_SERVICE_URL = process.env.VECTOR_SERVICE_URL || 'http://vector:5000';

interface VectorResult {
  file: string;
  content: string;
  score: number;
}

interface VectorSearchResponse {
  results: VectorResult[];
  query: string;
}

/**
 * Fetch with a single retry (500ms delay) to cover transient network blips.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {},
  retries = 1,
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 500));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
}

/**
 * Search memory using the vector service.
 * Returns results array; empty on failure (graceful degradation).
 */
export async function vectorSearch(
  query: string,
  limit: number = 5,
): Promise<VectorResult[]> {
  try {
    const response = await fetchWithRetry(
      `${VECTOR_SERVICE_URL}/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    );

    if (!response.ok) {
      console.error('Vector search returned non-OK status:', response.status);
      return [];
    }

    const data = (await response.json()) as VectorSearchResponse;
    return data.results || [];
  } catch (error) {
    console.error('Vector search failed:', error);
    return [];
  }
}

/**
 * Quick health check — true if the service responds within 2s.
 */
export async function isVectorServiceAvailable(): Promise<boolean> {
  try {
    const response = await fetchWithRetry(
      `${VECTOR_SERVICE_URL}/health`,
      { signal: AbortSignal.timeout(2000) },
      0, // no retry for health checks — keep it fast
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Detailed status for the /health endpoint.
 */
export async function getVectorServiceStatus(): Promise<{
  status: string;
  url: string;
  responseTimeMs?: number;
}> {
  const start = Date.now();
  try {
    const response = await fetchWithRetry(
      `${VECTOR_SERVICE_URL}/health`,
      { signal: AbortSignal.timeout(2000) },
      0,
    );
    const responseTimeMs = Date.now() - start;

    if (response.ok) {
      return { status: 'ok', url: VECTOR_SERVICE_URL, responseTimeMs };
    }
    return { status: 'unhealthy', url: VECTOR_SERVICE_URL, responseTimeMs };
  } catch {
    return { status: 'unavailable', url: VECTOR_SERVICE_URL };
  }
}
