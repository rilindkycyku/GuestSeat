import { useEffect, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';

/**
 * Set only by «Update now». A controller change is a reload *only* when the user asked for the
 * update: the first install also changes the controller (from none to one), and reloading on that
 * reloaded every first visit for nothing. Module-level, because the listener below can be added more
 * than once and the flag has to be one.
 */
let requestedByUser = false;

export function UpdatePrompt() {
  const { lang } = useLanguage();
  const isSq = lang === 'sq';
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

      const follow = (installing: ServiceWorker) => {
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            setSwWaiting(installing);
            setHasUpdate(true);
          }
        });
      };
      // A version already installing when this mounted: its `updatefound` has been and gone.
      if (reg.installing) follow(reg.installing);
      reg.addEventListener('updatefound', () => {
        if (reg.installing) follow(reg.installing);
      });
    }).catch(() => {});

    const onControllerChange = () => {
      if (!requestedByUser) return;
      requestedByUser = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  const handleUpdate = () => {
    setUpdating(true);
    requestedByUser = true;
    if (swWaiting) {
      swWaiting.postMessage({ type: 'SKIP_WAITING' });
    }
    // The reload normally comes from `controllerchange` the moment the new worker takes over. This
    // is the fallback for a browser that never fires it - late enough not to reload ahead of the
    // takeover, which would only bring the same waiting version (and this prompt) straight back.
    setTimeout(() => {
      window.location.reload();
    }, 3000);
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
