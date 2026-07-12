import { useEffect, useState } from 'react';
import type { EventState } from '../types';
import { qrDataUrl, QrTooLargeError } from '../lib/qr';
import { encodeStateToLink, toQrPayloadUrl } from '../lib/shareLink';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Shows a scannable QR code for the current event's share link, so a guest can
 * point their phone at a screen (or a printout) and open the list directly.
 *
 * Large guest lists (roughly 400+) can't fit in a QR code — the whole seating
 * state travels inside the link, and there's no server to shorten it. When that
 * happens we don't dead-end: the same link is still fully shareable, so the modal
 * offers the best available ways to send it — the native share sheet (WhatsApp,
 * email, Messages…), a direct WhatsApp button, and copy-to-clipboard.
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

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = await encodeStateToLink(state);
        if (cancelled) return;
        setLink(url);
        try {
          const png = await qrDataUrl(toQrPayloadUrl(url));
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

  // Native share sheet (WhatsApp, email, Messages, AirDrop…), the best option on phones.
  const shareNative = async () => {
    if (!link) return;
    try {
      await navigator.share({ title: state.eventName, text: t('share.shareText', { name: state.eventName }), url: link });
    } catch (err) {
      // AbortError = the user dismissed the share sheet; stay silent for that.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      await copyLink();
    }
  };

  // Direct WhatsApp deep link — works on desktop too, where the native sheet is usually absent.
  const shareWhatsApp = () => {
    if (!link) return;
    const text = `${t('share.shareText', { name: state.eventName })}\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const tooLarge = status === 'tooLarge';

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
          {tooLarge ? t('share.qrTooLarge') : t('share.qrDesc')}
        </p>

        {/* The QR itself — or, when the list is too big for one, a friendly panel that points
            to the sharing buttons below instead of dead-ending on an error. */}
        <div className="flex items-center justify-center rounded-2xl bg-white p-4 border border-slate-200 dark:border-slate-700 min-h-[220px]">
          {status === 'ready' && dataUrl ? (
            <img src={dataUrl} alt={t('share.qrTitle')} className="w-52 h-52" />
          ) : status === 'loading' ? (
            <div className="w-52 h-52 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ) : tooLarge ? (
            <div className="w-52 flex flex-col items-center justify-center text-center gap-2 py-4">
              <span className="text-4xl">📲</span>
              <p className="text-sm text-slate-500 dark:text-slate-400 px-2">{t('share.qrTooLargeHint')}</p>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center px-4">{t('share.failed')}</p>
          )}
        </div>

        {/* Share actions. When the QR is too large these become the primary way to share;
            for a normal QR they're a convenient secondary path. */}
        {link && (
          <div className="mt-4 space-y-2">
            {canShare && (
              <button
                onClick={() => void shareNative()}
                className={`w-full rounded-xl text-sm font-medium px-4 py-2.5 ${
                  tooLarge
                    ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {t('share.share')}
              </button>
            )}
            <button
              onClick={shareWhatsApp}
              className="w-full rounded-xl bg-emerald-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-emerald-500"
            >
              {t('share.whatsapp')}
            </button>
            <button
              onClick={() => void copyLink()}
              className={`w-full rounded-xl text-sm font-medium px-4 py-2.5 ${
                tooLarge || canShare
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500'
              }`}
            >
              {t('share.copyLink')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
