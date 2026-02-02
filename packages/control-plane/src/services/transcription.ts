/**
 * Transcription service client - calls the transcription container.
 */

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
}

/**
 * Transcribe audio buffer to text using the GPU-accelerated transcription service.
 * @param audioBuffer - Audio file buffer (typically .ogg from Telegram)
 * @returns Transcribed text
 */
export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const serviceUrl = process.env.TRANSCRIPTION_SERVICE_URL || 'http://transcription:5001';

  const formData = new FormData();
  formData.append('file', new Blob([audioBuffer]), 'voice.ogg');

  const response = await fetch(`${serviceUrl}/transcribe`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Transcription failed: ${error}`);
  }

  const result = await response.json() as TranscriptionResult;
  return result.text;
}
