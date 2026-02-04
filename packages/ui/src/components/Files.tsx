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

// Recursively sort and count files in tree
function sortAndCountTree(nodes: FileNode[]): FileNode[] {
  return nodes
    .map(node => {
      if (node.type === 'folder' && node.files) {
        const sortedFiles = sortAndCountTree(node.files);
        // Count all files recursively
        const fileCount = sortedFiles.reduce((count, child) => {
          if (child.type === 'file') return count + 1;
          return count + (child.fileCount || 0);
        }, 0);
        return { ...node, files: sortedFiles, fileCount };
      }
      return node;
    })
    .sort((a, b) => {
      // Folders first, then files
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

// Build hierarchical tree from flat file list (supports arbitrary nesting)
function buildFileTree(files: FileInfo[]): FileNode[] {
  const root: FileNode[] = [];

  files.forEach(file => {
    const parts = file.path.split('/');
    let currentLevel = root;

    // Process each folder in the path
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const folderPath = parts.slice(0, i + 1).join('/');

      let folder = currentLevel.find(n => n.type === 'folder' && n.name === folderName);
      if (!folder) {
        folder = { type: 'folder', name: folderName, path: folderPath, files: [], fileCount: 0 };
        currentLevel.push(folder);
      }
      currentLevel = folder.files!;
    }

    // Add file to current level
    currentLevel.push({
      type: 'file',
      name: parts[parts.length - 1],
      path: file.path,
      size: file.size,
      modified: file.modified
    });
  });

  // Sort folders first, then files, and count recursively
  return sortAndCountTree(root);
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

  // Recursive component to render file tree nodes
  const renderNode = (node: FileNode, depth: number = 0): React.ReactNode => {
    const isRoot = depth === 0;
    const paddingClass = isRoot ? 'p-3' : 'p-2';
    const iconSize = isRoot ? 'text-lg' : 'text-base';
    const textSize = isRoot ? 'font-medium' : 'text-sm font-medium';

    if (node.type === 'folder') {
      return (
        <div key={node.path} className="mb-1">
          <button
            onClick={() => toggleFolder(node.path)}
            className={clsx(
              'w-full text-left rounded-lg hover:bg-slate-700 text-slate-300 transition-colors',
              paddingClass
            )}
          >
            <div className="flex items-center gap-2">
              <span className={iconSize}>
                {expandedFolders.has(node.path) ? '📂' : '📁'}
              </span>
              <div className="flex-1 min-w-0">
                <div className={clsx(textSize, 'truncate')}>
                  {node.name}/ <span className="text-xs text-slate-500">({node.fileCount})</span>
                </div>
              </div>
            </div>
          </button>

          {/* Folder contents (when expanded) */}
          {expandedFolders.has(node.path) && node.files && (
            <div className="ml-6 mt-1">
              {node.files.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // File node
    return (
      <button
        key={node.path}
        onClick={() => handleSelectFile(node.path)}
        className={clsx(
          'w-full text-left rounded-lg mb-1 transition-colors',
          paddingClass,
          selectedFile === node.path
            ? 'bg-primary-600 text-white'
            : 'hover:bg-slate-700 text-slate-300'
        )}
      >
        <div className="flex items-center gap-2">
          <span className={iconSize}>📄</span>
          <div className="flex-1 min-w-0">
            <div className={clsx(textSize, 'truncate')}>{node.name}</div>
            <div className={clsx(
              'text-xs',
              selectedFile === node.path ? 'text-primary-200' : 'text-slate-500'
            )}>
              {formatFileSize(node.size!)} • {format(new Date(node.modified!), 'MMM d, HH:mm')}
            </div>
          </div>
        </div>
      </button>
    );
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
            {fileTree.map((node) => renderNode(node, 0))}
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
