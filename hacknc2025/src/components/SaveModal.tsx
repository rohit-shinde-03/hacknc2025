import React from 'react';

interface SaveModalProps {
  isOpen: boolean;
  projectName: string;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SaveModal({
  isOpen,
  projectName,
  isSaving,
  onNameChange,
  onConfirm,
  onCancel,
}: SaveModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-900 border-4 border-cyan-400 p-6 shadow-[8px_8px_0px_0px_rgba(0,139,139,1)] max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-green-400 mb-4" style={{ textShadow: '2px 2px 0px rgba(0,0,0,0.8)' }}>
          SAVE PROJECT
        </h2>
        
        <div className="mb-4">
          <label htmlFor="projectName" className="block text-xs font-bold text-cyan-400 mb-2">
            PROJECT NAME:
          </label>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full px-4 py-3 border-2 bg-gray-800 text-white text-xs placeholder:text-gray-500 placeholder:text-xs focus:outline-none focus:ring-2 focus:ring-cyan-400 border-cyan-400"
            placeholder="Enter project name"
            autoFocus
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isSaving}
            className="px-6 py-2 text-sm font-bold bg-red-500 hover:bg-red-600 text-white border-4 border-red-700 shadow-[4px_4px_0px_0px_rgba(127,0,0,1)] transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving || !projectName.trim()}
            className="px-6 py-2 text-sm font-bold bg-green-400 hover:bg-green-500 text-black border-4 border-green-600 shadow-[4px_4px_0px_0px_rgba(0,100,0,1)] transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed active:translate-x-1 active:translate-y-1 active:shadow-none"
          >
            {isSaving ? 'SAVING...' : 'SAVE'}
          </button>
        </div>
      </div>
    </div>
  );
}

