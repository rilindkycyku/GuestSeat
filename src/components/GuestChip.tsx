import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Guest } from '../types';

interface GuestChipProps {
  guest: Guest;
  highlighted?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function GuestChip({ guest, highlighted, onClick, compact }: GuestChipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: guest.id,
    data: { guestId: guest.id },
  });

  const style = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 50 }
    : undefined;

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      title={guest.notes}
      data-testid="guest-chip"
      data-guest-id={guest.id}
      className={`group flex items-center gap-1.5 w-full text-left rounded-lg border px-2.5 py-1.5 text-sm transition-colors cursor-grab active:cursor-grabbing touch-pan-y
        ${isDragging ? 'opacity-40' : 'opacity-100'}
        ${
          highlighted
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-300'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600'
        }
        ${compact ? 'py-1' : ''}
      `}
    >
      <span className="truncate text-slate-800 dark:text-slate-100">
        {guest.name}
        {guest.surname ? <span className="text-slate-500 dark:text-slate-400"> {guest.surname}</span> : null}
      </span>
      {guest.notes && <span className="ml-auto text-xs text-slate-400 shrink-0">📝</span>}
    </button>
  );
}
