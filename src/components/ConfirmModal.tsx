import { useLanguage } from '../hooks/useLanguage';
import { ModalShell } from './ModalShell';

export interface ConfirmOptions {
  message: string;
  /** Label for the confirming action (e.g. "Delete", "Remove"). */
  confirmLabel: string;
  /** Optional heading above the message. */
  title?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
  onConfirm: () => void;
}

interface ConfirmModalProps extends ConfirmOptions {
  onClose: () => void;
}

/** Themed replacement for the native confirm() dialog. */
export function ConfirmModal({ message, confirmLabel, title, danger, onConfirm, onClose }: ConfirmModalProps) {
  const { t } = useLanguage();

  const confirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <ModalShell
      onClose={onClose}
      label={title ?? confirmLabel}
      panelClassName="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      zClassName="z-[60]"
    >
      {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">{title}</h2>}
      <p className="text-sm text-slate-600 dark:text-slate-300 mb-5">{message}</p>

      <div className="flex justify-end gap-2">
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {t('common.cancel')}
        </button>
        <button
          autoFocus
          onClick={confirm}
          className={`px-4 py-2 rounded-lg text-white text-sm font-medium ${
            danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
