/**
 * OpenAI Whisper API transcription service.
 */

import OpenAI from 'openai';
import { logUsage, estimateWhisperCost } from './usage-tracker.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }
    client = new OpenAI({ apiKey });
  }
  return client;
}

export interface OpenAITranscriptionResult {
  text: string;
  durationMs: number;
}

/**
 * Transcribe audio using OpenAI Whisper API.
 * @param audioBuffer - Audio file buffer (typically .ogg from Telegram)
 * @param filename - Optional filename for the audio
 * @param estimatedDurationSeconds - Estimated duration for cost logging (default: 60s)
 * @returns Transcribed text and processing duration
 */
export async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  filename = 'voice.ogg',
  estimatedDurationSeconds = 60
): Promise<OpenAITranscriptionResult> {
  const startTime = Date.now();

  // Create a File object from the buffer
  const file = new File([audioBuffer], filename, { type: 'audio/ogg' });

  try {
    const result = await getClient().audio.transcriptions.create({
      file,
      model: 'whisper-1',
    });

    const durationMs = Date.now() - startTime;

    // Log usage
    logUsage({
      timestamp: new Date().toISOString(),
      provider: 'openai',
      service: 'whisper',
      model: 'whisper-1',
      inputUnits: estimatedDurationSeconds,
      estimatedCost: estimateWhisperCost(estimatedDurationSeconds),
      status: 'success',
    });

    return { text: result.text, durationMs };
  } catch (error) {
    // Log failed usage (durationMs not needed but calculated for potential future use)
    void (Date.now() - startTime);
    logUsage({
      timestamp: new Date().toISOString(),
      provider: 'openai',
      service: 'whisper',
      model: 'whisper-1',
      inputUnits: estimatedDurationSeconds,
      estimatedCost: 0,
      status: 'error',
      metadata: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}

/**
 * Check if OpenAI transcription is available (API key is set).
 */
export function isOpenAITranscriptionAvailable(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
