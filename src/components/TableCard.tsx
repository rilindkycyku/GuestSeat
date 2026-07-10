import { useDroppable } from '@dnd-kit/core';
import type { Guest, Table, TableSide } from '../types';
import { GuestChip } from './GuestChip';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';

interface TableCardProps {
  table: Table;
  guests: Guest[];
  matchedIds: Set<string> | null;
  linkBadges: Map<string, { status: 'together' | 'apart'; title: string }>;
  highlighted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
}

const SIDE_STYLES: Record<TableSide, string> = {
  groom: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300',
  bride: 'bg-pink-100 text-pink-700 dark:bg-pink-950/50 dark:text-pink-300',
};

export function TableCard({
  table,
  guests,
  matchedIds,
  linkBadges,
  highlighted,
  collapsed,
  onToggleCollapse,
  onUpdateTable,
  onRemoveTable,
  onGuestClick,
}: TableCardProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: table.id });
  const displayName = tableDisplayName(table, t);
  const isFull = guests.length >= table.capacity;
  const isOverCapacity = guests.length > table.capacity;

  const setSide = (side: TableSide | undefined) => {
    onUpdateTable({ side });
  };

  return (
    <div
      ref={setNodeRef}
      data-testid="table-card"
      data-table-id={table.id}
      data-table-side={table.side ?? ''}
      className={`flex flex-col rounded-2xl border-2 p-3 transition-colors bg-white dark:bg-slate-900 scroll-mt-24 ${
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
              <span
                className={`text-xs font-medium ${isOverCapacity ? 'text-red-500' : isFull ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
              >
                {t('tables.seats', { seated: guests.length, capacity: table.capacity })}
              </span>
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
            </div>
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onUpdateTable({ capacity: Math.max(1, table.capacity - 1) })}
            className="w-7 h-7 sm:w-6 sm:h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            title={t('tables.decreaseCapacity')}
          >
            −
          </button>
          <button
            onClick={() => onUpdateTable({ capacity: table.capacity + 1 })}
            className="w-7 h-7 sm:w-6 sm:h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
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
          {guests.map((g) => (
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
