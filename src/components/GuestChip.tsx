import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Guest } from '../types';

interface GuestChipProps {
  guest: Guest;
  highlighted?: boolean;
  onClick?: () => void;
  compact?: boolean;
  linkBadge?: { status: 'together' | 'apart'; title: string };
}

export function GuestChip({ guest, highlighted, onClick, compact, linkBadge }: GuestChipProps) {
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
      data-rsvp={guest.rsvp ?? 'pending'}
      className={`group flex items-center gap-1.5 w-full text-left rounded-lg border px-2.5 py-1.5 text-sm transition-colors cursor-grab active:cursor-grabbing touch-pan-y
        ${isDragging ? 'opacity-40' : 'opacity-100'}
        ${
          highlighted
            ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-2 ring-amber-300'
            : guest.rsvp === 'declined'
              ? 'border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20'
              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600'
        }
        ${compact ? 'py-1' : ''}
      `}
    >
      {guest.rsvp && (
        <span
          className={`shrink-0 w-2 h-2 rounded-full ${guest.rsvp === 'confirmed' ? 'bg-emerald-500' : 'bg-red-500'}`}
        />
      )}
      <span
        className={`truncate ${
          guest.rsvp === 'declined'
            ? 'text-slate-400 dark:text-slate-500 line-through'
            : 'text-slate-800 dark:text-slate-100'
        }`}
      >
        {guest.name}
        {guest.surname ? <span className="text-slate-500 dark:text-slate-400"> {guest.surname}</span> : null}
      </span>
      {linkBadge && (
        <span
          title={linkBadge.title}
          className={`ml-auto text-xs shrink-0 ${linkBadge.status === 'together' ? 'opacity-90' : 'opacity-70'}`}
        >
          {linkBadge.status === 'together' ? '🔗' : '🔗⚠️'}
        </span>
      )}
      {guest.notes && <span className={`${linkBadge ? '' : 'ml-auto'} text-xs text-slate-400 shrink-0`}>📝</span>}
    </button>
  );
}
