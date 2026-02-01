import { useStore } from '../store';
import { FileViewer } from './FileViewer';
import { format } from 'date-fns';
import clsx from 'clsx';

export function Files() {
  const { files, filesLoading, selectedFile, selectFile } = useStore();

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-full">
      {/* File list */}
      <div className="w-72 border-r border-slate-700 overflow-y-auto">
        <div className="p-4 border-b border-slate-700">
          <h2 className="text-lg font-semibold text-white">Workspace Files</h2>
          <p className="text-sm text-slate-400 mt-1">Agent's memory and task files</p>
        </div>

        {filesLoading && files.length === 0 ? (
          <div className="p-4 text-slate-400">Loading files...</div>
        ) : files.length === 0 ? (
          <div className="p-4 text-slate-400">No files found</div>
        ) : (
          <div className="p-2">
            {files.map((file) => (
              <button
                key={file.path}
                onClick={() => selectFile(file.path)}
                className={clsx(
                  'w-full text-left p-3 rounded-lg mb-1 transition-colors',
                  selectedFile === file.path
                    ? 'bg-primary-600 text-white'
                    : 'hover:bg-slate-700 text-slate-300'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">
                    {file.path.includes('memory/') ? '📅' : '📄'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className={clsx(
                      'text-xs',
                      selectedFile === file.path ? 'text-primary-200' : 'text-slate-500'
                    )}>
                      {formatFileSize(file.size)} • {format(new Date(file.modified), 'MMM d, HH:mm')}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* File content */}
      <div className="flex-1 overflow-hidden">
        {selectedFile ? (
          <FileViewer />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <div className="text-4xl mb-4">📁</div>
            <p>Select a file to view its contents</p>
          </div>
        )}
      </div>
    </div>
  );
}
