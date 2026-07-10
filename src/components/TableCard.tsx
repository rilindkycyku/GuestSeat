import { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import type { Guest, Table } from '../types';
import { GuestChip } from './GuestChip';

interface TableCardProps {
  table: Table;
  guests: Guest[];
  matchedIds: Set<string> | null;
  onUpdateTable: (patch: Partial<Table>) => void;
  onRemoveTable: () => void;
  onGuestClick: (guest: Guest) => void;
}

export function TableCard({ table, guests, matchedIds, onUpdateTable, onRemoveTable, onGuestClick }: TableCardProps) {
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
      className={`flex flex-col rounded-2xl border-2 p-3 transition-colors bg-white dark:bg-slate-900 ${
        isOver
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30'
          : isOverCapacity
            ? 'border-red-300 dark:border-red-800'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {editingName ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
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
            <button
              onClick={() => setEditingName(true)}
              className="text-sm font-semibold text-slate-800 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400 text-left"
              title="Click to rename"
            >
              {table.name}
            </button>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`text-xs font-medium ${isOverCapacity ? 'text-red-500' : isFull ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}
            >
              {guests.length}/{table.capacity} seats
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onUpdateTable({ capacity: Math.max(1, table.capacity - 1) })}
            className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            title="Decrease capacity"
          >
            −
          </button>
          <button
            onClick={() => onUpdateTable({ capacity: table.capacity + 1 })}
            className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
            title="Increase capacity"
          >
            +
          </button>
          <button
            onClick={() => {
              if (guests.length === 0 || confirm(`Remove ${table.name}? Seated guests will become unseated.`)) {
                onRemoveTable();
              }
            }}
            className="w-6 h-6 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40"
            title="Remove table"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-1.5 min-h-[52px]">
        {guests.length === 0 && (
          <p className="text-xs text-slate-300 dark:text-slate-600 text-center py-3 select-none">Drop guests here</p>
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
    </div>
  );
}
