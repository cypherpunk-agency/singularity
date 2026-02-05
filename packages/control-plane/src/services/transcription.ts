/**
 * Transcription service - supports multiple providers with fallback.
 *
 * Providers:
 * - openai: OpenAI Whisper API (requires OPENAI_API_KEY)
 * - local: Local GPU-accelerated Whisper container
 * - auto: Try OpenAI first, fall back to local if unavailable
 */

import { transcribeWithOpenAI, isOpenAITranscriptionAvailable } from './openai-transcription.js';

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

export type TranscriptionProvider = 'openai' | 'local' | 'auto';

/**
 * Get the configured transcription provider.
 */
function getProvider(): TranscriptionProvider {
  const provider = process.env.TRANSCRIPTION_PROVIDER?.toLowerCase();
  if (provider === 'openai' || provider === 'local') {
    return provider;
  }
  return 'auto';
}

/**
 * Check if the local transcription service is available.
 */
async function isLocalTranscriptionAvailable(): Promise<boolean> {
  const serviceUrl = process.env.TRANSCRIPTION_SERVICE_URL || 'http://transcription:5001';

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

/**
 * Transcribe audio buffer to text using the local GPU-accelerated transcription service.
 */
async function transcribeLocal(audioBuffer: Buffer): Promise<string> {
  const serviceUrl = process.env.TRANSCRIPTION_SERVICE_URL || 'http://transcription:5001';

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), 'voice.ogg');

  const response = await fetch(`${serviceUrl}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Local transcription failed: ${error}`);
  }

  const result = await response.json() as TranscriptionResult;
  return result.text;
}

/**
 * Transcribe audio buffer to text.
 * Uses the configured provider or auto-selects based on availability.
 *
 * @param audioBuffer - Audio file buffer (typically .ogg from Telegram)
 * @param estimatedDurationSeconds - Estimated audio duration (for cost logging with OpenAI)
 * @returns Transcribed text
 */
export async function transcribe(
  audioBuffer: Buffer,
  estimatedDurationSeconds = 60
): Promise<string> {
  const provider = getProvider();

  // OpenAI provider
  if (provider === 'openai') {
    if (!isOpenAITranscriptionAvailable()) {
      throw new Error('OPENAI_API_KEY not set but TRANSCRIPTION_PROVIDER=openai');
    }
    const result = await transcribeWithOpenAI(audioBuffer, 'voice.ogg', estimatedDurationSeconds);
    return result.text;
  }

  // Local provider
  if (provider === 'local') {
    return transcribeLocal(audioBuffer);
  }

  // Auto provider: try OpenAI first, fall back to local
  if (isOpenAITranscriptionAvailable()) {
    try {
      const result = await transcribeWithOpenAI(audioBuffer, 'voice.ogg', estimatedDurationSeconds);
      return result.text;
    } catch (error) {
      console.warn('OpenAI transcription failed, falling back to local:', error);
    }
  }

  // Fall back to local
  const localAvailable = await isLocalTranscriptionAvailable();
  if (!localAvailable) {
    throw new Error('No transcription service available (OpenAI not configured, local service unavailable)');
  }

  return transcribeLocal(audioBuffer);
}
