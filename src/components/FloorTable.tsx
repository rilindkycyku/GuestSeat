import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Guest, Table, TableSide } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { groupLinkedWithin } from '../lib/linkGroups';

interface FloorTableProps {
  table: Table;
  guests: Guest[];
  matchedIds: Set<string> | null;
  highlighted: boolean;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
}

function initials(g: Guest): string {
  const first = g.name[0] ?? '';
  const second = g.surname?.[0] ?? g.name[1] ?? '';
  return (first + second).toUpperCase();
}

function SeatDot({
  guest,
  x,
  y,
  highlighted,
  rsvpTitle,
  onClick,
}: {
  guest: Guest;
  x: number;
  y: number;
  highlighted: boolean;
  rsvpTitle: string;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: guest.id,
    data: { guestId: guest.id },
  });
  const style: React.CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    ...(transform ? { transform: `translate(-50%, -50%) ${CSS.Translate.toString(transform)}`, zIndex: 50 } : {}),
  };

  const ring = highlighted
    ? 'border-amber-400 ring-2 ring-amber-300'
    : guest.rsvp === 'confirmed'
      ? 'border-emerald-500'
      : guest.rsvp === 'declined'
        ? 'border-red-400'
        : 'border-slate-300 dark:border-slate-600';

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={onClick}
      data-testid="floor-seat"
      data-guest-id={guest.id}
      title={`${guest.surname ? `${guest.name} ${guest.surname}` : guest.name}${rsvpTitle}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 flex items-center justify-center
        text-[10px] font-bold cursor-grab active:cursor-grabbing touch-pan-y select-none transition-shadow hover:shadow-md
        ${isDragging ? 'opacity-40' : ''}
        ${ring}
        ${
          guest.rsvp === 'declined'
            ? 'bg-red-50 dark:bg-red-950/40 text-red-400 dark:text-red-500'
            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
        }`}
    >
      {initials(guest)}
    </button>
  );
}

const SIDE_RING: Record<TableSide, string> = {
  groom: 'border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/30',
  bride: 'border-pink-200 dark:border-pink-900 bg-pink-50/60 dark:bg-pink-950/30',
};

export function FloorTable({
  table,
  guests,
  matchedIds,
  highlighted,
  onUpdateTable,
  onRemoveTable,
  onGuestClick,
}: FloorTableProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: table.id });
  const displayName = tableDisplayName(table, t);
  const isOverCapacity = guests.length > table.capacity;

  // Linked guests sit next to each other around the table.
  const orderedGuests = useMemo(() => groupLinkedWithin(guests).flat(), [guests]);

  const seatCount = Math.max(table.capacity, guests.length);
  const seats = useMemo(
    () =>
      Array.from({ length: seatCount }, (_, i) => {
        const angle = (2 * Math.PI * i) / seatCount - Math.PI / 2;
        return {
          x: 50 + 41 * Math.cos(angle),
          y: 50 + 41 * Math.sin(angle),
          guest: orderedGuests[i],
        };
      }),
    [seatCount, orderedGuests]
  );

  const rsvpTitle = (g: Guest) =>
    g.rsvp === 'confirmed' ? ` — ${t('rsvp.confirmed')}` : g.rsvp === 'declined' ? ` — ${t('rsvp.declined')}` : '';

  return (
    <div
      ref={setNodeRef}
      data-testid="table-card"
      data-table-id={table.id}
      data-table-side={table.side ?? ''}
      className={`relative rounded-2xl border-2 p-2 transition-all bg-white dark:bg-slate-900 shadow-sm hover:shadow-md scroll-mt-24 ${
        isOver
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
          : highlighted
            ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="absolute top-2 left-2 z-10 flex items-center gap-0.5" title={t('tables.setSide')}>
        <button
          onClick={() => onUpdateTable({ side: table.side === 'groom' ? undefined : 'groom' })}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
            table.side === 'groom'
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
              : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'
          }`}
        >
          {t('tables.side.groom')}
        </button>
        <button
          onClick={() => onUpdateTable({ side: table.side === 'bride' ? undefined : 'bride' })}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
            table.side === 'bride'
              ? 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300'
              : 'text-slate-300 dark:text-slate-600 hover:text-slate-400'
          }`}
        >
          {t('tables.side.bride')}
        </button>
      </div>

      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          onClick={() => onUpdateTable({ capacity: Math.max(1, table.capacity - 1) })}
          className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          title={t('tables.decreaseCapacity')}
        >
          −
        </button>
        <button
          onClick={() => onUpdateTable({ capacity: table.capacity + 1 })}
          className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
          title={t('tables.increaseCapacity')}
        >
          +
        </button>
        <button
          onClick={() => {
            if (guests.length === 0 || confirm(t('tables.removeTableConfirm', { name: displayName }))) {
              onRemoveTable();
            }
          }}
          className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40"
          title={t('tables.removeTable')}
        >
          ✕
        </button>
      </div>

      <div className="relative aspect-square mt-4">
        {/* The table itself */}
        <div
          className={`absolute inset-[26%] rounded-full border-4 flex flex-col items-center justify-center text-center px-2 ${
            table.side ? SIDE_RING[table.side] : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
          }`}
        >
          <span className="text-xs font-bold text-slate-800 dark:text-white leading-tight max-w-full truncate">
            {displayName}
          </span>
          <span
            className={`text-[10px] font-medium ${
              isOverCapacity
                ? 'text-red-500'
                : guests.length >= table.capacity
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
            }`}
          >
            {guests.length}/{table.capacity}
          </span>
        </div>

        {/* Seats around the table */}
        {seats.map((seat, i) =>
          seat.guest ? (
            <SeatDot
              key={seat.guest.id}
              guest={seat.guest}
              x={seat.x}
              y={seat.y}
              highlighted={matchedIds ? matchedIds.has(seat.guest.id) : false}
              rsvpTitle={rsvpTitle(seat.guest)}
              onClick={() => onGuestClick(seat.guest!)}
            />
          ) : (
            <div
              key={`empty-${i}`}
              style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
              className="absolute -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-700"
            />
          )
        )}
      </div>
    </div>
  );
}
