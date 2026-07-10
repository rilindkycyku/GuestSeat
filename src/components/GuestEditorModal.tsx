import { useState } from 'react';
import type { Guest, Table } from '../types';

interface GuestEditorModalProps {
  guest: Guest;
  tables: Table[];
  seatedCount: Map<string, number>;
  onSave: (patch: Partial<Guest>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function GuestEditorModal({ guest, tables, seatedCount, onSave, onDelete, onClose }: GuestEditorModalProps) {
  const [name, setName] = useState(guest.name);
  const [surname, setSurname] = useState(guest.surname ?? '');
  const [notes, setNotes] = useState(guest.notes ?? '');
  const [tableId, setTableId] = useState<string>(guest.tableId ?? '');

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      surname: surname.trim() || undefined,
      notes: notes.trim() || undefined,
      tableId: tableId || null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Edit guest</h2>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Surname <span className="text-slate-400">(optional)</span>
        </label>
        <input
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Table</label>
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        >
          <option value="">Unseated</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({seatedCount.get(t.id) ?? 0}/{t.capacity})
            </option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Notes <span className="text-slate-400">(optional)</span>
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Dietary needs, +1, relation…"
          className="w-full mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => {
              if (confirm(`Remove ${guest.name}${guest.surname ? ' ' + guest.surname : ''} from the list?`)) {
                onDelete();
                onClose();
              }
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Delete
          </button>
          <div className="flex gap-2">
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
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
