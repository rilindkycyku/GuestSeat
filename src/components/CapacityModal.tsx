import { useState } from 'react';
import type { Table, TableShape } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';

interface CapacityModalProps {
  table: Table;
  onSave: (capacity: number, shape: TableShape) => void;
  onClose: () => void;
}

/** Themed replacement for the native prompt() used to edit a table's seat capacity and shape. */
export function CapacityModal({ table, onSave, onClose }: CapacityModalProps) {
  const { t } = useLanguage();
  const [value, setValue] = useState(Math.max(1, table.capacity));
  const [shape, setShape] = useState<TableShape>(table.shape ?? 'round');

  const save = () => {
    onSave(value, shape);
    onClose();
  };

  const bump = (delta: number) => setValue((v) => Math.max(1, v + delta));

  return (
    <ModalShell
      onClose={onClose}
      label={t('tables.editCapacity')}
      panelClassName="w-full sm:max-w-xs bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
    >
      <ModalHeader icon="🪑" title={t('tables.editCapacity')} onClose={onClose} />

      <div className="p-6">
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

        {/* Table shape: a round table or a long banquet ("imperial") table. */}
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-2">{t('tables.shape')}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['round', 'long'] as const).map((option) => {
              const active = shape === option;
              return (
                <button
                  key={option}
                  onClick={() => setShape(option)}
                  className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span aria-hidden className="text-lg leading-none shrink-0">
                    {option === 'round' ? '⭕' : '▭'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800 dark:text-white">
                      {option === 'round' ? t('tables.shapeRound') : t('tables.shapeLong')}
                    </span>
                    <span className="block text-[11px] text-slate-400 leading-tight">
                      {option === 'round' ? t('tables.shapeRoundDesc') : t('tables.shapeLongDesc')}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
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
    </ModalShell>
  );
}
