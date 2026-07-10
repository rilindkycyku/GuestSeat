import { useEffect, useRef, useState } from 'react';
import type { EventState } from '../types';
import { exportAsCsv, exportAsJson, exportAsPdf } from '../lib/exportData';
import { useLanguage } from '../hooks/useLanguage';

export function ExportMenu({ state, fullWidth }: { state: EventState; fullWidth?: boolean }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className={`relative ${fullWidth ? 'w-full' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 ${fullWidth ? 'w-full justify-center' : ''}`}
      >
        {t('export.label')}
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div
          className={`absolute mt-1 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20 ${fullWidth ? 'left-0' : 'right-0'}`}
        >
          <button
            onClick={() => {
              exportAsJson(state);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t('export.json')} <span className="text-slate-400 text-xs block">{t('export.jsonDesc')}</span>
          </button>
          <button
            onClick={() => {
              exportAsPdf(state);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
          >
            {t('export.pdf')} <span className="text-slate-400 text-xs block">{t('export.pdfDesc')}</span>
          </button>
          <button
            onClick={() => {
              exportAsCsv(state);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
          >
            {t('export.csv')} <span className="text-slate-400 text-xs block">{t('export.csvDesc')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
