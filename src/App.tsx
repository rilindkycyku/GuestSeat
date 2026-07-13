import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Analytics } from '@vercel/analytics/react';
import { useEventState } from './hooks/useEventState';
import { useLanguage } from './hooks/useLanguage';
import { Onboarding } from './components/Onboarding';
import { UnseatedPanel } from './components/UnseatedPanel';
import { TableCard } from './components/TableCard';
import { FloorTable } from './components/FloorTable';
import { GuestEditorModal } from './components/GuestEditorModal';
import { AddGuestModal } from './components/AddGuestModal';
import { ExportMenu } from './components/ExportMenu';
import { SettingsModal } from './components/SettingsModal';
import { StatsModal } from './components/StatsModal';
import { CheckInScreen } from './components/CheckInScreen';
import { InvitationModal } from './components/InvitationModal';
import { EventDetailsModal } from './components/EventDetailsModal';
import { QrModal } from './components/QrModal';
import { CapacityModal } from './components/CapacityModal';
import { ConfirmModal, type ConfirmOptions } from './components/ConfirmModal';
import { ImportError, parseImportedJson } from './lib/importGuests';
import { parseImportedCsv } from './lib/importCsv';
import {
  loadCollapsedTableIds,
  saveCollapsedTableIds,
  loadViewMode,
  saveViewMode,
  loadTableColumns,
  saveTableColumns,
  type ViewMode,
  type TableColumns,
} from './lib/storage';
import { getDemoEventState } from './lib/demoEvent';
import { autoSeat } from './lib/autoSeat';
import { clearShareParam, decodeSharedState, readShareParam } from './lib/shareLink';
import { tableDisplayName } from './lib/tableDisplay';
import { tagColorClasses } from './lib/tagColors';
import type { EventState, Guest, Table, TableSide, TableTag } from './types';

/** A table-list filter: everything, or one tag (Groom/Bride are system tags too). */
type TableFilter = { kind: 'all' } | { kind: 'tag'; tagId: string };

export default function App() {
  const {
    state,
    loadFromImport,
    mergeFromImport,
    loadSharedState,
    restoreSnapshot,
    resetAll,
    setEventName,
    updateEventDetails,
    addTable,
    updateTable,
    removeTable,
    seatGuest,
    assignSeats,
    toggleArrived,
    resetArrivals,
    addGuest,
    updateGuest,
    removeGuest,
    linkGuests,
    unlinkGuests,
    setAllRsvp,
    unseatAll,
    addTag,
    updateTag,
    removeTag,
    toggleTableTag,
    toggleGuestTag,
  } = useEventState();
  const { t } = useLanguage();

  const [query, setQuery] = useState('');
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [toast, setToast] = useState<{ msg: string; action?: { label: string; onClick: () => void } } | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [collapsedTableIds, setCollapsedTableIds] = useState<Set<string>>(() => loadCollapsedTableIds());
  const [menuOpen, setMenuOpen] = useState(false);
  const [tableFilter, setTableFilter] = useState<TableFilter>({ kind: 'all' });
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [tableColumns, setTableColumns] = useState<TableColumns>(() => loadTableColumns());
  const [capacityTableId, setCapacityTableId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: "/" or ⌘/Ctrl-K jumps to search from anywhere (skipped while typing in a
  // field or with a modal open), so planning a large list stays hands-on-keyboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (cmdK || (e.key === '/' && !typing)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    saveCollapsedTableIds(collapsedTableIds);
  }, [collapsedTableIds]);

  useEffect(() => {
    saveViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    saveTableColumns(tableColumns);
  }, [tableColumns]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const toastTimer = useRef<number | undefined>(undefined);
  const showToast = (msg: string, action?: { label: string; onClick: () => void }) => {
    window.clearTimeout(toastTimer.current);
    setToast({ msg, action });
    // Give people longer to reach for an Undo than for a plain confirmation.
    toastTimer.current = window.setTimeout(() => setToast(null), action ? 6000 : 3000);
  };

  // A destructive action + an "Undo" that rewinds to the snapshot captured just before it.
  const runWithUndo = (snapshot: EventState | null, act: () => void, msg: string) => {
    act();
    showToast(msg, snapshot ? { label: t('common.undo'), onClick: () => restoreSnapshot(snapshot) } : undefined);
  };

  const tableById = useMemo(() => new Map((state?.tables ?? []).map((tb) => [tb.id, tb])), [state]);

  const guestById = useMemo(() => new Map((state?.guests ?? []).map((g) => [g.id, g])), [state]);

  const editingGuest = editingGuestId ? (guestById.get(editingGuestId) ?? null) : null;

  const capacityTable = capacityTableId ? (tableById.get(capacityTableId) ?? null) : null;

  const linkBadges = useMemo(() => {
    const map = new Map<string, { status: 'together' | 'apart'; title: string }>();
    if (!state) return map;
    for (const g of state.guests) {
      if (!g.linkedGuestIds?.length) continue;
      const partners = g.linkedGuestIds.map((id) => guestById.get(id)).filter((p): p is Guest => !!p);
      if (partners.length === 0) continue;
      const together = g.tableId != null && partners.every((p) => p.tableId === g.tableId);
      const names = partners.map((p) => (p.surname ? `${p.name} ${p.surname}` : p.name)).join(', ');
      map.set(g.id, {
        status: together ? 'together' : 'apart',
        title: `${t('guestEditor.linkedGuests')}: ${names}`,
      });
    }
    return map;
  }, [state, guestById, t]);

  const customTags = useMemo(() => state?.tags ?? [], [state]);

  // Groom & Bride are always-present, non-removable "system" tags backed by the table's
  // single `side` field; custom tags live in state.tags. Both show up in the same lists.
  const systemTags: TableTag[] = useMemo(
    () => [
      { id: 'groom', label: t('tables.side.groom'), color: 'sky' },
      { id: 'bride', label: t('tables.side.bride'), color: 'rose' },
    ],
    [t]
  );

  const allTags = useMemo(() => [...systemTags, ...customTags], [systemTags, customTags]);

  // The tag ids applied to a table, merging the wedding side with its custom tags.
  const assignedIdsFor = useCallback((tb: Table) => [...(tb.side ? [tb.side] : []), ...(tb.tagIds ?? [])], []);

  // The set of guest-level tag ids present at each table, so a tag applied only to guests
  // (e.g. "Bride's family" on a shared long table) still counts and filters that table in.
  const guestTagIdsByTable = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const g of state?.guests ?? []) {
      if (!g.tableId || !g.tagIds?.length) continue;
      const set = m.get(g.tableId) ?? new Set<string>();
      for (const id of g.tagIds) set.add(id);
      m.set(g.tableId, set);
    }
    return m;
  }, [state]);

  const tableHasTag = useCallback(
    (tb: Table, id: string) => tb.side === id || tb.tagIds?.includes(id) || guestTagIdsByTable.get(tb.id)?.has(id),
    [guestTagIdsByTable]
  );

  const filteredTables = useMemo(() => {
    if (!state) return [];
    if (tableFilter.kind === 'all') return state.tables;
    const id = tableFilter.tagId;
    return state.tables.filter((tb) => tableHasTag(tb, id));
  }, [state, tableFilter, tableHasTag]);

  const visibleTableIds = useMemo(() => new Set(filteredTables.map((tb) => tb.id)), [filteredTables]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tb of state?.tables ?? []) {
      if (tb.side) counts.set(tb.side, (counts.get(tb.side) ?? 0) + 1);
      // Union of table-level tags and any guest tags at the table, so each tag counts a table once.
      const ids = new Set([...(tb.tagIds ?? []), ...(guestTagIdsByTable.get(tb.id) ?? [])]);
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [state, guestTagIdsByTable]);

  // Toggle a tag on a table. Groom/Bride map to the mutually-exclusive `side`; custom tags stack.
  const toggleTag = useCallback(
    (tableId: string, tagId: string) => {
      if (tagId === 'groom' || tagId === 'bride') {
        const current = state?.tables.find((tb) => tb.id === tableId)?.side;
        updateTable(tableId, { side: current === tagId ? undefined : (tagId as TableSide) });
      } else {
        toggleTableTag(tableId, tagId);
      }
    },
    [state, updateTable, toggleTableTag]
  );

  // Create a custom tag and immediately apply it to the table the user is tagging.
  const createTagForTable = useCallback(
    (tableId: string, label: string) => {
      const id = addTag(label);
      toggleTableTag(tableId, id);
    },
    [addTag, toggleTableTag]
  );

  // Create a custom tag and immediately apply it to the guest being edited.
  const createTagForGuest = useCallback(
    (guestId: string, label: string) => {
      const id = addTag(label);
      toggleGuestTag(guestId, id);
    },
    [addTag, toggleGuestTag]
  );

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
    const isVisible = (g: Guest) => !g.tableId || visibleTableIds.has(g.tableId);
    const set = new Set<string>();
    for (const g of state.guests) {
      if (!isVisible(g)) continue;
      const table = g.tableId ? tableById.get(g.tableId) : undefined;
      const haystack = `${g.name} ${g.surname ?? ''} ${table ? tableDisplayName(table, t) : ''}`.toLowerCase();
      if (haystack.includes(q)) set.add(g.id);
    }
    // Also surface linked partners of any direct match, so connected guests always show together.
    for (const id of [...set]) {
      for (const linkedId of guestById.get(id)?.linkedGuestIds ?? []) {
        const linked = guestById.get(linkedId);
        if (linked && isVisible(linked)) set.add(linkedId);
      }
    }
    return set;
  }, [state, query, tableById, visibleTableIds, t, guestById]);

  const matchedTableIds = useMemo(() => {
    if (!matchedIds || !state) return null;
    const set = new Set<string>();
    for (const g of state.guests) {
      if (g.tableId && matchedIds.has(g.id)) set.add(g.tableId);
    }
    return set;
  }, [matchedIds, state]);

  const isSearching = query.trim().length > 0;

  const tablesToRender = useMemo(() => {
    if (!isSearching || !matchedTableIds) return filteredTables;
    return filteredTables.filter((tb) => matchedTableIds.has(tb.id));
  }, [filteredTables, isSearching, matchedTableIds]);

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
      const { guests, tables, eventName } = file.name.toLowerCase().endsWith('.csv')
        ? parseImportedCsv(text)
        : parseImportedJson(JSON.parse(text), t('tables.namePrefix'));
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

  const trySeatGuest = (guestId: string, targetTableId: string | null) => {
    if (targetTableId) {
      const table = tableById.get(targetTableId);
      const guest = guestById.get(guestId);
      if (table && guest && guest.tableId !== table.id) {
        const currentCount = seatedCount.get(table.id) ?? 0;
        if (currentCount >= table.capacity) {
          showToast(t('tables.tableFull', { name: tableDisplayName(table, t), capacity: table.capacity }));
          return;
        }
      }
    }
    seatGuest(guestId, targetTableId);
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const guestId = String(active.id);
    const dropId = String(over.id);
    trySeatGuest(guestId, dropId === 'unseated' ? null : dropId);
  };

  const handleLinkGuests = (guestIdA: string, guestIdB: string) => {
    linkGuests(guestIdA, guestIdB);
    const a = guestById.get(guestIdA);
    const b = guestById.get(guestIdB);
    if (a && b) {
      if (a.tableId == null && b.tableId != null) trySeatGuest(a.id, b.tableId);
      else if (b.tableId == null && a.tableId != null) trySeatGuest(b.id, a.tableId);
    }
  };

  const guestCount = state?.guests.length ?? 0;

  const askConfirm = (opts: ConfirmOptions) => setConfirmState(opts);

  // On first load, detect a shared list in the URL (#s=...) and offer to load it — this is how
  // a guest list arrives via a share link instead of a manually imported JSON file.
  const sharedHandledRef = useRef(false);
  useEffect(() => {
    if (sharedHandledRef.current) return;
    const param = readShareParam();
    if (!param) return;
    sharedHandledRef.current = true;
    let cancelled = false;
    void decodeSharedState(param).then((shared) => {
      if (cancelled) return;
      clearShareParam();
      if (!shared) {
        showToast(t('share.invalid'));
        return;
      }
      askConfirm({
        message: t('share.receivedConfirm', { name: shared.eventName, count: shared.guests.length }),
        confirmLabel: t('share.load'),
        onConfirm: () => {
          loadSharedState(shared);
          showToast(t('share.loaded', { count: shared.guests.length }));
        },
      });
    });
    return () => {
      cancelled = true;
    };
    // Runs once on mount; the ref guards against React StrictMode's double-invoke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMarkAllComing = () => {
    askConfirm({
      message: t('settings.markAllComingConfirm', { count: guestCount }),
      confirmLabel: t('settings.markAllComing'),
      onConfirm: () => {
        const snapshot = state;
        runWithUndo(snapshot, () => setAllRsvp('confirmed'), t('settings.markedAllComing'));
      },
    });
  };

  const handleMarkAllPending = () => {
    askConfirm({
      message: t('settings.markAllPendingConfirm', { count: guestCount }),
      confirmLabel: t('settings.markAllPending'),
      onConfirm: () => {
        const snapshot = state;
        runWithUndo(snapshot, () => setAllRsvp(undefined), t('settings.markedAllPending'));
      },
    });
  };

  const handleUnseatAll = () => {
    askConfirm({
      message: t('settings.unseatAllConfirm'),
      confirmLabel: t('settings.unseatAll'),
      danger: true,
      onConfirm: () => {
        const snapshot = state;
        runWithUndo(snapshot, () => unseatAll(), t('settings.unseatedAll'));
      },
    });
  };

  const handleReset = () => {
    const snapshot = state;
    askConfirm({
      message: t('header.resetConfirm'),
      confirmLabel: t('settings.resetData'),
      danger: true,
      onConfirm: () => {
        resetAll();
        setSettingsOpen(false);
        showToast(
          t('settings.resetData'),
          snapshot ? { label: t('common.undo'), onClick: () => restoreSnapshot(snapshot) } : undefined
        );
      },
    });
  };

  // Auto-seat: fill tables from the unseated pool in one undoable step, reporting how it went.
  const handleAutoSeat = () => {
    if (!state) return;
    const unseatedComing = state.guests.filter((g) => !g.tableId && g.rsvp !== 'declined').length;
    if (unseatedComing === 0) {
      showToast(t('autoSeat.noneToSeat'));
      return;
    }
    const snapshot = state;
    const { assignments, seated, leftUnseated } = autoSeat(state);
    if (seated === 0) {
      showToast(t('autoSeat.noRoom'));
      return;
    }
    assignSeats(assignments);
    const msg =
      leftUnseated > 0 ? t('autoSeat.someLeft', { count: seated, left: leftUnseated }) : t('autoSeat.seated', { count: seated });
    showToast(msg, { label: t('common.undo'), onClick: () => restoreSnapshot(snapshot) });
  };

  const handleResetArrivals = () => {
    askConfirm({
      message: t('checkin.resetConfirm'),
      confirmLabel: t('checkin.reset'),
      danger: true,
      onConfirm: () => resetArrivals(),
    });
  };

  // Remove a table, confirming first only when it still has seated guests.
  const handleRemoveTable = (tableId: string) => {
    const table = tableById.get(tableId);
    const occupied = (seatedCount.get(tableId) ?? 0) > 0;
    if (!table || !occupied) {
      removeTable(tableId);
      return;
    }
    askConfirm({
      message: t('tables.removeTableConfirm', { name: tableDisplayName(table, t) }),
      confirmLabel: t('tables.removeTable'),
      danger: true,
      onConfirm: () => removeTable(tableId),
    });
  };

  // A single toast that optionally carries an Undo button; reused by both the onboarding and
  // main screens so an undo after "Reset" (which drops back to onboarding) is still reachable.
  const toastNode = toast && (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium pl-4 pr-2 py-2 rounded-xl shadow-lg z-50 max-w-[calc(100vw-2rem)]">
      <span className="truncate">{toast.msg}</span>
      {toast.action && (
        <button
          onClick={() => {
            toast.action?.onClick();
            setToast(null);
          }}
          className="shrink-0 rounded-lg bg-white/15 dark:bg-slate-900/10 hover:bg-white/25 dark:hover:bg-slate-900/20 px-2.5 py-1 text-indigo-300 dark:text-indigo-600 font-semibold"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );

  if (!state) {
    // A shared list arriving via a QR/share link decodes into a confirm prompt even before any
    // event exists, so the ConfirmModal and toast must render here too — otherwise the prompt is
    // set but never shown until the user loads something (e.g. the demo) that reveals the main UI.
    return (
      <>
        <Onboarding
          onImported={(guests, tables, name) => loadFromImport(guests, tables, name)}
          onLoadDemo={() => loadSharedState(getDemoEventState())}
          onStartBlank={() => loadFromImport([], [], t('header.defaultEventName'))}
        />
        {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
        {toastNode}
      </>
    );
  }

  const totalGuests = state.guests.length;
  const totalSeated = state.guests.filter((g) => g.tableId).length;
  const confirmedCount = state.guests.filter((g) => g.rsvp === 'confirmed').length;
  const declinedCount = state.guests.filter((g) => g.rsvp === 'declined').length;

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
              {(confirmedCount > 0 || declinedCount > 0) && (
                <span
                  className="hidden sm:inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium shrink-0"
                  title={t('rsvp.label')}
                >
                  <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {confirmedCount}
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-red-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    {declinedCount}
                  </span>
                </span>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 ml-auto flex-wrap">
              <button
                onClick={() => setAddingGuest(true)}
                className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 shadow-sm shadow-indigo-600/20"
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
              <ExportMenu
                state={state}
                onToast={showToast}
                onShowInvitation={() => setInvitationOpen(true)}
                onShowQr={() => setQrOpen(true)}
              />
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
                title={t('settings.title')}
                aria-label={t('settings.title')}
              >
                ⚙️
              </button>
            </div>

            <div className="sm:hidden ml-auto flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                aria-label={t('settings.title')}
              >
                ⚙️
              </button>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 flex items-center justify-center"
                aria-label={t('header.menu')}
              >
                {menuOpen ? '✕' : '☰'}
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json,text/csv,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImportFile(file, 'replace');
                e.target.value = '';
              }}
            />
          </div>

          <div className="relative mt-2.5">
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // Escape clears a query, or blurs the empty field so focus returns to the board.
                if (e.key === 'Escape') {
                  if (query) setQuery('');
                  else (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={t('header.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-8 pr-16 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
            {!query && (
              <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-400 pointer-events-none select-none">
                /
              </kbd>
            )}
            {query && (
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {matchedIds && <span className="text-xs text-slate-400 tabular-nums">{matchedIds.size}</span>}
                <button
                  onClick={() => setQuery('')}
                  aria-label={t('header.clearSearch')}
                  title={t('header.clearSearch')}
                  className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-xs"
                >
                  ✕
                </button>
              </div>
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
              <ExportMenu
                state={state}
                fullWidth
                onToast={showToast}
                onShowInvitation={() => {
                  setInvitationOpen(true);
                  setMenuOpen(false);
                }}
                onShowQr={() => {
                  setQrOpen(true);
                  setMenuOpen(false);
                }}
              />
            </div>
          )}

          {/* Slim seating-progress bar pinned to the header's bottom edge — an at-a-glance sense
              of how far along the arrangement is without reading the count. */}
          {totalGuests > 0 && (
            <div
              className="mt-2.5 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
              role="progressbar"
              aria-valuenow={totalSeated}
              aria-valuemin={0}
              aria-valuemax={totalGuests}
              aria-label={t('header.seatedProgress', { seated: totalSeated, total: totalGuests })}
              title={t('header.seatedProgress', { seated: totalSeated, total: totalGuests })}
            >
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${Math.round((totalSeated / totalGuests) * 100)}%` }}
              />
            </div>
          )}
        </header>

        <main className="flex-1 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
            <UnseatedPanel
              guests={unseatedGuests}
              matchedIds={matchedIds}
              linkBadges={linkBadges}
              tags={customTags}
              onGuestClick={(g) => setEditingGuestId(g.id)}
              onAutoSeat={handleAutoSeat}
            />
          </div>

          <div className="min-w-0 w-full">
            {state.tables.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setTableFilter({ kind: 'all' })}
                    className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                      tableFilter.kind === 'all'
                        ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {t('tables.filter.all')}
                  </button>
                  {allTags.map((tag) => {
                    const active = tableFilter.kind === 'tag' && tableFilter.tagId === tag.id;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => setTableFilter({ kind: 'tag', tagId: tag.id })}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full transition-colors ${
                          active
                            ? tagColorClasses(tag.color).chip + ' ring-1 ring-inset ring-current'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${tagColorClasses(tag.color).dot}`} />
                        {tag.label} ({tagCounts.get(tag.id) ?? 0})
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  {!isSearching && viewMode === 'list' && filteredTables.length > 0 && (
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
                  <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                    <button
                      onClick={() => setViewMode('list')}
                      title={t('settings.viewList')}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'list'
                          ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      ☰
                    </button>
                    <button
                      onClick={() => setViewMode('floor')}
                      title={t('settings.viewFloor')}
                      className={`px-2 py-1 rounded-md text-xs font-medium transition-colors ${
                        viewMode === 'floor'
                          ? 'bg-white dark:bg-slate-600 text-slate-800 dark:text-white shadow-sm'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      ◯
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div
              className={`grid gap-2 sm:gap-4 ${
                tableColumns === 1 ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 xl:grid-cols-3'
              }`}
            >
              {state.tables.length === 0 && (
                <div className="col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
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
                <div className="col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
                  <p>{t('tables.noTablesForFilter')}</p>
                </div>
              )}
              {isSearching && filteredTables.length > 0 && tablesToRender.length === 0 && (
                <div className="col-span-2 xl:col-span-3 text-center py-16 text-slate-400">
                  <p>{t('tables.noSearchMatches')}</p>
                </div>
              )}
              {tablesToRender.map((table) =>
                viewMode === 'floor' ? (
                  <FloorTable
                    key={table.id}
                    table={table}
                    guests={guestsByTable.get(table.id) ?? []}
                    tags={allTags}
                    assignedTagIds={assignedIdsFor(table)}
                    matchedIds={matchedIds}
                    linkBadges={linkBadges}
                    highlighted={matchedTableIds ? matchedTableIds.has(table.id) : false}
                    onEditCapacity={() => setCapacityTableId(table.id)}
                    onRemoveTable={() => handleRemoveTable(table.id)}
                    onGuestClick={(g) => setEditingGuestId(g.id)}
                    onToggleTag={(tagId) => toggleTag(table.id, tagId)}
                    onCreateTag={(label) => createTagForTable(table.id, label)}
                  />
                ) : (
                  <TableCard
                    key={table.id}
                    table={table}
                    guests={guestsByTable.get(table.id) ?? []}
                    tags={allTags}
                    assignedTagIds={assignedIdsFor(table)}
                    matchedIds={matchedIds}
                    linkBadges={linkBadges}
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
                    onEditCapacity={() => setCapacityTableId(table.id)}
                    onRemoveTable={() => handleRemoveTable(table.id)}
                    onGuestClick={(g) => setEditingGuestId(g.id)}
                    onToggleTag={(tagId) => toggleTag(table.id, tagId)}
                    onCreateTag={(label) => createTagForTable(table.id, label)}
                  />
                )
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile speed-dial: the most common actions one thumb-tap away — add guest/table plus the
          day-of check-in and share QR — so they aren't buried behind the ☰ menu on phones (where
          this app mostly lives). */}
      {quickAddOpen && (
        <div className="sm:hidden fixed inset-0 z-30" onClick={() => setQuickAddOpen(false)} aria-hidden />
      )}
      <div className="sm:hidden fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
        {quickAddOpen && (
          <>
            <button
              onClick={() => {
                setAddingGuest(true);
                setQuickAddOpen(false);
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden>🧑</span>
              {t('header.addGuest')}
            </button>
            <button
              onClick={() => {
                addTable(t('tables.namePrefix'));
                setQuickAddOpen(false);
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden>🪑</span>
              {t('header.addTable')}
            </button>
            <button
              onClick={() => {
                setCheckInOpen(true);
                setQuickAddOpen(false);
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden>🎉</span>
              {t('checkin.title')}
            </button>
            <button
              onClick={() => {
                setQrOpen(true);
                setQuickAddOpen(false);
              }}
              className="flex items-center gap-2 rounded-full bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700 pl-3 pr-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden>📱</span>
              {t('export.qrShort')}
            </button>
          </>
        )}
        <button
          onClick={() => setQuickAddOpen((o) => !o)}
          aria-label={t('header.quickAdd')}
          aria-expanded={quickAddOpen}
          className={`w-14 h-14 rounded-full bg-indigo-600 text-white text-3xl leading-none shadow-lg shadow-indigo-600/30 flex items-center justify-center hover:bg-indigo-500 transition-transform ${
            quickAddOpen ? 'rotate-45' : ''
          }`}
        >
          +
        </button>
      </div>

      {editingGuest && (
        <GuestEditorModal
          guest={editingGuest}
          tables={state.tables}
          tags={customTags}
          allGuests={state.guests}
          seatedCount={seatedCount}
          onSave={(patch) => updateGuest(editingGuest.id, patch)}
          onDelete={() =>
            askConfirm({
              message: t('guestEditor.deleteConfirm', {
                name: editingGuest.surname ? `${editingGuest.name} ${editingGuest.surname}` : editingGuest.name,
              }),
              confirmLabel: t('common.delete'),
              danger: true,
              onConfirm: () => {
                const snapshot = state;
                const name = editingGuest.surname
                  ? `${editingGuest.name} ${editingGuest.surname}`
                  : editingGuest.name;
                setEditingGuestId(null);
                runWithUndo(snapshot, () => removeGuest(editingGuest.id), t('guestEditor.deleted', { name }));
              },
            })
          }
          onClose={() => setEditingGuestId(null)}
          onLink={(otherId) => handleLinkGuests(editingGuest.id, otherId)}
          onUnlink={(otherId) => unlinkGuests(editingGuest.id, otherId)}
          onSeatGuest={trySeatGuest}
          onToggleTag={(tagId) => toggleGuestTag(editingGuest.id, tagId)}
          onCreateTag={(label) => createTagForGuest(editingGuest.id, label)}
        />
      )}

      {addingGuest && <AddGuestModal onAdd={addGuest} onClose={() => setAddingGuest(false)} />}

      {capacityTable && (
        <CapacityModal
          table={capacityTable}
          onSave={(capacity, shape) => updateTable(capacityTable.id, { capacity, shape })}
          onClose={() => setCapacityTableId(null)}
        />
      )}

      {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}

      {invitationOpen && (
        <InvitationModal
          state={state}
          onChange={updateEventDetails}
          onShowQr={() => setQrOpen(true)}
          onToast={showToast}
          onClose={() => setInvitationOpen(false)}
        />
      )}

      {eventDetailsOpen && (
        <EventDetailsModal state={state} onChange={updateEventDetails} onClose={() => setEventDetailsOpen(false)} />
      )}

      {qrOpen && <QrModal state={state} onToast={showToast} onClose={() => setQrOpen(false)} />}

      {statsOpen && <StatsModal state={state} onClose={() => setStatsOpen(false)} />}

      {checkInOpen && (
        <CheckInScreen
          state={state}
          onToggleArrived={toggleArrived}
          onReset={handleResetArrivals}
          onClose={() => setCheckInOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onAutoSeat={() => {
            setSettingsOpen(false);
            handleAutoSeat();
          }}
          onOverview={() => {
            setSettingsOpen(false);
            setStatsOpen(true);
          }}
          onCheckIn={() => {
            setSettingsOpen(false);
            setCheckInOpen(true);
          }}
          onEditEventDetails={() => {
            setSettingsOpen(false);
            setEventDetailsOpen(true);
          }}
          onEditInvitation={() => {
            setSettingsOpen(false);
            setInvitationOpen(true);
          }}
          tableColumns={tableColumns}
          onTableColumnsChange={setTableColumns}
          systemTags={systemTags}
          tags={customTags}
          onAddTag={addTag}
          onUpdateTag={updateTag}
          onRemoveTag={removeTag}
          onMarkAllComing={handleMarkAllComing}
          onMarkAllPending={handleMarkAllPending}
          onUnseatAll={handleUnseatAll}
          onReset={handleReset}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toastNode}
      <Analytics />
    </DndContext>
  );
}
