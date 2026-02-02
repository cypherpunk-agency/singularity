import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useStore } from '../store';
import { useWebSocket } from '../hooks/useWebSocket';

export function AppProvider() {
  const { fetchStatus, fetchHistory, fetchFiles } = useStore();

  // Connect WebSocket
  useWebSocket();

  // Initial data fetch
  useEffect(() => {
    fetchStatus();
    fetchHistory();
    fetchFiles();

    // Refresh status every 30 seconds
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchHistory, fetchFiles]);

  return <Outlet />;
}
