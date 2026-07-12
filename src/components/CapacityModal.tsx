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
  const [value, setValue] = useState(Math.max(1, table.capacity));

  const save = () => {
    onSave(value);
    onClose();
  };

  const bump = (delta: number) => setValue((v) => Math.max(1, v + delta));

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

        {/* Steppers only — no text input, so the on-screen keyboard never opens. */}
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => bump(-1)}
            disabled={value <= 1}
            aria-label={t('tables.decreaseCapacity')}
            className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-2xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"
          >
            −
          </button>
          <div className="flex-1 min-w-0 text-center text-2xl font-bold text-slate-900 dark:text-white tabular-nums select-none">
            {value}
          </div>
          <button
            onClick={() => bump(1)}
            aria-label={t('tables.increaseCapacity')}
            className="w-12 h-12 shrink-0 rounded-xl bg-slate-100 dark:bg-slate-800 text-2xl text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
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
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
