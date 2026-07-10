import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Guest, Table } from '../types';
import { GuestChip } from './GuestChip';
import { useLanguage } from '../hooks/useLanguage';

interface TableCardProps {
  table: Table;
  guests: Guest[];
  matchedIds: Set<string> | null;
  highlighted: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
}

export function TableCard({
  table,
  guests,
  matchedIds,
  highlighted,
  collapsed,
  onToggleCollapse,
  onUpdateTable,
  onRemoveTable,
  onGuestClick,
}: TableCardProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: table.id });
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(table.name);
  const isFull = guests.length >= table.capacity;
  const isOverCapacity = guests.length > table.capacity;

  const commitName = () => {
    const trimmed = nameDraft.trim();
    onUpdateTable({ name: trimmed || table.name });
    setEditingName(false);
  };

  return (
    <div
      ref={setNodeRef}
      data-testid="table-card"
      data-table-id={table.id}
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
        <button
          onClick={onToggleCollapse}
          className="flex items-start gap-1.5 min-w-0 flex-1 text-left"
          title={collapsed ? t('tables.expandTable') : t('tables.collapseTable')}
        >
          <span
            className={`text-slate-400 text-xs mt-1 shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`}
          >
            ▾
          </span>
          <span className="min-w-0 flex-1">
            {editingName ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitName}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitName();
                  if (e.key === 'Escape') {
                    setNameDraft(table.name);
                    setEditingName(false);
                  }
                }}
                className="w-full text-sm font-semibold bg-transparent border-b border-indigo-400 outline-none text-slate-800 dark:text-white"
              />
            ) : (
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingName(true);
                }}
                className="block text-sm font-semibold text-slate-800 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400"
                title={t('header.renameHint')}
              >
                {table.name}
              </span>
            )}
            <span
              className={`text-xs font-medium ${isOverCapacity ? 'text-red-500' : isFull ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
            >
              {t('tables.seats', { seated: guests.length, capacity: table.capacity })}
            </span>
          </span>
        </button>
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
              if (guests.length === 0 || confirm(t('tables.removeTableConfirm', { name: table.name }))) {
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
              onClick={() => onGuestClick(g)}
              compact
            />
          ))}
        </div>
      )}
    </div>
  );
}
