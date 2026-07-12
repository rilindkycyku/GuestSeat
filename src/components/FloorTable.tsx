import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Guest, Table, TableSide, TableTag } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName, tableShortName } from '../lib/tableDisplay';
import { groupLinkedWithin } from '../lib/linkGroups';
import { TAG_COLORS } from '../lib/tagColors';
import { TableTagPicker } from './TableTagPicker';

interface FloorTableProps {
  table: Table;
  guests: Guest[];
  tags: TableTag[];
  assignedTagIds: string[];
  matchedIds: Set<string> | null;
  linkBadges: Map<string, { status: 'together' | 'apart'; title: string }>;
  highlighted: boolean;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (label: string) => void;
}

function initials(g: Guest): string {
  const first = g.name[0] ?? '';
  const second = g.surname?.[0] ?? g.name[1] ?? '';
  return (first + second).toUpperCase();
}

function shortName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname[0]}.` : g.name;
}

function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
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
      title={`${fullName(guest)}${rsvpTitle}`}
      className={`absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 flex items-center justify-center
        text-[9px] font-bold cursor-grab active:cursor-grabbing touch-pan-y select-none transition-shadow hover:shadow-md
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
  tags,
  assignedTagIds,
  matchedIds,
  linkBadges,
  highlighted,
  onUpdateTable,
  onRemoveTable,
  onGuestClick,
  onToggleTag,
  onCreateTag,
}: FloorTableProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: table.id });
  const displayName = tableDisplayName(table, t);
  const isOverCapacity = guests.length > table.capacity;
  const assignedTags = useMemo(() => tags.filter((tag) => assignedTagIds.includes(tag.id)), [tags, assignedTagIds]);

  const editCapacity = () => {
    const input = window.prompt(t('tables.capacityPrompt'), String(table.capacity));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (Number.isFinite(n) && n >= 1) onUpdateTable({ capacity: n });
  };

  // Linked guests sit next to each other around the table; the name list uses the same order.
  const orderedGuests = useMemo(() => groupLinkedWithin(guests).flat(), [guests]);

  const seatCount = Math.max(table.capacity, guests.length);
  const seats = useMemo(
    () =>
      Array.from({ length: seatCount }, (_, i) => {
        const angle = (2 * Math.PI * i) / seatCount - Math.PI / 2;
        return {
          x: 50 + 42 * Math.cos(angle),
          y: 50 + 42 * Math.sin(angle),
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
      className={`flex flex-col rounded-2xl border-2 p-3 transition-all bg-white dark:bg-slate-900 shadow-sm hover:shadow-md scroll-mt-24 ${
        isOver
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
          : highlighted
            ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1 flex-wrap min-w-0">
          {assignedTags.map((tag) => (
            <span
              key={tag.id}
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TAG_COLORS[tag.color].chip}`}
            >
              {tag.label}
            </span>
          ))}
          <TableTagPicker
            tags={tags}
            tableTagIds={assignedTagIds}
            onToggle={onToggleTag}
            onCreateTag={onCreateTag}
          />
        </div>
        <div className="flex items-center gap-1 shrink-0">
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
      </div>

      <div className="relative aspect-square w-full max-w-[220px] mx-auto my-2">
        {/* The table itself */}
        <div
          title={displayName}
          className={`absolute inset-[27%] rounded-full border-4 flex flex-col items-center justify-center text-center px-1.5 ${
            table.side ? SIDE_RING[table.side] : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
          }`}
        >
          <span className="text-xs font-bold text-slate-800 dark:text-white leading-tight max-w-full truncate">
            {tableShortName(table, t)}
          </span>
          <button
            onClick={editCapacity}
            title={t('tables.editCapacity')}
            className={`text-[10px] font-medium rounded px-1 hover:bg-slate-100 dark:hover:bg-slate-700/60 ${
              isOverCapacity
                ? 'text-red-500'
                : guests.length >= table.capacity
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-400'
            }`}
          >
            {guests.length}/{table.capacity}
          </button>
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
              className="absolute -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full border-2 border-dashed border-slate-200 dark:border-slate-700"
            />
          )
        )}
      </div>

      {/* Readable guest list — always visible, no clicking required */}
      {orderedGuests.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 border-t border-slate-100 dark:border-slate-800 pt-2">
          {orderedGuests.map((g) => {
            const isMatch = matchedIds ? matchedIds.has(g.id) : false;
            const badge = linkBadges.get(g.id);
            return (
              <button
                key={g.id}
                onClick={() => onGuestClick(g)}
                data-testid="floor-name"
                title={`${fullName(g)}${rsvpTitle(g)}`}
                className={`flex items-center gap-1.5 min-w-0 text-left rounded-md px-1.5 py-1 text-xs transition-colors ${
                  isMatch
                    ? 'bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-300'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span
                  className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                    g.rsvp === 'confirmed' ? 'bg-emerald-500' : g.rsvp === 'declined' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                />
                <span
                  className={`truncate ${
                    g.rsvp === 'declined'
                      ? 'text-slate-400 dark:text-slate-500 line-through'
                      : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {shortName(g)}
                </span>
                {badge && (
                  <span title={badge.title} className="ml-auto shrink-0 text-[9px] opacity-70">
                    {badge.status === 'together' ? '🔗' : '🔗⚠️'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-2 border-t border-slate-100 dark:border-slate-800 select-none">
          {t('tables.dropHere')}
        </p>
      )}
    </div>
  );
}
