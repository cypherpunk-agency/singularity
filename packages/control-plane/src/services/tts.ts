/**
 * TTS service client - calls the Kokoro-FastAPI container.
 * Uses OpenAI-compatible API for text-to-speech synthesis.
 */

export interface TTSOptions {
  voice?: string;
  speed?: number;
}

/**
 * Synthesize text to speech using the Kokoro TTS service.
 * @param text - Text to synthesize
 * @param options - Optional voice and speed settings
 * @returns Audio buffer in OGG/Opus format (optimal for Telegram)
 */
export async function synthesize(text: string, options: TTSOptions = {}): Promise<Buffer> {
  const serviceUrl = process.env.TTS_SERVICE_URL || 'http://tts:8880';
  const { voice = 'af_bella', speed = 1.0 } = options;

  const response = await fetch(`${serviceUrl}/v1/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'kokoro',
      input: text,
      voice,
      speed,
      response_format: 'opus', // Optimal for Telegram voice messages
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`TTS synthesis failed: ${error}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if the TTS service is available.
 */
export async function isTTSAvailable(): Promise<boolean> {
  const serviceUrl = process.env.TTS_SERVICE_URL || 'http://tts:8880';

  try {
    const response = await fetch(`${serviceUrl}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
