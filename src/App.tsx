import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useEventState } from './hooks/useEventState';
import { useLanguage } from './hooks/useLanguage';
import { Onboarding } from './components/Onboarding';
import { UnseatedPanel } from './components/UnseatedPanel';
import { TableCard } from './components/TableCard';
import { GuestEditorModal } from './components/GuestEditorModal';
import { AddGuestModal } from './components/AddGuestModal';
import { ExportMenu } from './components/ExportMenu';
import { SettingsControls } from './components/SettingsControls';
import { ImportError, parseImportedJson } from './lib/importGuests';
import type { Guest, TableSide } from './types';

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
  const { t } = useLanguage();

  const [query, setQuery] = useState('');
  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [collapsedTableIds, setCollapsedTableIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [sideFilter, setSideFilter] = useState<'all' | TableSide>('all');
  const importInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  };

  const tableById = useMemo(() => new Map((state?.tables ?? []).map((tb) => [tb.id, tb])), [state]);

  const filteredTables = useMemo(() => {
    if (!state) return [];
    if (sideFilter === 'all') return state.tables;
    return state.tables.filter((tb) => tb.side === sideFilter);
  }, [state, sideFilter]);

  const visibleTableIds = useMemo(() => new Set(filteredTables.map((tb) => tb.id)), [filteredTables]);

  const sideCounts = useMemo(() => {
    const counts = { groom: 0, bride: 0 };
    for (const tb of state?.tables ?? []) {
      if (tb.side === 'groom') counts.groom += 1;
      else if (tb.side === 'bride') counts.bride += 1;
    }
    return counts;
  }, [state]);

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
      if (g.tableId && !visibleTableIds.has(g.tableId)) continue;
      const table = g.tableId ? tableById.get(g.tableId) : undefined;
      const haystack = `${g.name} ${g.surname ?? ''} ${table?.name ?? ''}`.toLowerCase();
      if (haystack.includes(q)) set.add(g.id);
    }
    return set;
  }, [state, query, tableById, visibleTableIds]);

  const matchedTableIds = useMemo(() => {
    if (!matchedIds || !state) return null;
    const set = new Set<string>();
    for (const g of state.guests) {
      if (g.tableId && matchedIds.has(g.id)) set.add(g.tableId);
    }
    return set;
  }, [matchedIds, state]);

  const isSearching = query.trim().length > 0;

  useEffect(() => {
    if (!matchedTableIds || matchedTableIds.size === 0) return;
    const firstMatch = state?.tables.find((tb) => matchedTableIds.has(tb.id));
    if (!firstMatch) return;
    const el = document.querySelector(`[data-table-id="${firstMatch.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchedTableIds, state?.tables]);

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
      const { guests, tables, eventName } = parseImportedJson(json, t('tables.namePrefix'));
      if (mode === 'replace') {
        loadFromImport(guests, tables, eventName ?? t('header.defaultEventName'));
        showToast(t('import.loaded', { count: guests.length }));
      } else {
        mergeFromImport(guests, tables);
        showToast(t('import.importedMore', { count: guests.length }));
      }
    } catch (err) {
      if (err instanceof ImportError) showToast(t(`import.errors.${err.code}`));
      else if (err instanceof SyntaxError) showToast(t('import.errors.SYNTAX_ERROR'));
      else showToast(t('import.errors.READ_FAILED'));
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
          showToast(t('tables.tableFull', { name: table.name, capacity: table.capacity }));
          return;
        }
      }
    }
    seatGuest(guestId, targetTableId);
  };

  if (!state) {
    return (
      <Onboarding onImported={(guests, tables, name) => loadFromImport(guests, tables, name)} />
    );
  }

  const totalGuests = state.guests.length;
  const totalSeated = state.guests.filter((g) => g.tableId).length;

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xl shrink-0">🪑</span>
            <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-initial">
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
                  className="font-bold text-base sm:text-lg bg-transparent border-b border-indigo-400 outline-none text-slate-900 dark:text-white min-w-0"
                />
              ) : (
                <button
                  onClick={() => setNameDraft(state.eventName)}
                  className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400"
                  title={t('header.renameHint')}
                >
                  {state.eventName}
                </button>
              )}
              <span className="text-[11px] sm:text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">
                {totalSeated}/{totalGuests}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => setAddingGuest(true)}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.addGuest')}
              </button>
              <button
                onClick={() => addTable(t('tables.namePrefix'))}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.addTable')}
              </button>
              <button
                onClick={() => importInputRef.current?.click()}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.import')}
              </button>
              <ExportMenu state={state} />
              <button
                onClick={() => {
                  if (confirm(t('header.resetConfirm'))) resetAll();
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                {t('header.reset')}
              </button>
              <SettingsControls />
            </div>

            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="sm:hidden ml-auto w-9 h-9 shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
              aria-label={t('header.menu')}
            >
              {menuOpen ? '✕' : '☰'}
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
          </div>

          <div className="relative mt-2.5">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('header.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-8 pr-10 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            {query && matchedIds && (
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                {matchedIds.size}
              </span>
            )}
          </div>

          {menuOpen && (
            <div className="sm:hidden mt-2.5 grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setAddingGuest(true);
                  setMenuOpen(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.addGuest')}
              </button>
              <button
                onClick={() => {
                  addTable(t('tables.namePrefix'));
                  setMenuOpen(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.addTable')}
              </button>
              <button
                onClick={() => {
                  importInputRef.current?.click();
                  setMenuOpen(false);
                }}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                {t('header.import')}
              </button>
              <ExportMenu state={state} fullWidth />
              <button
                onClick={() => {
                  if (confirm(t('header.resetConfirm'))) resetAll();
                  setMenuOpen(false);
                }}
                className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                {t('header.reset')}
              </button>
              <SettingsControls className="col-span-1 justify-center" />
            </div>
          )}
        </header>

        <main className="flex-1 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
            <UnseatedPanel guests={unseatedGuests} matchedIds={matchedIds} onGuestClick={setEditingGuest} />
          </div>

          <div className="min-w-0 w-full">
            {state.tables.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setSideFilter('all')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      sideFilter === 'all'
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tables.filter.all')}
                  </button>
                  <button
                    onClick={() => setSideFilter('groom')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      sideFilter === 'groom'
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tables.filter.groom')} ({sideCounts.groom})
                  </button>
                  <button
                    onClick={() => setSideFilter('bride')}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      sideFilter === 'bride'
                        ? 'bg-pink-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tables.filter.bride')} ({sideCounts.bride})
                  </button>
                </div>
                {!isSearching && filteredTables.length > 0 && (
                  <button
                    onClick={() =>
                      setCollapsedTableIds((prev) =>
                        filteredTables.every((tb) => prev.has(tb.id))
                          ? new Set([...prev].filter((id) => !visibleTableIds.has(id)))
                          : new Set([...prev, ...filteredTables.map((tb) => tb.id)])
                      )
                    }
                    className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    {filteredTables.every((tb) => collapsedTableIds.has(tb.id))
                      ? t('tables.expandAll')
                      : t('tables.collapseAll')}
                  </button>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
              {state.tables.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
                  <p className="mb-3">{t('tables.noTablesYet')}</p>
                  <button
                    onClick={() => addTable(t('tables.namePrefix'))}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500"
                  >
                    {t('tables.createFirst')}
                  </button>
                </div>
              )}
              {state.tables.length > 0 && filteredTables.length === 0 && (
                <div className="sm:col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
                  <p>{t('tables.noTablesForFilter')}</p>
                </div>
              )}
              {filteredTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  guests={guestsByTable.get(table.id) ?? []}
                  matchedIds={matchedIds}
                  highlighted={matchedTableIds ? matchedTableIds.has(table.id) : false}
                  collapsed={isSearching ? !matchedTableIds?.has(table.id) : collapsedTableIds.has(table.id)}
                  onToggleCollapse={() => {
                    if (isSearching) return;
                    setCollapsedTableIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(table.id)) next.delete(table.id);
                      else next.add(table.id);
                      return next;
                    });
                  }}
                  onUpdateTable={(patch) => updateTable(table.id, patch)}
                  onRemoveTable={() => removeTable(table.id)}
                  onGuestClick={setEditingGuest}
                />
              ))}
            </div>
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
