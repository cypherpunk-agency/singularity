import { useState } from 'react';
import { useStore } from '../../store';
import * as api from '../../lib/api';

export default function HelloWorld() {
  const status = useStore((s) => s.status);
  const [fileCount, setFileCount] = useState<number | null>(null);

  const fetchFiles = async () => {
    const { files } = await api.getFiles();
    setFileCount(files.length);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-slate-700">
        <h2 className="text-lg font-semibold text-white">Hello World Extension</h2>
        <p className="text-sm text-slate-400">Example extension — use as a template</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Status card */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">Agent Status</h3>
          <p className="text-white">
            {status ? (status.status === 'running' ? '🟢 Running' : '⚪ Idle') : '⏳ Loading...'}
          </p>
        </div>

        {/* API demo */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-2">API Demo</h3>
          <button
            onClick={fetchFiles}
            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded hover:bg-primary-500 transition-colors"
          >
            Count Files
          </button>
          {fileCount !== null && (
            <p className="text-slate-300 mt-2">{fileCount} files in workspace</p>
          )}
        </div>

        {/* How-to */}
        <div className="bg-slate-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Create Your Own</h3>
          <ol className="text-sm text-slate-400 space-y-2 list-decimal list-inside">
            <li>Create <code className="text-primary-400">extensions/my-ext/manifest.json</code></li>
            <li>Create <code className="text-primary-400">extensions/my-ext/index.tsx</code> with a default export</li>
            <li>Rebuild: <code className="text-primary-400">pnpm --filter @singularity/ui build</code></li>
          </ol>
        </div>
      </div>
    </div>
  );
}
