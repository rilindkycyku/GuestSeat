import { useEffect, useRef, useState } from 'react';
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
  /**
   * Asks a second time before the action runs — for the handful of actions that rewrite or wipe the
   * *whole* list (unseat everyone, reset every RSVP, delete an event). One tap on a phone is too
   * little between a mistap and losing an evening's work, so these state the exact damage — how many
   * guests, how many tables — and make the last tap a deliberate one.
   */
  confirmAgain?: {
    message: string;
    /** Defaults to `common.confirmFinal` ("Yes, continue"). */
    confirmLabel?: string;
  };
  /**
   * A word the user has to type before the last button unlocks — for the two or three actions that
   * reach past this device, like replacing the cloud copy with what is here. A stray double-tap can
   * dismiss a dialog; it cannot type "REPLACE".
   */
  requireText?: string;
  onConfirm: () => void;
}

interface ConfirmModalProps extends ConfirmOptions {
  onClose: () => void;
}

/** Themed replacement for the native confirm() dialog, optionally asking twice. */
export function ConfirmModal({
  message,
  confirmLabel,
  title,
  danger,
  confirmAgain,
  requireText,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const final = step === 2;
  // The word is asked for on the last step only, so a two-step dialog explains itself first and
  // demands the typing once there is nothing left to read.
  const lastStep = final || !confirmAgain;
  const locked = Boolean(requireText) && lastStep && typed.trim().toUpperCase() !== requireText!.toUpperCase();

  // The second step starts with focus on Cancel, so holding or double-tapping Enter can't carry
  // someone straight through both steps — the point of asking twice is that the last press is aimed.
  useEffect(() => {
    if (final) cancelRef.current?.focus();
  }, [final]);

  const confirm = () => {
    onConfirm();
    onClose();
  };

  const shown = final
    ? { message: confirmAgain!.message, confirmLabel: confirmAgain!.confirmLabel ?? t('common.confirmFinal') }
    : { message, confirmLabel };

  return (
    <ModalShell
      onClose={onClose}
      label={title ?? confirmLabel}
      panelClassName="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6"
      zClassName="z-[60]"
    >
      {title && <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1.5">{title}</h2>}
      {confirmAgain && (
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
          {t('common.confirmStep', { step, total: 2 })}
        </p>
      )}
      <p
        className={`text-sm mb-5 ${
          final ? 'font-medium text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
        }`}
      >
        {shown.message}
      </p>

      {requireText && lastStep && (
        <label className="block mb-5">
          <span className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
            {t('common.typeToConfirm', { word: requireText })}
          </span>
          <input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
          />
        </label>
      )}

      <div className="flex justify-end gap-2">
        <button
          ref={cancelRef}
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {t('common.cancel')}
        </button>
        <button
          autoFocus={!requireText}
          disabled={locked}
          onClick={confirmAgain && !final ? () => setStep(2) : confirm}
          className={`px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
            danger ? 'bg-red-600 hover:bg-red-500' : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {shown.confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}
