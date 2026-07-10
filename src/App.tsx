import { useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useEventState } from './hooks/useEventState';
import { Onboarding } from './components/Onboarding';
import { UnseatedPanel } from './components/UnseatedPanel';
import { TableCard } from './components/TableCard';
import { GuestEditorModal } from './components/GuestEditorModal';
import { AddGuestModal } from './components/AddGuestModal';
import { ExportMenu } from './components/ExportMenu';
import { ImportError, parseImportedJson } from './lib/importGuests';
import type { Guest } from './types';

export default function App() {
  const {
    state,
    loadFromImport,
    mergeFromImport,
    resetAll,
    setEventName,
    addTable,
    updateTable,
    removeTable,
    seatGuest,
    addGuest,
    updateGuest,
    removeGuest,
  } = useEventState();

  const [query, setQuery] = useState('');
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const tableById = useMemo(() => new Map((state?.tables ?? []).map((t) => [t.id, t])), [state]);

  const seatedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of state?.guests ?? []) {
      if (g.tableId) m.set(g.tableId, (m.get(g.tableId) ?? 0) + 1);
    }
    return m;
  }, [state]);

  const matchedIds = useMemo(() => {
    if (!state) return null;
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const set = new Set<string>();
    for (const g of state.guests) {
      const table = g.tableId ? tableById.get(g.tableId) : undefined;
      const haystack = `${g.name} ${g.surname ?? ''} ${table?.name ?? ''}`.toLowerCase();
      if (haystack.includes(q)) set.add(g.id);
    }
    return set;
  }, [state, query, tableById]);

  const guestsByTable = useMemo(() => {
    const m = new Map<string, Guest[]>();
    for (const g of state?.guests ?? []) {
      if (!g.tableId) continue;
      const list = m.get(g.tableId) ?? [];
      list.push(g);
      m.set(g.tableId, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return m;
  }, [state]);

  const unseatedGuests = useMemo(() => {
    const list = (state?.guests ?? []).filter((g) => !g.tableId);
    const filtered = matchedIds ? list.filter((g) => matchedIds.has(g.id)) : list;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [state, matchedIds]);

  const handleImportFile = async (file: File, mode: 'replace' | 'merge') => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const { guests, tables, eventName } = parseImportedJson(json);
      if (mode === 'replace') {
        loadFromImport(guests, tables, eventName);
        showToast(`Loaded ${guests.length} guests.`);
      } else {
        mergeFromImport(guests);
        showToast(`Imported ${guests.length} more guests.`);
      }
    } catch (err) {
      if (err instanceof ImportError) showToast(err.message);
      else if (err instanceof SyntaxError) showToast('That file is not valid JSON.');
      else showToast('Could not read that file.');
    }
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const guestId = String(active.id);
    const dropId = String(over.id);
    const targetTableId = dropId === 'unseated' ? null : dropId;
    if (targetTableId) {
      const table = tableById.get(targetTableId);
      const guest = state?.guests.find((g) => g.id === guestId);
      if (table && guest && guest.tableId !== table.id) {
        const currentCount = seatedCount.get(table.id) ?? 0;
        if (currentCount >= table.capacity) {
          showToast(`${table.name} is full (${table.capacity}/${table.capacity}).`);
          return;
        }
      }
    }
    seatGuest(guestId, targetTableId);
  };

  if (!state) {
    return <Onboarding onImported={(g, t, name) => loadFromImport(g, t, name)} />;
  }

  const totalGuests = state.guests.length;
  const totalSeated = state.guests.filter((g) => g.tableId).length;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl">🪑</span>
              {nameDraft !== null ? (
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => {
                    setEventName(nameDraft.trim() || state.eventName);
                    setNameDraft(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                  className="font-bold text-lg bg-transparent border-b border-indigo-400 outline-none text-slate-900 dark:text-white min-w-0"
                />
              ) : (
                <button
                  onClick={() => setNameDraft(state.eventName)}
                  className="font-bold text-lg text-slate-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400"
                  title="Click to rename"
                >
                  {state.eventName}
                </button>
              )}
              <span className="hidden sm:inline text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">
                {totalSeated}/{totalGuests} seated
              </span>
            </div>

            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, surname, or table…"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-8 pr-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              {query && matchedIds && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                  {matchedIds.size}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => setAddingGuest(true)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                + Guest
              </button>
              <button
                onClick={() => addTable()}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                + Table
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file, 'merge');
                  e.target.value = '';
                }}
              />
              <ExportMenu state={state} />
              <button
                onClick={() => {
                  if (confirm('Clear all guests and tables? This cannot be undone.')) resetAll();
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Reset
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
            <UnseatedPanel guests={unseatedGuests} matchedIds={matchedIds} onGuestClick={setEditingGuest} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {state.tables.length === 0 && (
              <div className="sm:col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
                <p className="mb-3">No tables yet.</p>
                <button
                  onClick={() => addTable()}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                >
                  Create your first table
                </button>
              </div>
            )}
            {state.tables.map((table) => (
              <TableCard
                key={table.id}
                table={table}
                guests={guestsByTable.get(table.id) ?? []}
                matchedIds={matchedIds}
                onUpdateTable={(patch) => updateTable(table.id, patch)}
                onRemoveTable={() => removeTable(table.id)}
                onGuestClick={setEditingGuest}
              />
            ))}
          </div>
        </main>
      </div>

      {editingGuest && (
        <GuestEditorModal
          guest={editingGuest}
          tables={state.tables}
          seatedCount={seatedCount}
          onSave={(patch) => updateGuest(editingGuest.id, patch)}
          onDelete={() => removeGuest(editingGuest.id)}
          onClose={() => setEditingGuest(null)}
        />
      )}

      {addingGuest && <AddGuestModal onAdd={addGuest} onClose={() => setAddingGuest(false)} />}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </DndContext>
  );
}
