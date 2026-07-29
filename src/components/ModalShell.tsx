import type { ReactNode } from 'react';
import { useDialog } from '../hooks/useDialog';

/**
 * The shared shell every dialog sits in: the dimmed backdrop, the panel (a bottom sheet on phones,
 * centred from `sm` up), and the dialog semantics from {@link useDialog}.
 *
 * Each modal used to hand-roll this backdrop `div`, which meant none of them announced themselves
 * as dialogs, only some closed on Escape, Tab could wander into the page behind them, and closing
 * one dropped focus back at the top of the document. Doing it in one place fixes every dialog at
 * once — and keeps them looking like one another, which they already tried to.
 */
interface ModalShellProps {
  /** Called for Escape, a backdrop click, and the header's close button. */
  onClose: () => void;
  /** The dialog's accessible name — normally the same text as its visible heading. */
  label: string;
  /** Panel classes: width, rounding, max height, overflow. Backdrop and centring live here. */
  panelClassName?: string;
  /** Stacking context. Raise it for a dialog that opens on top of another one. */
  zClassName?: string;
  /** Set false where a stray click outside would lose work. */
  closeOnBackdrop?: boolean;
  children: ReactNode;
}

const DEFAULT_PANEL = 'w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl';

export function ModalShell({
  onClose,
  label,
  panelClassName = DEFAULT_PANEL,
  zClassName = 'z-50',
  closeOnBackdrop = true,
  children,
}: ModalShellProps) {
  const panelRef = useDialog(onClose);

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:px-4`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`${panelClassName} outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
