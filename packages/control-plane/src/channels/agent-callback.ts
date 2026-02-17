/**
 * Agent channel callback delivery and polling fallback.
 * Delivers responses to external agents via webhook POST,
 * with retry logic and an in-memory result store for polling.
 */

import { AgentCallbackPayload } from '@singularity/shared';

// In-memory result store for polling fallback (keyed by request_id)
const resultStore = new Map<string, { payload: AgentCallbackPayload; expiresAt: number }>();
const RESULT_TTL_MS = 60 * 60 * 1000; // 1 hour

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of resultStore) {
    if (now > entry.expiresAt) {
      resultStore.delete(key);
    }
  }
}, 10 * 60 * 1000);

/**
 * Store a callback result for polling fallback.
 */
export function storeCallbackResult(requestId: string, payload: AgentCallbackPayload): void {
  resultStore.set(requestId, {
    payload,
    expiresAt: Date.now() + RESULT_TTL_MS,
  });
}

/**
 * Retrieve a callback result by request_id (for polling).
 */
export function getCallbackResult(requestId: string): AgentCallbackPayload | null {
  const entry = resultStore.get(requestId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resultStore.delete(requestId);
    return null;
  }
  return entry.payload;
}

/**
 * Deliver a callback payload to an agent's callback URL.
 * Retries up to 3 times with 10s intervals. 10s timeout per attempt.
 * Success = any 2xx status code.
 */
export async function deliverCallback(
  url: string,
  secret: string | undefined,
  payload: AgentCallbackPayload
): Promise<boolean> {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 10_000;
  const TIMEOUT_MS = 10_000;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (secret) {
    headers['Authorization'] = `Bearer ${secret}`;
  }

  const body = JSON.stringify(payload);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status >= 200 && response.status < 300) {
        console.log(`[agent-callback] Delivered callback to ${url} (attempt ${attempt})`);
        return true;
      }

      console.warn(`[agent-callback] Callback to ${url} returned ${response.status} (attempt ${attempt}/${MAX_RETRIES})`);
    } catch (error: any) {
      const reason = error.name === 'AbortError' ? 'timeout' : error.message;
      console.warn(`[agent-callback] Callback to ${url} failed: ${reason} (attempt ${attempt}/${MAX_RETRIES})`);
    }

    // Wait before retrying (except after last attempt)
    if (attempt < MAX_RETRIES) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }

  console.error(`[agent-callback] Failed to deliver callback to ${url} after ${MAX_RETRIES} attempts`);
  return false;
}
