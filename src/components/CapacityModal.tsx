import { useState } from 'react';
import type { Table } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';

interface CapacityModalProps {
  table: Table;
  onSave: (capacity: number) => void;
  onClose: () => void;
}

/** Themed replacement for the native prompt() used to edit a table's seat capacity. */
export function CapacityModal({ table, onSave, onClose }: CapacityModalProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState(String(table.capacity));

  const parsed = parseInt(value, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;

  const save = () => {
    if (!valid) return;
    onSave(parsed);
    onClose();
  };

  const bump = (delta: number) => setValue((v) => String(Math.max(1, (parseInt(v, 10) || 0) + delta)));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div
        className="w-full sm:max-w-xs bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('tables.editCapacity')}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{tableDisplayName(table, t)}</p>

        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={() => bump(-1)}
            aria-label={t('tables.decreaseCapacity')}
            className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            −
          </button>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            min={1}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            onFocus={(e) => e.target.select()}
            className="flex-1 min-w-0 text-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-lg font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-400"
          />
          <button
            onClick={() => bump(1)}
            aria-label={t('tables.increaseCapacity')}
            className="w-10 h-10 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            +
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={save}
            disabled={!valid}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
