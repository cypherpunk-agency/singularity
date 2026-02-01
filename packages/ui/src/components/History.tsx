import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import * as api from '../lib/api';
import clsx from 'clsx';

interface RunEntry {
  timestamp: string;
  sessionId: string;
  duration: number;
  success: boolean;
  tokensUsed?: number;
  cost?: number;
}

export function History() {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRuns() {
      try {
        const { runs } = await api.getRuns(50);
        setRuns(runs as RunEntry[]);
      } catch (error) {
        console.error('Failed to load runs:', error);
      } finally {
        setLoading(false);
      }
    }
    loadRuns();
  }, []);

  // Group runs by date
  const runsByDate = runs.reduce((acc, run) => {
    const date = format(new Date(run.timestamp), 'yyyy-MM-dd');
    if (!acc[date]) acc[date] = [];
    acc[date].push(run);
    return acc;
  }, {} as Record<string, RunEntry[]>);

  const dates = Object.keys(runsByDate).sort().reverse();

  // Stats
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => r.success).length;
  const totalDuration = runs.reduce((sum, r) => sum + r.duration, 0);
  const totalCost = runs.reduce((sum, r) => sum + (r.cost || 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header with stats */}
      <div className="p-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white mb-3">Run History</h2>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Runs" value={totalRuns.toString()} />
          <StatCard
            label="Success Rate"
            value={totalRuns > 0 ? `${Math.round((successfulRuns / totalRuns) * 100)}%` : 'N/A'}
          />
          <StatCard
            label="Total Time"
            value={totalDuration > 0 ? formatDuration(totalDuration) : 'N/A'}
          />
          <StatCard
            label="Total Cost"
            value={totalCost > 0 ? `$${totalCost.toFixed(2)}` : 'N/A'}
          />
        </div>
      </div>

      {/* Run list */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="text-slate-400">Loading run history...</div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-4xl mb-4">📜</div>
            <p>No run history yet</p>
          </div>
        ) : (
          <div className="space-y-6">
            {dates.map((date) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-slate-400 mb-2">
                  {format(new Date(date), 'EEEE, MMMM d, yyyy')}
                </h3>
                <div className="space-y-2">
                  {runsByDate[date].map((run, i) => (
                    <div
                      key={`${run.timestamp}-${i}`}
                      className="bg-slate-800 rounded-lg p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={clsx(
                            'w-2.5 h-2.5 rounded-full',
                            run.success ? 'bg-green-500' : 'bg-red-500'
                          )}
                        />
                        <span className="text-white">
                          {format(new Date(run.timestamp), 'HH:mm:ss')}
                        </span>
                        <span className="text-sm text-slate-400">
                          {run.sessionId?.substring(0, 8)}...
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-400">
                        <span>{formatDuration(run.duration)}</span>
                        {run.cost && <span>${run.cost.toFixed(4)}</span>}
                        {run.tokensUsed && <span>{run.tokensUsed.toLocaleString()} tokens</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-800 rounded-lg p-3">
      <div className="text-sm text-slate-400">{label}</div>
      <div className="text-xl font-semibold text-white mt-1">{value}</div>
    </div>
  );
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}
