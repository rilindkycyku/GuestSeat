import { useLanguage } from '../hooks/useLanguage';

/**
 * The shared header for every modal: a soft gradient bar with an icon tile,
 * title and a rounded close button. Keeping it in one place means all of the
 * app's dialogs (settings, event details, invitation, QR, guest editor…) read
 * as one cohesive surface instead of each styling its own header.
 *
 * It's designed to sit flush at the top of a padding-free panel; put the
 * dialog body in its own padded, scrollable container below it.
 */
export function ModalHeader({
  icon,
  title,
  onClose,
}: {
  icon: string;
  title: string;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-950/40 dark:to-slate-900">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="shrink-0 w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-lg">
          {icon}
        </span>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">{title}</h2>
      </div>
      <button
        onClick={onClose}
        className="shrink-0 w-9 h-9 rounded-xl bg-white/70 dark:bg-slate-800 text-slate-500 hover:bg-white dark:hover:bg-slate-700 flex items-center justify-center transition-colors"
        aria-label={t('common.close')}
      >
        ✕
      </button>
    </div>
  );
}
