import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { WSEvent, WS_EVENTS, Message } from '@singularity/shared';

export interface WSManager {
  broadcast: (event: WSEvent) => void;
  broadcastFileChange: (path: string, content: string | undefined, changeType: 'modified' | 'created' | 'deleted') => void;
  broadcastAgentStarted: (sessionId: string) => void;
  broadcastAgentCompleted: (sessionId: string, duration: number, success: boolean) => void;
  broadcastChatMessage: (message: Message) => void;
  broadcastTyping: (active: boolean) => void;
}

const clients = new Set<WebSocket>();

export function setupWebSocket(fastify: FastifyInstance): WSManager {
  fastify.get('/ws', { websocket: true }, (socket, _request) => {
    clients.add(socket);
    fastify.log.info(`WebSocket client connected (total: ${clients.size})`);

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(socket, message, fastify);
      } catch (error) {
        fastify.log.error(error, 'Invalid WebSocket message');
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      fastify.log.info(`WebSocket client disconnected (total: ${clients.size})`);
    });

    socket.on('error', (error) => {
      fastify.log.error(error, 'WebSocket error');
      clients.delete(socket);
    });

    // Send initial connection confirmation
    socket.send(JSON.stringify({
      type: 'connected',
      payload: { timestamp: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    }));
  });

  const manager: WSManager = {
    broadcast(event: WSEvent) {
      const message = JSON.stringify(event);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      }
    },

    broadcastFileChange(path: string, content: string | undefined, changeType: 'modified' | 'created' | 'deleted') {
      this.broadcast({
        type: WS_EVENTS.FILE_CHANGED,
        payload: { path, content, changeType },
        timestamp: new Date().toISOString(),
      });
    },

    broadcastAgentStarted(sessionId: string) {
      this.broadcast({
        type: WS_EVENTS.AGENT_STARTED,
        payload: { sessionId, timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
      });
    },

    broadcastAgentCompleted(sessionId: string, duration: number, success: boolean) {
      this.broadcast({
        type: WS_EVENTS.AGENT_COMPLETED,
        payload: { sessionId, duration, success },
        timestamp: new Date().toISOString(),
      });
    },

    broadcastChatMessage(message: Message) {
      this.broadcast({
        type: WS_EVENTS.CHAT_RECEIVED,
        payload: { message },
        timestamp: new Date().toISOString(),
      });
    },

    broadcastTyping(active: boolean) {
      this.broadcast({
        type: WS_EVENTS.CHAT_TYPING,
        payload: { active },
        timestamp: new Date().toISOString(),
      });
    },
  };

  return manager;
}

async function handleClientMessage(socket: WebSocket, message: { type: string; payload?: unknown }, fastify: FastifyInstance) {
  switch (message.type) {
    case 'ping':
      socket.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString(),
      }));
      break;

    case WS_EVENTS.CHAT_SEND:
      // Chat messages should go through the REST API
      // This is just for potential real-time features
      fastify.log.info({ payload: message.payload }, 'Chat message via WS');
      break;

    default:
      fastify.log.warn({ messageType: message.type }, 'Unknown WebSocket message type');
  }
}
