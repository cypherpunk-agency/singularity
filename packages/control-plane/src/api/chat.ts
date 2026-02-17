import { FastifyInstance } from 'fastify';
import { SendMessageRequest, SendMessageResponse, RespondMessageRequest, Message, Channel, isAgentChannel } from '@singularity/shared';
import { saveHumanMessage, saveAgentResponse, getRecentMessages, getConversationDates, getConversationHistory } from '../conversation.js';
import { WSManager } from '../ws/events.js';
import { queueWorker } from '../queue/worker.js';
import { sendToTelegram } from '../channels/telegram.js';
import { getCallbackResult } from '../channels/agent-callback.js';

export async function registerChatRoutes(fastify: FastifyInstance, wsManager: WSManager) {
  // Send a message to the agent (human -> agent)
  fastify.post<{
    Body: SendMessageRequest;
  }>('/api/chat', async (request, reply) => {
    const { text, channel = 'web', callback_url, callback_secret } = request.body;

    if (!text || !text.trim()) {
      reply.code(400).send({ success: false, messageId: '' });
      return;
    }

    // Agent channels require a callback_url
    if (isAgentChannel(channel) && !callback_url) {
      reply.code(400).send({ error: 'callback_url is required for agent channels' });
      return;
    }

    try {
      // Build metadata for agent channels
      const metadata = isAgentChannel(channel)
        ? { callbackUrl: callback_url, callbackSecret: callback_secret }
        : undefined;

      // Save message to channel-specific conversation
      const message = await saveHumanMessage(text.trim(), channel, metadata);

      // Broadcast the message to all connected WebSocket clients
      wsManager.broadcastChatMessage(message);

      // Notify worker that message arrived - it will poll for unprocessed messages
      queueWorker.notifyMessageArrived(channel);

      // Agent channels get a different response format
      if (isAgentChannel(channel)) {
        return { request_id: message.id, status: 'queued' };
      }

      return { success: true, messageId: message.id };
    } catch (error) {
      fastify.log.error(error, 'Failed to send message');
      reply.code(500).send({ success: false, messageId: '' });
    }
  });

  // Agent responds to a message (agent -> human)
  fastify.post<{
    Body: RespondMessageRequest;
    Reply: SendMessageResponse;
  }>('/api/chat/respond', async (request, reply) => {
    const { text, channel = 'web' } = request.body;

    if (!text || !text.trim()) {
      reply.code(400).send({ success: false, messageId: '' });
      return;
    }

    try {
      // Save agent response to channel-specific conversation
      const message = await saveAgentResponse(text.trim(), channel);

      // Broadcast to WebSocket clients
      wsManager.broadcastChatMessage(message);

      // If telegram channel, also send to telegram
      if (channel === 'telegram') {
        await sendToTelegram(text.trim());
      }

      fastify.log.info({ channel, messageId: message.id }, 'Agent response saved and broadcast');

      return { success: true, messageId: message.id };
    } catch (error) {
      fastify.log.error(error, 'Failed to save agent response');
      reply.code(500).send({ success: false, messageId: '' });
    }
  });

  // Get conversation history for a channel
  fastify.get<{
    Querystring: { channel?: Channel; days?: string; limit?: string };
    Reply: { messages: Message[]; dates: string[] };
  }>('/api/chat/history', async (request) => {
    const channel = (request.query.channel || 'web') as Channel;
    const limit = parseInt(request.query.limit || '50');

    const messages = await getRecentMessages(channel, limit);
    const dates = await getConversationDates(channel);

    return { messages, dates };
  });

  // Get conversation for a specific date and channel
  fastify.get<{
    Params: { date: string };
    Querystring: { channel?: Channel };
    Reply: { messages: Message[]; date: string };
  }>('/api/chat/history/:date', async (request) => {
    const { date } = request.params;
    const channel = (request.query.channel || 'web') as Channel;
    const messages = await getConversationHistory(channel, date);

    return { messages, date };
  });

  // Polling fallback for agent channel results
  fastify.get<{
    Querystring: { request_id?: string };
  }>('/api/chat/result', async (request, reply) => {
    const { request_id } = request.query;

    if (!request_id) {
      reply.code(400).send({ error: 'request_id query parameter is required' });
      return;
    }

    const result = getCallbackResult(request_id);
    if (!result) {
      reply.code(404).send({ error: 'Result not found or not yet available', request_id });
      return;
    }

    return result;
  });
}
