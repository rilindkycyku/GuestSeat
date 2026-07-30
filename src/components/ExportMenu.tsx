import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useExportActions } from '../hooks/useExportActions';
import type { EventState } from '../types';

interface ExportMenuProps {
  state: EventState;
  /** `share` offers the live link (apps, copy, QR); `export` offers paper and files. */
  kind: 'share' | 'export';
  onToast?: (msg: string) => void;
  onShowInvitation?: () => void;
  onShowQr?: () => void;
}

/**
 * One of the nav bar's two dropdowns over {@link useExportActions}. Sharing a link and cutting out
 * place cards used to sit in a single ten-row menu that ran off the bottom of the screen; split in
 * two, each one is short enough to show whole.
 */
export function ExportMenu({ state, kind, onToast, onShowInvitation, onShowQr }: ExportMenuProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const actions = useExportActions({ state, onToast, onShowInvitation, onShowQr });
  const groups = kind === 'share' ? actions.share : actions.output;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5"
      >
        {kind === 'share' ? t('export.shareLabel') : t('export.label')}
        <span className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-60 max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20 p-1.5">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.label}
              </div>
              {group.actions.map((action) => (
                <button
                  key={action.key}
                  onClick={() => {
                    action.onClick();
                    setOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {action.label} <span className="text-slate-400 text-xs block">{action.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
