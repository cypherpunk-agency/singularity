import { useEffect } from 'react';
import { useStore } from '../store';

export function UsageDashboard() {
  const { usageToday, usageMonth, usageLoading, fetchUsage } = useStore();

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  // Calculate percentage of monthly budget (default $10)
  const monthlyBudget = 10;
  const monthlyPercentage = usageMonth ? (usageMonth.totalCost / monthlyBudget) * 100 : 0;
  const isNearLimit = monthlyPercentage > 75;

  if (usageLoading && !usageToday && !usageMonth) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading usage data...
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-2xl font-semibold text-white mb-6">API Usage</h2>

      {/* Warning banner */}
      {isNearLimit && (
        <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-600 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-400">
            <span className="text-lg">Warning</span>
          </div>
          <p className="text-yellow-200 mt-1">
            Monthly usage is at {monthlyPercentage.toFixed(0)}% of the ${monthlyBudget} budget.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Today's usage */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-medium text-slate-300 mb-4">Today</h3>
          <div className="text-3xl font-bold text-white mb-2">
            {usageToday ? formatCost(usageToday.totalCost) : '$0.0000'}
          </div>
          <div className="text-slate-400">
            {usageToday?.totalRequests || 0} requests
          </div>
          {usageToday && Object.entries(usageToday.byService).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-sm font-medium text-slate-400 mb-2">By Service</h4>
              {Object.entries(usageToday.byService).map(([service, data]) => (
                <div key={service} className="flex justify-between text-sm">
                  <span className="text-slate-300">{service}</span>
                  <span className="text-slate-400">
                    {formatCost(data.cost)} ({data.requests} req)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* This month's usage */}
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-medium text-slate-300 mb-4">This Month</h3>
          <div className="text-3xl font-bold text-white mb-2">
            {usageMonth ? formatCost(usageMonth.totalCost) : '$0.0000'}
          </div>
          <div className="text-slate-400">
            {usageMonth?.totalRequests || 0} requests
          </div>

          {/* Progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-slate-400">Budget</span>
              <span className="text-slate-400">${monthlyBudget}</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  isNearLimit ? 'bg-yellow-500' : 'bg-primary-500'
                }`}
                style={{ width: `${Math.min(monthlyPercentage, 100)}%` }}
              />
            </div>
          </div>

          {usageMonth && Object.entries(usageMonth.byService).length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-700">
              <h4 className="text-sm font-medium text-slate-400 mb-2">By Service</h4>
              {Object.entries(usageMonth.byService).map(([service, data]) => (
                <div key={service} className="flex justify-between text-sm">
                  <span className="text-slate-300">{service}</span>
                  <span className="text-slate-400">
                    {formatCost(data.cost)} ({data.requests} req)
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent entries */}
      {usageToday && usageToday.entries.length > 0 && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700">
          <h3 className="text-lg font-medium text-slate-300 mb-4">Recent Usage</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-700">
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Units</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                  <th className="pb-2 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {usageToday.entries.slice(0, 20).map((entry, i) => (
                  <tr key={i} className="border-b border-slate-700/50">
                    <td className="py-2 text-slate-300">{formatDate(entry.timestamp)}</td>
                    <td className="py-2 text-slate-300">{entry.service}</td>
                    <td className="py-2 text-slate-400">{entry.model}</td>
                    <td className="py-2 text-slate-400 text-right">{entry.inputUnits}</td>
                    <td className="py-2 text-slate-300 text-right">{formatCost(entry.estimatedCost)}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          entry.status === 'success'
                            ? 'bg-green-900/50 text-green-400'
                            : 'bg-red-900/50 text-red-400'
                        }`}
                      >
                        {entry.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!usageToday || usageToday.entries.length === 0) && (
        <div className="bg-slate-800 rounded-lg p-6 border border-slate-700 text-center">
          <p className="text-slate-400">No usage recorded yet.</p>
          <p className="text-slate-500 text-sm mt-1">
            Usage will appear here when you use OpenAI services (e.g., voice transcription).
          </p>
        </div>
      )}
    </div>
  );
}
