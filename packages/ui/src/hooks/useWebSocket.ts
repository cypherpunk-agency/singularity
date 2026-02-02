import { useEffect, useRef, useCallback } from 'react';
import { WSEvent, WS_EVENTS, Message, AgentStatus, AgentStartedPayload, Channel } from '@singularity/shared';
import { useStore } from '../store';

// Extended payload that may include additional fields
interface ExtendedAgentStartedPayload extends AgentStartedPayload {
  runId?: string;
  channel?: Channel;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const { addMessage, updateStatus, fetchStatus, fetchFiles, setAgentProcessing } = useStore();

  // Use ref to always access the latest handleEvent, avoiding stale closure
  const handleEventRef = useRef<(event: WSEvent | { type: string; payload?: unknown }) => void>(() => {});

  const handleEvent = useCallback((event: WSEvent | { type: string; payload?: unknown; }) => {
    switch (event.type) {
      case WS_EVENTS.CHAT_RECEIVED: {
        const payload = event.payload as { message: Message };
        // Only add messages from web channel to the web UI
        if (payload.message.channel === 'web') {
          addMessage(payload.message);
        }
        // Only clear typing indicator for web channel agent responses
        if (payload.message.from === 'agent' && payload.message.channel === 'web') {
          setAgentProcessing(false, null);
        }
        break;
      }

      case WS_EVENTS.AGENT_STARTED: {
        const startPayload = event.payload as ExtendedAgentStartedPayload;
        fetchStatus();
        // If this is a chat run, show typing indicator
        if (startPayload.channel === 'web') {
          setAgentProcessing(true, startPayload.runId || null);
        }
        break;
      }

      case WS_EVENTS.AGENT_COMPLETED: {
        fetchStatus();
        fetchFiles();
        // Clear typing indicator
        setAgentProcessing(false, null);
        break;
      }

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
  }, [addMessage, updateStatus, fetchStatus, fetchFiles, setAgentProcessing]);

  // Keep the ref updated with the latest handleEvent
  useEffect(() => {
    handleEventRef.current = handleEvent;
  }, [handleEvent]);

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
        handleEventRef.current(data);  // Always uses latest handler via ref
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
