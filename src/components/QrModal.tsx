import { useEffect, useState } from 'react';
import type { EventState } from '../types';
import { qrDataUrl, QrTooLargeError } from '../lib/qr';
import { encodeStateToLink } from '../lib/shareLink';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Shows a scannable QR code for the current event's share link, so a guest can
 * point their phone at a screen (or a printout) and open the list directly.
 * Large guest lists can't fit in a QR code — in that case we keep the "copy link"
 * fallback, which works regardless of size.
 */
export function QrModal({
  state,
  onToast,
  onClose,
}: {
  state: EventState;
  onToast?: (msg: string) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [link, setLink] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'tooLarge' | 'failed'>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await encodeStateToLink(state);
        if (cancelled) return;
        setLink(url);
        try {
          const png = await qrDataUrl(url);
          if (cancelled) return;
          setDataUrl(png);
          setStatus('ready');
        } catch (err) {
          if (cancelled) return;
          setStatus(err instanceof QrTooLargeError ? 'tooLarge' : 'failed');
        }
      } catch {
        if (!cancelled) setStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state]);

  const copyLink = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      onToast?.(t('share.copied'));
    } catch {
      onToast?.(t('share.failed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-xs bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t('share.qrTitle')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          {status === 'tooLarge' ? t('share.qrTooLarge') : t('share.qrDesc')}
        </p>

        <div className="flex items-center justify-center rounded-2xl bg-white p-4 border border-slate-200 dark:border-slate-700 min-h-[220px]">
          {status === 'ready' && dataUrl ? (
            <img src={dataUrl} alt={t('share.qrTitle')} className="w-52 h-52" />
          ) : status === 'loading' ? (
            <div className="w-52 h-52 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : (
            <p className="text-sm text-slate-400 text-center px-4">
              {status === 'tooLarge' ? '📋 ' + t('share.qrTooLargeHint') : t('share.failed')}
            </p>
          )}
        </div>

        {link && (
          <button
            onClick={() => void copyLink()}
            className="mt-4 w-full rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-500"
          >
            {t('share.copyLink')}
          </button>
        )}
      </div>
    </div>
  );
}
