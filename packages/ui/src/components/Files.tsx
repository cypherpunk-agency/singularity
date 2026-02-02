import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { FileViewer } from './FileViewer';
import { format } from 'date-fns';
import clsx from 'clsx';
import type { FileInfo } from '@singularity/shared';

// File tree node structure
interface FileNode {
  type: 'file' | 'folder';
  name: string;
  path: string;
  files?: FileNode[];
  size?: number;
  modified?: string;
  fileCount?: number;
}

// Build hierarchical tree from flat file list
function buildFileTree(files: FileInfo[]): FileNode[] {
  const tree: FileNode[] = [];
  const folders = new Map<string, FileNode>();

  // Separate root files from folder files
  const rootFiles = files.filter(f => !f.path.includes('/'));
  const folderFiles = files.filter(f => f.path.includes('/'));

  // Group files by folder
  folderFiles.forEach(file => {
    const [folderName, ...rest] = file.path.split('/');

    if (!folders.has(folderName)) {
      folders.set(folderName, {
        type: 'folder',
        name: folderName,
        path: folderName,
        files: [],
        fileCount: 0
      });
    }

    const folder = folders.get(folderName)!;
    folder.files!.push({
      type: 'file',
      name: rest.join('/') || file.name,
      path: file.path,
      size: file.size,
      modified: file.modified
    });
    folder.fileCount = (folder.fileCount || 0) + 1;
  });

  // Build tree: folders first (sorted by name), then root files (sorted by name)
  const sortedFolders = Array.from(folders.values()).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const sortedRootFiles = rootFiles
    .map(f => ({
      type: 'file' as const,
      name: f.name,
      path: f.path,
      size: f.size,
      modified: f.modified
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  tree.push(...sortedFolders, ...sortedRootFiles);
  return tree;
}

export function Files() {
  const { files, filesLoading, selectedFile, selectFile, fetchFiles } = useStore();
  const params = useParams();
  const navigate = useNavigate();

  // Track expanded folders (default: expand memory/)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(['memory'])
  );

  // Get file path from URL (splat route captures everything after /files/)
  const urlFilePath = params['*'] || null;

  // Fetch files when component mounts (tab becomes active)
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Sync URL param to store
  useEffect(() => {
    if (urlFilePath !== selectedFile) {
      selectFile(urlFilePath);
    }
  }, [urlFilePath, selectedFile, selectFile]);

  const handleSelectFile = (path: string | null) => {
    if (path) {
      navigate(`/files/${path}`);
    } else {
      navigate('/files');
    }
  };

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedFolders(newExpanded);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Build file tree from flat list
  const fileTree = buildFileTree(files);

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
            {fileTree.map((node) => (
              node.type === 'folder' ? (
                // Folder node
                <div key={node.path} className="mb-1">
                  <button
                    onClick={() => toggleFolder(node.path)}
                    className="w-full text-left p-3 rounded-lg hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {expandedFolders.has(node.path) ? '📂' : '📁'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          {node.name}/ <span className="text-xs text-slate-500">({node.fileCount})</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Folder contents (when expanded) */}
                  {expandedFolders.has(node.path) && node.files && (
                    <div className="ml-6 mt-1">
                      {node.files.map((file) => (
                        <button
                          key={file.path}
                          onClick={() => handleSelectFile(file.path)}
                          className={clsx(
                            'w-full text-left p-2 rounded-lg mb-1 transition-colors',
                            selectedFile === file.path
                              ? 'bg-primary-600 text-white'
                              : 'hover:bg-slate-700 text-slate-300'
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">📄</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{file.name}</div>
                              <div className={clsx(
                                'text-xs',
                                selectedFile === file.path ? 'text-primary-200' : 'text-slate-500'
                              )}>
                                {formatFileSize(file.size!)} • {format(new Date(file.modified!), 'MMM d, HH:mm')}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                // Root file node
                <button
                  key={node.path}
                  onClick={() => handleSelectFile(node.path)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg mb-1 transition-colors',
                    selectedFile === node.path
                      ? 'bg-primary-600 text-white'
                      : 'hover:bg-slate-700 text-slate-300'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📄</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{node.name}</div>
                      <div className={clsx(
                        'text-xs',
                        selectedFile === node.path ? 'text-primary-200' : 'text-slate-500'
                      )}>
                        {formatFileSize(node.size!)} • {format(new Date(node.modified!), 'MMM d, HH:mm')}
                      </div>
                    </div>
                  </div>
                </button>
              )
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
