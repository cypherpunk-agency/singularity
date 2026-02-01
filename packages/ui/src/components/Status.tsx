import { useStore } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';

export function Status() {
  const { status, statusLoading, triggerRun } = useStore();

  const statusColor = {
    idle: 'bg-green-500',
    running: 'bg-yellow-500 animate-pulse',
    error: 'bg-red-500',
  };

  const handleTriggerRun = async () => {
    await triggerRun();
  };

  if (statusLoading && !status) {
    return (
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-3 h-3 rounded-full bg-slate-500 animate-pulse" />
        <span className="text-sm">Loading...</span>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="flex items-center gap-3 text-slate-400">
        <div className="w-3 h-3 rounded-full bg-slate-500" />
        <span className="text-sm">Disconnected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {/* Status indicator */}
      <div className="flex items-center gap-2">
        <div className={clsx('w-3 h-3 rounded-full', statusColor[status.status])} />
        <span className="text-sm text-slate-300 capitalize">{status.status}</span>
      </div>

      {/* Last run */}
      {status.lastRun && (
        <div className="text-sm text-slate-400">
          Last run: {format(new Date(status.lastRun), 'MMM d, HH:mm')}
          {status.lastRunSuccess !== null && (
            <span className={status.lastRunSuccess ? 'text-green-400' : 'text-red-400'}>
              {' '}({status.lastRunSuccess ? 'success' : 'failed'})
            </span>
          )}
        </div>
      )}

      {/* Next run */}
      {status.nextScheduledRun && (
        <div className="text-sm text-slate-500">
          Next: {format(new Date(status.nextScheduledRun), 'HH:mm')}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={handleTriggerRun}
        disabled={status.status === 'running'}
        className={clsx(
          'px-3 py-1.5 rounded text-sm font-medium transition-colors',
          status.status === 'running'
            ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
            : 'bg-primary-600 text-white hover:bg-primary-500'
        )}
      >
        {status.status === 'running' ? 'Running...' : 'Run Now'}
      </button>
    </div>
  );
}
