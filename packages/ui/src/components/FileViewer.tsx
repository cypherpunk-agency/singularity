import { useState } from 'react';
import Markdown from 'react-markdown';
import { Copy, Check } from 'lucide-react';
import { useStore } from '../store';
import * as api from '../lib/api';
import clsx from 'clsx';

export function FileViewer() {
  const { selectedFile, fileContent, fileContentLoading, selectFile } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Files that can be edited
  const editableFiles = ['MEMORY.md', 'config/HEARTBEAT.md'];
  const canEdit = selectedFile && editableFiles.includes(selectedFile);

  const handleEdit = () => {
    setEditContent(fileContent || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleCopy = async () => {
    if (!fileContent) return;
    await navigator.clipboard.writeText(fileContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setSaving(true);
    setSaveError(null);
    try {
      await api.updateFileContent(selectedFile, editContent);
      setIsEditing(false);
      // Refresh file content
      await selectFile(selectedFile);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  if (fileContentLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading file...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">📄</span>
          <h3 className="font-medium text-white">{selectedFile}</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={handleCopy}
              disabled={!fileContent}
              className="p-1.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50"
              title="Copy to clipboard"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </button>
          )}
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-3 py-1.5 rounded text-sm bg-slate-700 text-slate-300 hover:bg-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={clsx(
                  'px-3 py-1.5 rounded text-sm font-medium',
                  saving
                    ? 'bg-slate-600 text-slate-400'
                    : 'bg-primary-600 text-white hover:bg-primary-500'
                )}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : canEdit ? (
            <button
              onClick={handleEdit}
              className="px-3 py-1.5 rounded text-sm bg-slate-700 text-slate-300 hover:bg-slate-600"
            >
              Edit
            </button>
          ) : null}
        </div>
      </div>

      {/* Save error message */}
      {saveError && (
        <div className="mx-4 mt-2 p-2 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
          {saveError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className={clsx(
              'w-full h-full bg-slate-800 border border-slate-600 rounded-lg p-4',
              'text-slate-100 font-mono text-sm resize-none',
              'focus:outline-none focus:border-primary-500'
            )}
          />
        ) : selectedFile?.endsWith('.md') ? (
          <div className="prose prose-invert prose-slate max-w-none prose-headings:text-white prose-p:text-slate-300 prose-strong:text-white prose-code:text-primary-300 prose-code:bg-slate-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-pre:bg-slate-800 prose-a:text-primary-400 prose-li:text-slate-300">
            <Markdown>{fileContent || ''}</Markdown>
          </div>
        ) : (
          <pre className="text-slate-100 font-mono text-sm whitespace-pre-wrap">
            {fileContent}
          </pre>
        )}
      </div>
    </div>
  );
}
