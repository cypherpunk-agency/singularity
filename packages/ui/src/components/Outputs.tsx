import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { useStore } from '../store';
import { format } from 'date-fns';
import clsx from 'clsx';
import { AgentSession } from '@singularity/shared';
import * as api from '../lib/api';

export function Outputs() {
  const { sessions, sessionsLoading, fetchSessions } = useStore();
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [sessionDetails, setSessionDetails] = useState<(AgentSession & { inputContent?: string; outputContent?: string }) | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load full session details when selected
  useEffect(() => {
    if (!selectedSession) {
      setSessionDetails(null);
      return;
    }

    setDetailsLoading(true);
    api.getSession(selectedSession)
      .then(details => {
        setSessionDetails(details);
        setDetailsLoading(false);
      })
      .catch(err => {
        console.error('Failed to load session details:', err);
        setDetailsLoading(false);
      });
  }, [selectedSession]);

  return (
    <div className="flex h-full">
      {/* Session list */}
      <div className="w-80 border-r border-slate-700 overflow-y-auto">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Agent Sessions</h2>
          <p className="text-sm text-slate-400 mt-1">Input & output from agent runs</p>
        </div>

        {sessionsLoading && sessions.length === 0 ? (
          <div className="p-4 text-slate-400">Loading sessions...</div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-slate-400">No sessions yet</div>
        ) : (
          <div className="p-2">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setSelectedSession(session.id)}
                className={clsx(
                  'w-full text-left p-3 rounded-lg mb-1 transition-colors',
                  selectedSession === session.id
                    ? 'bg-primary-600 text-white'
                    : 'hover:bg-slate-700 text-slate-300'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {format(new Date(session.timestamp), 'MMM d, HH:mm')}
                  </span>
                  {session.metadata.subtype && (
                    <span className={clsx(
                      'text-xs px-2 py-0.5 rounded',
                      session.metadata.subtype === 'success'
                        ? 'bg-green-600'
                        : 'bg-red-600'
                    )}>
                      {session.metadata.subtype}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 text-xs mt-1">
                  {session.inputFile && (
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded',
                      selectedSession === session.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-600 text-slate-300'
                    )}>
                      input
                    </span>
                  )}
                  {session.outputFile && (
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded',
                      selectedSession === session.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-600 text-slate-300'
                    )}>
                      output
                    </span>
                  )}
                  {session.jsonFile && (
                    <span className={clsx(
                      'px-1.5 py-0.5 rounded',
                      selectedSession === session.id
                        ? 'bg-primary-500 text-white'
                        : 'bg-slate-600 text-slate-300'
                    )}>
                      metadata
                    </span>
                  )}
                </div>
                {(session.metadata.total_cost_usd || session.metadata.duration_ms) && (
                  <div className={clsx(
                    'text-xs mt-1 flex gap-2',
                    selectedSession === session.id ? 'text-primary-200' : 'text-slate-500'
                  )}>
                    {session.metadata.total_cost_usd && (
                      <span>${session.metadata.total_cost_usd.toFixed(4)}</span>
                    )}
                    {session.metadata.duration_ms && (
                      <span>{(session.metadata.duration_ms / 1000).toFixed(1)}s</span>
                    )}
                    {session.metadata.num_turns && (
                      <span>{session.metadata.num_turns} turns</span>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Session content */}
      <div className="flex-1 overflow-hidden">
        {detailsLoading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div>Loading session details...</div>
          </div>
        ) : sessionDetails ? (
          <div className="flex flex-col h-full">
            {/* Header with metadata */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-white">
                  Session {sessionDetails.id}
                </h3>
                <div className="flex items-center gap-3 text-sm text-slate-400">
                  <span>{format(new Date(sessionDetails.timestamp), 'MMMM d, yyyy HH:mm:ss')}</span>
                  {sessionDetails.metadata.total_cost_usd && (
                    <span>Cost: ${sessionDetails.metadata.total_cost_usd.toFixed(4)}</span>
                  )}
                  {sessionDetails.metadata.duration_ms && (
                    <span>Duration: {(sessionDetails.metadata.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>
              </div>
              {sessionDetails.metadata.result && (
                <div className="text-sm text-slate-300 bg-slate-800 p-2 rounded">
                  {sessionDetails.metadata.result}
                </div>
              )}
            </div>

            {/* Content tabs */}
            <div className="flex-1 overflow-auto">
              {sessionDetails.inputContent && (
                <div className="border-b border-slate-700">
                  <details open className="group">
                    <summary className="cursor-pointer p-3 bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-2">
                      <span className="transform transition-transform group-open:rotate-90">▶</span>
                      Input ({sessionDetails.inputFile?.split('/').pop()})
                    </summary>
                    <div className="p-4 bg-slate-900">
                      <div className="prose prose-invert prose-slate max-w-none prose-headings:text-white prose-p:text-slate-300 prose-strong:text-white prose-code:text-primary-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-a:text-primary-400 prose-li:text-slate-300">
                        <Markdown>{sessionDetails.inputContent}</Markdown>
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {sessionDetails.outputContent && (
                <div className="border-b border-slate-700">
                  <details open className="group">
                    <summary className="cursor-pointer p-3 bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-2">
                      <span className="transform transition-transform group-open:rotate-90">▶</span>
                      Output ({sessionDetails.outputFile?.split('/').pop()})
                    </summary>
                    <div className="p-4 bg-slate-900">
                      <div className="prose prose-invert prose-slate max-w-none prose-headings:text-white prose-p:text-slate-300 prose-strong:text-white prose-code:text-primary-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-a:text-primary-400 prose-li:text-slate-300">
                        <Markdown>{sessionDetails.outputContent}</Markdown>
                      </div>
                    </div>
                  </details>
                </div>
              )}

              {sessionDetails.metadata && Object.keys(sessionDetails.metadata).length > 0 && (
                <div>
                  <details className="group">
                    <summary className="cursor-pointer p-3 bg-slate-800 hover:bg-slate-700 text-white font-medium flex items-center gap-2">
                      <span className="transform transition-transform group-open:rotate-90">▶</span>
                      Metadata (JSON)
                    </summary>
                    <div className="p-4 bg-slate-900">
                      <pre className="text-slate-100 font-mono text-sm whitespace-pre-wrap">
                        {JSON.stringify(sessionDetails.metadata, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-4xl mb-4">📋</div>
            <p>Select a session to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}
