import { useEffect, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

export function UpdatePrompt() {
  const { language } = useLanguage();
  const isSq = language === 'sq';
  const [hasUpdate, setHasUpdate] = useState(false);
  const [swWaiting, setSwWaiting] = useState<ServiceWorker | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        setSwWaiting(reg.waiting);
        setHasUpdate(true);
      }

      reg.addEventListener('updatefound', () => {
        const installing = reg.installing;
        if (!installing) return;

        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setSwWaiting(installing);
            setHasUpdate(true);
          }
        });
      });
    }).catch(() => {});

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }, []);

  const handleUpdate = () => {
    setUpdating(true);
    if (swWaiting) {
      swWaiting.postMessage({ type: 'SKIP_WAITING' });
    }
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  if (!hasUpdate) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-4 shadow-2xl transition-all"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400">
          ✨
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {isSq ? 'Version i ri i disponueshëm' : 'New version available'}
          </h4>
          <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            {isSq
              ? 'Ka dalë një përditësim i ri. Të dhënat tuaja ruhen të sigurta.'
              : 'A new update is ready. Your seating data remains safe.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={updating}
              onClick={handleUpdate}
              className="inline-flex items-center justify-center rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-semibold px-3 py-1.5 transition-colors disabled:opacity-50"
            >
              {updating ? (isSq ? 'Duke u përditësuar...' : 'Updating...') : (isSq ? 'Përditëso tani' : 'Update now')}
            </button>
            <button
              type="button"
              disabled={updating}
              onClick={() => setHasUpdate(false)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium px-2.5 py-1.5 transition-colors"
            >
              {isSq ? 'Më vonë' : 'Later'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
