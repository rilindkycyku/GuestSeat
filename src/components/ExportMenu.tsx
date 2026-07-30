import { useEffect, useRef, useState } from 'react';
import type { EventState } from '../types';
import { exportAsExcel, exportAsJson, exportAsPdf, exportAsPlaceCards, exportAsTableCards } from '../lib/exportData';
import { encodeStateToLink } from '../lib/shareLink';
import { useLanguage } from '../hooks/useLanguage';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

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

  // One list, rendered as either a dropdown or an accordion — the two used to be written out twice.
  const items: { key: string; label: string; desc: string; onClick: () => void }[] = [
    canShare && { key: 'share', label: t('share.share'), desc: t('share.shareDesc'), onClick: () => void shareLink() },
    { key: 'copy', label: t('share.copyLink'), desc: t('share.copyLinkDesc'), onClick: () => void copyLink() },
    canInstall && {
      key: 'shortcut',
      label: t('export.shortcut'),
      desc: t('export.shortcutDesc'),
      onClick: () => void addToHomeScreen(),
    },
    onShowInvitation && {
      key: 'invitation',
      label: t('export.invitation'),
      desc: t('export.invitationDesc'),
      onClick: run(onShowInvitation),
    },
    onShowQr && { key: 'qr', label: t('export.qr'), desc: t('export.qrDesc'), onClick: run(onShowQr) },
    { key: 'json', label: t('export.json'), desc: t('export.jsonDesc'), onClick: run(() => exportAsJson(state)) },
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
    {
      key: 'excel',
      label: t('export.excel'),
      desc: t('export.excelDesc'),
      onClick: run(() => void exportAsExcel(state, t, lang)),
    },
  ].filter((item): item is { key: string; label: string; desc: string; onClick: () => void } => Boolean(item));

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
            {items.map((item) => (
              <button
                key={item.key}
                onClick={item.onClick}
                className="text-left px-3 py-2 rounded-lg text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {item.label}
                <span className="block text-xs text-slate-400">{item.desc}</span>
              </button>
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
        <div className="absolute right-0 mt-1 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20">
          {items.map((item, i) => (
            <button
              key={item.key}
              onClick={item.onClick}
              className={`w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 ${
                i > 0 ? 'border-t border-slate-100 dark:border-slate-800' : ''
              }`}
            >
              {item.label} <span className="text-slate-400 text-xs block">{item.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
