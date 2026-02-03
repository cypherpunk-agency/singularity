/**
 * Generic proxy utility for forwarding requests to internal APIs
 */

export interface ProxyOptions {
  targetUrl: string;
  stripPrefix: string;
  addPrefix?: string;
}

export async function proxyRequest(
  request: {
    method: string;
    url: string;
    headers: Record<string, string | string[] | undefined>;
    body?: unknown;
  },
  options: ProxyOptions
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  const { targetUrl, stripPrefix, addPrefix = '' } = options;

  // Build the target URL by stripping prefix and adding new prefix
  const path = request.url.replace(stripPrefix, '');
  const url = `${targetUrl}${addPrefix}${path}`;

  // Forward headers, excluding hop-by-hop headers
  const headers: Record<string, string> = {};
  const excludeHeaders = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'authorization'];

  for (const [key, value] of Object.entries(request.headers)) {
    if (value && !excludeHeaders.includes(key.toLowerCase())) {
      headers[key] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Make the proxied request
  const response = await fetch(url, {
    method: request.method,
    headers,
    body: request.body && request.method !== 'GET' && request.method !== 'HEAD'
      ? JSON.stringify(request.body)
      : undefined,
  });

  // Get response body
  const contentType = response.headers.get('content-type') || '';
  let body: unknown;

  if (contentType.includes('application/json')) {
    body = await response.json();
  } else if (contentType.includes('text/')) {
    body = await response.text();
  } else {
    // For binary content (like CSV export), return as buffer
    const buffer = await response.arrayBuffer();
    body = Buffer.from(buffer);
  }

  // Build response headers
  const responseHeaders: Record<string, string> = {};
  const passHeaders = ['content-type', 'content-disposition', 'cache-control'];

  for (const header of passHeaders) {
    const value = response.headers.get(header);
    if (value) {
      responseHeaders[header] = value;
    }
  }

  return {
    status: response.status,
    headers: responseHeaders,
    body,
  };
}
