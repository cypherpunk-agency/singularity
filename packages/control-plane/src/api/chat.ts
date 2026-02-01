import { FastifyInstance } from 'fastify';
import { SendMessageRequest, SendMessageResponse, Message } from '@singularity/shared';
import { appendToInbox, getConversationHistory, getConversationDates, getRecentConversation } from '../conversation.js';

export async function registerChatRoutes(fastify: FastifyInstance) {
  // Send a message to the agent
  fastify.post<{
    Body: SendMessageRequest;
    Reply: SendMessageResponse;
  }>('/api/chat', async (request, reply) => {
    const { text, channel = 'web' } = request.body;

    if (!text || !text.trim()) {
      reply.code(400).send({ success: false, messageId: '' });
      return;
    }

    try {
      const message = await appendToInbox(text.trim(), channel);
      return { success: true, messageId: message.id };
    } catch (error) {
      fastify.log.error(error, 'Failed to send message');
      reply.code(500).send({ success: false, messageId: '' });
    }
  });

  // Get conversation history (recent or all)
  fastify.get<{
    Querystring: { days?: string };
    Reply: { messages: Message[]; dates: string[] };
  }>('/api/chat/history', async (request) => {
    const days = parseInt(request.query.days || '7');
    const messages = await getRecentConversation(days);
    const dates = await getConversationDates();

    return { messages, dates };
  });

  // Get conversation for a specific date
  fastify.get<{
    Params: { date: string };
    Reply: { messages: Message[]; date: string };
  }>('/api/chat/history/:date', async (request) => {
    const { date } = request.params;
    const messages = await getConversationHistory(date);

    return { messages, date };
  });
}
