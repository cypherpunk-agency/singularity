/**
 * Response extractor - extracts agent response from CLI output
 * and routes it to the appropriate chat channel
 */

import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Channel, Message } from '@singularity/shared';
import { WSManager } from '../ws/events.js';
import { formatForChannel } from './formatter.js';
import { sendToTelegram } from '../channels/telegram.js';

// Get base path (use APP_DIR env or default)
function getBasePath(): string {
  return process.env.APP_DIR || '/app';
}

export interface RunHistoryEntryForExtraction {
  runId: string;
  type: string;
  channel?: string;
  exit_code: number;
  outputFile?: string;
  duration_seconds?: number;
  cost_usd?: number;
}

export interface AgentOutputJson {
  type?: string;
  subtype?: string;
  result?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  num_turns?: number;
}

/**
 * Extract agent response from CLI output and route to chat
 */
export async function extractAndRouteResponse(
  entry: RunHistoryEntryForExtraction,
  wsManager: WSManager
): Promise<void> {
  // Only process chat runs with success
  if (entry.type !== 'chat' || entry.exit_code !== 0 || !entry.channel) {
    return;
  }

  const channel = entry.channel as Channel;
  const basePath = getBasePath();

  // Determine output file path
  const outputFile = entry.outputFile || path.join(basePath, 'logs', 'agent-output', `${entry.runId}.json`);

  try {
    // Read the output JSON
    const outputContent = await fs.readFile(outputFile, 'utf-8');
    const output: AgentOutputJson = JSON.parse(outputContent);

    // Extract the result text
    const resultText = output.result;
    if (!resultText || resultText.trim() === '') {
      console.log(`[extractor] No result text in output for run ${entry.runId}`);
      return;
    }

    // Format for channel
    const formattedText = formatForChannel(resultText, channel, {
      runId: entry.runId,
      duration: output.duration_ms,
      cost: output.total_cost_usd,
    });

    // Create and save message
    const message = await saveAgentResponseWithMetadata(
      formattedText,
      channel,
      {
        runId: entry.runId,
        duration: output.duration_ms,
        cost: output.total_cost_usd,
      }
    );

    // Broadcast via WebSocket
    wsManager.broadcastChatMessage(message);

    // Send to Telegram if telegram channel
    // Pass both HTML (for text display) and original markdown (for TTS)
    if (channel === 'telegram') {
      await sendToTelegram(formattedText, resultText);
    }

    console.log(`[extractor] Routed response for run ${entry.runId} to ${channel} channel`);
  } catch (error) {
    console.error(`[extractor] Failed to extract response for run ${entry.runId}:`, error);
  }
}

/**
 * Save agent response with metadata to conversation file
 */
async function saveAgentResponseWithMetadata(
  text: string,
  channel: Channel,
  metadata: { runId?: string; duration?: number; cost?: number }
): Promise<Message> {
  const basePath = getBasePath();
  const today = new Date().toISOString().split('T')[0];
  const conversationDir = path.join(basePath, 'agent', 'conversation', channel);
  const conversationFile = path.join(conversationDir, `${today}.jsonl`);

  // Ensure directory exists
  await fs.mkdir(conversationDir, { recursive: true });

  const message: Message = {
    id: uuidv4(),
    text,
    from: 'agent',
    channel,
    timestamp: new Date().toISOString(),
    metadata: {
      runId: metadata.runId,
      duration: metadata.duration,
      cost: metadata.cost,
    },
  };

  // Append to conversation file
  await fs.appendFile(conversationFile, JSON.stringify(message) + '\n');

  return message;
}
