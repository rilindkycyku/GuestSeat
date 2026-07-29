import type { ToastState } from '../hooks/useToast';

/**
 * The bottom-centre toast, and the live region that announces it.
 *
 * The region is always mounted, empty or not: a `role="status"` element that appears at the same
 * moment as its text is announced unreliably, so only the message inside it comes and goes. That
 * matters most for the Undo, which is time-limited and useless to someone who never hears it.
 */
export function Toast({ toast, onAction }: { toast: ToastState | null; onAction: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-print="hide"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] pointer-events-none"
    >
      {toast && (
        <div className="pointer-events-auto flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium pl-4 pr-2 py-2 rounded-xl shadow-lg">
          <span className="truncate">{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => {
                toast.action?.onClick();
                onAction();
              }}
              className="shrink-0 rounded-lg bg-white/15 dark:bg-slate-900/10 hover:bg-white/25 dark:hover:bg-slate-900/20 px-2.5 py-1 text-indigo-300 dark:text-indigo-600 font-semibold"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
