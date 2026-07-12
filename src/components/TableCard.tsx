import { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Guest, Table, TableSide, TableTag } from '../types';
import { GuestChip } from './GuestChip';
import { TableTagPicker } from './TableTagPicker';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { groupLinkedWithin } from '../lib/linkGroups';
import { TAG_COLORS } from '../lib/tagColors';

interface TableCardProps {
  table: Table;
  guests: Guest[];
  tags: TableTag[];
  matchedIds: Set<string> | null;
  linkBadges: Map<string, { status: 'together' | 'apart'; title: string }>;
  highlighted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
  onToggleTag: (tagId: string) => void;
  onCreateTag: (label: string) => void;
}

const SIDE_STYLES: Record<TableSide, string> = {
  groom: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  bride: 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
};

export function TableCard({
  table,
  guests,
  tags,
  matchedIds,
  linkBadges,
  highlighted,
  collapsed,
  onToggleCollapse,
  onUpdateTable,
  onRemoveTable,
  onGuestClick,
  onToggleTag,
  onCreateTag,
}: TableCardProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: table.id });
  const displayName = tableDisplayName(table, t);
  const isFull = guests.length >= table.capacity;
  const isOverCapacity = guests.length > table.capacity;
  const guestGroups = useMemo(() => groupLinkedWithin(guests), [guests]);
  const assignedTags = useMemo(() => tags.filter((tag) => table.tagIds?.includes(tag.id)), [tags, table.tagIds]);

  const setSide = (side: TableSide | undefined) => {
    onUpdateTable({ side });
  };

  const editCapacity = () => {
    const input = window.prompt(t('tables.capacityPrompt'), String(table.capacity));
    if (input === null) return;
    const n = parseInt(input, 10);
    if (Number.isFinite(n) && n >= 1) onUpdateTable({ capacity: n });
  };

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
            ? 'border-amber-400 ring-2 ring-amber-200 dark:ring-amber-900 bg-amber-50/50 dark:bg-amber-950/20'
            : isOverCapacity
              ? 'border-red-300 dark:border-red-800'
              : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onToggleCollapse}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onToggleCollapse();
            }
          }}
          className="flex items-start gap-1.5 min-w-0 flex-1 text-left cursor-pointer"
          title={collapsed ? t('tables.expandTable') : t('tables.collapseTable')}
        >
          <span
            className={`text-slate-400 text-xs mt-1 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            ▾
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800 dark:text-white truncate">{displayName}</span>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  editCapacity();
                }}
                title={t('tables.editCapacity')}
                className={`text-xs font-medium rounded px-1 -mx-1 hover:bg-slate-100 dark:hover:bg-slate-800 ${isOverCapacity ? 'text-red-500' : isFull ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
              >
                {t('tables.seats', { seated: guests.length, capacity: table.capacity })}
              </button>
              <div
                className="flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
                title={t('tables.setSide')}
              >
                <button
                  onClick={() => setSide(table.side === 'groom' ? undefined : 'groom')}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
                    table.side === 'groom'
                      ? SIDE_STYLES.groom
                      : 'text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500'
                  }`}
                >
                  {t('tables.side.groom')}
                </button>
                <button
                  onClick={() => setSide(table.side === 'bride' ? undefined : 'bride')}
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${
                    table.side === 'bride'
                      ? SIDE_STYLES.bride
                      : 'text-slate-300 dark:text-slate-600 hover:text-slate-400 dark:hover:text-slate-500'
                  }`}
                >
                  {t('tables.side.bride')}
                </button>
              </div>
              <div className="flex items-center gap-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
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
                  tableTagIds={table.tagIds ?? []}
                  onToggle={onToggleTag}
                  onCreateTag={onCreateTag}
                />
              </div>
            </div>
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => {
              if (guests.length === 0 || confirm(t('tables.removeTableConfirm', { name: displayName }))) {
                onRemoveTable();
              }
            }}
            className="w-7 h-7 sm:w-6 sm:h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40"
            title={t('tables.removeTable')}
          >
            ✕
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="flex-1 space-y-1.5 min-h-[52px]">
          {guests.length === 0 && (
            <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-3 select-none">{t('tables.dropHere')}</p>
          )}
          {guestGroups.map((group) =>
            group.length > 1 ? (
              <div
                key={group[0].id}
                className="rounded-lg border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 p-1.5 space-y-1.5"
              >
                <div className="flex items-center gap-1 px-0.5 text-[10px] font-medium text-indigo-500 dark:text-indigo-400">
                  🔗 {t('guestEditor.linkedGuests')}
                </div>
                {group.map((g) => (
                  <GuestChip
                    key={g.id}
                    guest={g}
                    highlighted={matchedIds ? matchedIds.has(g.id) : false}
                    linkBadge={linkBadges.get(g.id)}
                    onClick={() => onGuestClick(g)}
                    compact
                  />
                ))}
              </div>
            ) : (
              <GuestChip
                key={group[0].id}
                guest={group[0]}
                highlighted={matchedIds ? matchedIds.has(group[0].id) : false}
                linkBadge={linkBadges.get(group[0].id)}
                onClick={() => onGuestClick(group[0])}
                compact
              />
            )
          )}
        </div>
      )}

      {collapsed && guests.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
          {guests
            .slice(0, 4)
            .map((g) => g.name)
            .join(', ')}
          {guests.length > 4 ? ` +${guests.length - 4}` : ''}
        </p>
      )}
    </div>
  );
}
