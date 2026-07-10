import { useState } from 'react';
import type { Guest } from '../types';

interface AddGuestModalProps {
  onAdd: (guest: Partial<Guest> & { name: string }) => void;
  onClose: () => void;
}

export function AddGuestModal({ onAdd, onClose }: AddGuestModalProps) {
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');

  const save = () => {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), surname: surname.trim() || undefined });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Add guest</h2>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Surname <span className="text-slate-400">(optional)</span>
        </label>
        <input
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
