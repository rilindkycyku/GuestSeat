import { useEffect, useRef, useState } from 'react';
import type { EventState } from '../types';
import { exportAsExcel, exportAsJson, exportAsPdf, exportAsPlaceCards, exportAsTableCards } from '../lib/exportData';
import { encodeStateToLink } from '../lib/shareLink';
import { useLanguage } from '../hooks/useLanguage';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface ExportItem {
  key: string;
  label: string;
  desc: string;
  onClick: () => void;
}

interface ExportMenuProps {
  state: EventState;
  /**
   * Render the choices in the flow of the page (an accordion) instead of a floating dropdown.
   * Used inside the nav drawer, where an absolutely positioned menu would spill over the board.
   */
  inline?: boolean;
  onToast?: (msg: string) => void;
  onShowInvitation?: () => void;
  onShowQr?: () => void;
}

export function ExportMenu({ state, inline, onToast, onShowInvitation, onShowQr }: ExportMenuProps) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const { state: installState, promptInstall } = useInstallPrompt();
  // Offer the shortcut only where there's a path to install: a native prompt, or iOS's manual flow.
  const canInstall = installState === 'available' || installState === 'ios';

  useEffect(() => {
    if (!open || inline) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, inline]);

  const copyLink = async () => {
    setOpen(false);
    try {
      const url = await encodeStateToLink(state);
      await navigator.clipboard.writeText(url);
      onToast?.(t('share.copied'));
    } catch {
      onToast?.(t('share.failed'));
    }
  };

  // Native share sheet (WhatsApp, email, AirDrop…) carrying the auto-load link; falls back to copy.
  const shareLink = async () => {
    setOpen(false);
    try {
      const url = await encodeStateToLink(state);
      await navigator.share({ title: state.eventName, text: t('share.shareText', { name: state.eventName }), url });
    } catch (err) {
      // AbortError = the user dismissed the share sheet; stay silent for that.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(await encodeStateToLink(state));
        onToast?.(t('share.copied'));
      } catch {
        onToast?.(t('share.failed'));
      }
    }
  };

  // Install the app as a home-screen shortcut. On Chrome/Edge this fires the native prompt; on
  // iOS there's no programmatic install, so we point the user at the Share → Add flow instead.
  const addToHomeScreen = async () => {
    setOpen(false);
    if (installState === 'ios') {
      onToast?.(t('export.shortcutIosHint'));
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') onToast?.(t('export.shortcutAdded'));
  };

  const run = (action: () => void) => () => {
    action();
    setOpen(false);
  };

  /**
   * The choices in four named groups. Ten of them in one flat list read as a wall of text and, on a
   * short screen, ran off the bottom edge — sharing a link and cutting out place cards are different
   * errands, so they say so now.
   */
  const sections: { key: string; label: string; items: ExportItem[] }[] = [
    {
      key: 'share',
      label: t('export.groups.share'),
      items: [
        canShare && {
          key: 'share',
          label: t('share.share'),
          desc: t('share.shareDesc'),
          onClick: () => void shareLink(),
        },
        { key: 'copy', label: t('share.copyLink'), desc: t('share.copyLinkDesc'), onClick: () => void copyLink() },
        onShowQr && { key: 'qr', label: t('export.qr'), desc: t('export.qrDesc'), onClick: run(onShowQr) },
      ],
    },
    {
      key: 'print',
      label: t('export.groups.print'),
      items: [
        onShowInvitation && {
          key: 'invitation',
          label: t('export.invitation'),
          desc: t('export.invitationDesc'),
          onClick: run(onShowInvitation),
        },
        {
          key: 'pdf',
          label: t('export.pdf'),
          desc: t('export.pdfDesc'),
          onClick: run(() => void exportAsPdf(state, t, lang)),
        },
        {
          key: 'tableCards',
          label: t('export.tableCards'),
          desc: t('export.tableCardsDesc'),
          onClick: run(() => void exportAsTableCards(state, t, lang)),
        },
        {
          key: 'placeCards',
          label: t('export.placeCards'),
          desc: t('export.placeCardsDesc'),
          onClick: run(() => void exportAsPlaceCards(state, t, lang)),
        },
      ],
    },
    {
      key: 'files',
      label: t('export.groups.files'),
      items: [
        {
          key: 'excel',
          label: t('export.excel'),
          desc: t('export.excelDesc'),
          onClick: run(() => void exportAsExcel(state, t, lang)),
        },
        { key: 'json', label: t('export.json'), desc: t('export.jsonDesc'), onClick: run(() => exportAsJson(state)) },
      ],
    },
    {
      key: 'app',
      label: t('export.groups.app'),
      items: [
        canInstall && {
          key: 'shortcut',
          label: t('export.shortcut'),
          desc: t('export.shortcutDesc'),
          onClick: () => void addToHomeScreen(),
        },
      ],
    },
  ]
    .map((section) => ({ ...section, items: section.items.filter((i): i is ExportItem => Boolean(i)) }))
    .filter((section) => section.items.length > 0);

  if (inline) {
    return (
      <div>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <span className="w-6 text-center text-base" aria-hidden>
            📤
          </span>
          <span className="flex-1 text-left">{t('export.label')}</span>
          <span className={`text-xs text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden>
            ▾
          </span>
        </button>
        {open && (
          <div className="mt-0.5 ml-6 pl-3 border-l border-slate-200 dark:border-slate-700 flex flex-col">
            {sections.map((section) => (
              <div key={section.key} className="mb-1 last:mb-0">
                <div className="px-3 pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {section.label}
                </div>
                {section.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={item.onClick}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {item.label}
                    <span className="block text-xs text-slate-400">{item.desc}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5"
      >
        {t('export.label')}
        <span className="text-xs">▾</span>
      </button>
      {open && (
        // Two columns of groups rather than one column of ten rows: stacked, the list was taller than
        // the viewport left below the header and simply ran off the bottom of the screen.
        <div className="absolute right-0 mt-1 w-[30rem] max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg z-20 p-2 grid grid-cols-2 gap-x-2 gap-y-1 items-start">
          {sections.map((section) => (
            <div key={section.key}>
              <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.label}
              </div>
              {section.items.map((item) => (
                <button
                  key={item.key}
                  onClick={item.onClick}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {item.label} <span className="text-slate-400 text-xs block">{item.desc}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
