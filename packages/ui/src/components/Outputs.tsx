import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';

export function Outputs() {
  const { outputs, outputsLoading, fetchOutputs } = useStore();
  const [selectedOutput, setSelectedOutput] = useState<string | null>(null);

  useEffect(() => {
    fetchOutputs();
  }, [fetchOutputs]);

  const selected = outputs.find((o) => o.id === selectedOutput);

  return (
    <div className="flex h-full">
      {/* Output list */}
      <div className="w-80 border-r border-slate-700 overflow-y-auto">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Agent Outputs</h2>
          <p className="text-sm text-slate-400 mt-1">Results from agent runs</p>
        </div>

        {outputsLoading && outputs.length === 0 ? (
          <div className="p-4 text-slate-400">Loading outputs...</div>
        ) : outputs.length === 0 ? (
          <div className="p-4 text-slate-400">No outputs yet</div>
        ) : (
          <div className="p-2">
            {outputs.map((output) => (
              <button
                key={output.id}
                onClick={() => setSelectedOutput(output.id)}
                className={clsx(
                  'w-full text-left p-3 rounded-lg mb-1 transition-colors',
                  selectedOutput === output.id
                    ? 'bg-primary-600 text-white'
                    : 'hover:bg-slate-700 text-slate-300'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate">
                    {format(new Date(output.timestamp), 'MMM d, HH:mm')}
                  </span>
                  <span className={clsx(
                    'text-xs px-2 py-0.5 rounded',
                    selectedOutput === output.id
                      ? 'bg-primary-500'
                      : 'bg-slate-600'
                  )}>
                    {output.model}
                  </span>
                </div>
                <div className={clsx(
                  'text-sm truncate mt-1',
                  selectedOutput === output.id ? 'text-primary-200' : 'text-slate-500'
                )}>
                  {output.result.substring(0, 50)}...
                </div>
                {(output.costUsd || output.durationMs) && (
                  <div className={clsx(
                    'text-xs mt-1 flex gap-2',
                    selectedOutput === output.id ? 'text-primary-200' : 'text-slate-500'
                  )}>
                    {output.costUsd && <span>${output.costUsd.toFixed(4)}</span>}
                    {output.durationMs && <span>{(output.durationMs / 1000).toFixed(1)}s</span>}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Output content */}
      <div className="flex-1 overflow-hidden">
        {selected ? (
          <div className="flex flex-col h-full">
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-white">
                  {format(new Date(selected.timestamp), 'MMMM d, yyyy HH:mm:ss')}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span>Model: {selected.model}</span>
                  {selected.costUsd && <span>Cost: ${selected.costUsd.toFixed(4)}</span>}
                  {selected.durationMs && <span>Duration: {(selected.durationMs / 1000).toFixed(1)}s</span>}
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-slate-100 font-mono text-sm whitespace-pre-wrap">
                {selected.result}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-4xl mb-4">📤</div>
            <p>Select an output to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
