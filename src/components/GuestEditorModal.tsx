import { useState } from 'react';
import type { Guest, Table } from '../types';
import { useLanguage } from '../hooks/useLanguage';

interface GuestEditorModalProps {
  guest: Guest;
  tables: Table[];
  seatedCount: Map<string, number>;
  onSave: (patch: Partial<Guest>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function GuestEditorModal({ guest, tables, seatedCount, onSave, onDelete, onClose }: GuestEditorModalProps) {
  const { t } = useLanguage();
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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{t('guestEditor.title')}</h2>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.name')} <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.surname')} <span className="text-slate-400">({t('common.optional')})</span>
        </label>
        <input
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('guestEditor.table')}</label>
        <select
          value={tableId}
          onChange={(e) => setTableId(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        >
          <option value="">{t('guestEditor.unseatedOption')}</option>
          {tables.map((tb) => (
            <option key={tb.id} value={tb.id}>
              {tb.name} ({seatedCount.get(tb.id) ?? 0}/{tb.capacity})
            </option>
          ))}
        </select>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.notes')} <span className="text-slate-400">({t('common.optional')})</span>
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('guestEditor.notesPlaceholder')}
          className="w-full mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => {
              const fullName = guest.surname ? `${guest.name} ${guest.surname}` : guest.name;
              if (confirm(t('guestEditor.deleteConfirm', { name: fullName }))) {
                onDelete();
                onClose();
              }
            }}
            className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            {t('common.delete')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={save}
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
