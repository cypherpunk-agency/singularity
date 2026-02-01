import { useEffect, useRef, useCallback } from 'react';
import { WSEvent, WS_EVENTS, Message, AgentStatus } from '@singularity/shared';
import { useStore } from '../store';

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { addMessage, updateStatus, fetchStatus, fetchFiles } = useStore();

  const connect = useCallback(() => {
    // Determine WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    console.log('Connecting to WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        handleEvent(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      wsRef.current = null;

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = window.setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, []);

  const handleEvent = useCallback((event: WSEvent | { type: string; payload?: unknown }) => {
    switch (event.type) {
      case WS_EVENTS.CHAT_RECEIVED: {
        const payload = event.payload as { message: Message };
        addMessage(payload.message);
        break;
      }

      case WS_EVENTS.AGENT_STARTED:
        fetchStatus();
        break;

      case WS_EVENTS.AGENT_COMPLETED:
        fetchStatus();
        fetchFiles();
        break;

      case WS_EVENTS.FILE_CHANGED:
      case WS_EVENTS.FILE_CREATED:
      case WS_EVENTS.FILE_DELETED:
        fetchFiles();
        break;

      case WS_EVENTS.STATUS_UPDATE: {
        const statusPayload = event.payload as { status: AgentStatus };
        updateStatus(statusPayload.status);
        break;
      }

      case 'connected':
        console.log('WebSocket connection confirmed');
        break;

      case 'pong':
        // Heartbeat response
        break;

      default:
        console.log('Unknown WebSocket event:', event.type);
    }
  }, [addMessage, updateStatus, fetchStatus, fetchFiles]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Send ping every 30 seconds to keep connection alive
  useEffect(() => {
    const interval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => clearInterval(interval);
  }, []);
}
