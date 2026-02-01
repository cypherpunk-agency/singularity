import { useState } from 'react';
import { useStore } from '../store';
import * as api from '../lib/api';
import clsx from 'clsx';

export function FileViewer() {
  const { selectedFile, fileContent, fileContentLoading, selectFile } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Files that can be edited
  const editableFiles = ['HEARTBEAT.md', 'MEMORY.md', 'INBOX.md'];
  const canEdit = selectedFile && editableFiles.includes(selectedFile);

  const handleEdit = () => {
    setEditContent(fileContent || '');
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  const handleSave = async () => {
    if (!selectedFile) return;

    setSaving(true);
    try {
      await api.updateFileContent(selectedFile, editContent);
      setIsEditing(false);
      // Refresh file content
      await selectFile(selectedFile);
    } catch (error) {
      console.error('Failed to save file:', error);
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
        ) : (
          <pre className="text-slate-100 font-mono text-sm whitespace-pre-wrap">
            {fileContent}
          </pre>
        )}
      </div>
    </div>
  );
}
