import { useEffect, useRef, useState } from 'react';
import type { EventState } from '../types';
import { exportAsExcel, exportAsJson, exportAsPdf } from '../lib/exportData';
import { encodeStateToLink } from '../lib/shareLink';
import { useLanguage } from '../hooks/useLanguage';
import { useInstallPrompt } from '../hooks/useInstallPrompt';

export function ExportMenu({
  state,
  fullWidth,
  onToast,
  onShowInvitation,
  onShowQr,
}: {
  state: EventState;
  fullWidth?: boolean;
  onToast?: (msg: string) => void;
  onShowInvitation?: () => void;
  onShowQr?: () => void;
}) {
  const { t, lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const { state: installState, promptInstall } = useInstallPrompt();
  // Offer the shortcut only where there's a path to install: a native prompt, or iOS's manual flow.
  const canInstall = installState === 'available' || installState === 'ios';

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
          className={`absolute mt-1 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden z-20 ${fullWidth ? 'left-0' : 'right-0'}`}
        >
          {canShare && (
            <button
              onClick={() => void shareLink()}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {t('share.share')} <span className="text-slate-400 text-xs block">{t('share.shareDesc')}</span>
            </button>
          )}
          <button
            onClick={() => void copyLink()}
            className={`w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 ${canShare ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
          >
            {t('share.copyLink')} <span className="text-slate-400 text-xs block">{t('share.copyLinkDesc')}</span>
          </button>
          {canInstall && (
            <button
              onClick={() => void addToHomeScreen()}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
            >
              {t('export.shortcut')} <span className="text-slate-400 text-xs block">{t('export.shortcutDesc')}</span>
            </button>
          )}
          {onShowInvitation && (
            <button
              onClick={() => {
                onShowInvitation();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
            >
              {t('export.invitation')} <span className="text-slate-400 text-xs block">{t('export.invitationDesc')}</span>
            </button>
          )}
          {onShowQr && (
            <button
              onClick={() => {
                onShowQr();
                setOpen(false);
              }}
              className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
            >
              {t('export.qr')} <span className="text-slate-400 text-xs block">{t('export.qrDesc')}</span>
            </button>
          )}
          <button
            onClick={() => {
              exportAsJson(state);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
          >
            {t('export.json')} <span className="text-slate-400 text-xs block">{t('export.jsonDesc')}</span>
          </button>
          <button
            onClick={() => {
              void exportAsPdf(state, t, lang);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
          >
            {t('export.pdf')} <span className="text-slate-400 text-xs block">{t('export.pdfDesc')}</span>
          </button>
          <button
            onClick={() => {
              void exportAsExcel(state, t, lang);
              setOpen(false);
            }}
            className="w-full text-left px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 border-t border-slate-100 dark:border-slate-800"
          >
            {t('export.excel')} <span className="text-slate-400 text-xs block">{t('export.excelDesc')}</span>
          </button>
        </div>
      )}
    </div>
  );
}
