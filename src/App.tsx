import { useEffect, useMemo, useRef, useState } from 'react';
import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { Analytics } from '@vercel/analytics/react';
import { useEventState } from './hooks/useEventState';
import { useBoardDnd } from './hooks/useBoardDnd';
import { useTableTags, type TableFilter } from './hooks/useTableTags';
import { useGuestBadges } from './hooks/useGuestBadges';
import { useToast } from './hooks/useToast';
import { Toast } from './components/Toast';
import {
  countSeated,
  groupGuestsByTable,
  matchGuests,
  tablesToRender as narrowToMatches,
  tablesWithMatches,
  unseatedFor,
} from './lib/boardSearch';
import { useLanguage } from './hooks/useLanguage';
import { Onboarding } from './components/Onboarding';
import { EventPicker } from './components/EventPicker';
import { UnseatedPanel } from './components/UnseatedPanel';
import { TableCard } from './components/TableCard';
import { FloorTable } from './components/FloorTable';
import { GuestEditorModal } from './components/GuestEditorModal';
import { AddGuestModal } from './components/AddGuestModal';
import { NavBar } from './components/NavBar';
import { SettingsModal } from './components/SettingsModal';
import { Credits } from './components/Credits';
import { StatsModal } from './components/StatsModal';
import { CheckInScreen } from './components/CheckInScreen';
import { FindSeatScreen } from './components/FindSeatScreen';
import { InvitationModal } from './components/InvitationModal';
import { EventDetailsModal } from './components/EventDetailsModal';
import { QrModal } from './components/QrModal';
import { CapacityModal } from './components/CapacityModal';
import { ConfirmModal, type ConfirmOptions } from './components/ConfirmModal';
import { AutoSeatReport } from './components/AutoSeatReport';
import { ImportError, parseImportedJson } from './lib/importGuests';
import { parseImportedCsv } from './lib/importCsv';
import {
  loadCollapsedTableIds,
  saveCollapsedTableIds,
  loadViewMode,
  saveViewMode,
  loadTableColumns,
  saveTableColumns,
  loadSeedTraditions,
  saveSeedTraditions,
  type ViewMode,
  type TableColumns,
} from './lib/storage';
import { getDemoEventState } from './lib/demoEvent';
import { eventTypeConfig } from './lib/eventTypes';
import { autoSeat, type AutoSeatResult } from './lib/autoSeat';
import { clearShareParam, decodeSharedState, readFindSeatFlag, readShareParam } from './lib/shareLink';
import { tableDisplayName } from './lib/tableDisplay';
import { tagColorClasses } from './lib/tagColors';
import type { EventState, Guest } from './types';
import type { EventSummary } from './lib/db';

export default function App() {
  const {
    state,
    ready,
    activeId,
    events,
    createEvent,
    switchEvent,
    closeEvent,
    deleteEvent,
    renameEvent,
    loadFromImport,
    mergeFromImport,
    loadSharedState,
    restoreSnapshot,
    resetAll,
    setEventName,
    updateEventDetails,
    addTable,
    duplicateTable,
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
    keepApart,
    allowTogether,
    setAllRsvp,
    unseatAll,
    addTag,
    updateTag,
    removeTag,
    toggleTableTag,
    toggleGuestTag,
  } = useEventState();
  const { t } = useLanguage();
  const { toast, showToast, dismissToast } = useToast();

  const [query, setQuery] = useState('');
  // When true, show onboarding to create another event even though saved events already exist
  // (reached via "New event" on the picker). Cleared once an event is created or the picker returns.
  const [creatingNew, setCreatingNew] = useState(false);
  const [editingGuestId, setEditingGuestId] = useState<string | null>(null);
  const [addingGuest, setAddingGuest] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [collapsedTableIds, setCollapsedTableIds] = useState<Set<string>>(() => loadCollapsedTableIds());
  const [tableFilter, setTableFilter] = useState<TableFilter>({ kind: 'all' });
  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [tableColumns, setTableColumns] = useState<TableColumns>(() => loadTableColumns());
  const [seedTraditions, setSeedTraditions] = useState<boolean>(() => loadSeedTraditions());
  const [capacityTableId, setCapacityTableId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [autoSeatReport, setAutoSeatReport] = useState<Pick<AutoSeatResult, 'seated' | 'unplaced'> | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  // A plan received through a *guest* link: held in memory only, never saved, and shown as the
  // read-only seat lookup until someone says they're actually here to plan.
  const [findSeatState, setFindSeatState] = useState<EventState | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts: "/" or ⌘/Ctrl-K jumps to search from anywhere (skipped while typing in a
  // field or with a modal open), so planning a large list stays hands-on-keyboard.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
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

  useEffect(() => {
    saveSeedTraditions(seedTraditions);
  }, [seedTraditions]);

  const { sensors, accessibility: dndAccessibility } = useBoardDnd(state, t);

  // A destructive action + an "Undo" that rewinds to the snapshot captured just before it.
  const runWithUndo = (snapshot: EventState | null, act: () => void, msg: string) => {
    act();
    showToast(msg, snapshot ? { label: t('common.undo'), onClick: () => restoreSnapshot(snapshot) } : undefined);
  };

  const tableById = useMemo(() => new Map((state?.tables ?? []).map((tb) => [tb.id, tb])), [state]);

  const guestById = useMemo(() => new Map((state?.guests ?? []).map((g) => [g.id, g])), [state]);

  const editingGuest = editingGuestId ? (guestById.get(editingGuestId) ?? null) : null;

  const capacityTable = capacityTableId ? (tableById.get(capacityTableId) ?? null) : null;

  const { linkBadges, feudBadges } = useGuestBadges(state, t);

  const {
    customTags,
    systemTags,
    allTags,
    assignedIdsFor,
    filteredTables,
    visibleTableIds,
    tagCounts,
    toggleTag,
    createTagForTable,
    createTagForGuest,
  } = useTableTags(state, tableFilter, t, { updateTable, toggleTableTag, toggleGuestTag, addTag });

  const seatedCount = useMemo(() => countSeated(state?.guests ?? []), [state]);

  const matchedIds = useMemo(
    () => (state ? matchGuests(state, query, visibleTableIds, t) : null),
    [state, query, visibleTableIds, t]
  );

  const matchedTableIds = useMemo(
    () => (state ? tablesWithMatches(state.guests, matchedIds) : null),
    [matchedIds, state]
  );

  const isSearching = query.trim().length > 0;

  const tablesToRender = useMemo(
    () => narrowToMatches(filteredTables, matchedTableIds, isSearching),
    [filteredTables, isSearching, matchedTableIds]
  );

  useEffect(() => {
    if (!matchedTableIds || matchedTableIds.size === 0) return;
    const firstMatch = state?.tables.find((tb) => matchedTableIds.has(tb.id));
    if (!firstMatch) return;
    const el = document.querySelector(`[data-table-id="${firstMatch.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchedTableIds, state?.tables]);

  const guestsByTable = useMemo(() => groupGuestsByTable(state?.guests ?? []), [state]);

  const unseatedGuests = useMemo(() => unseatedFor(state?.guests ?? [], matchedIds), [state, matchedIds]);

  const handleImportFile = async (file: File, mode: 'replace' | 'merge') => {
    try {
      const text = await file.text();
      const result = file.name.toLowerCase().endsWith('.csv')
        ? parseImportedCsv(text)
        : parseImportedJson(JSON.parse(text), t('tables.namePrefix'));
      if (mode === 'replace') {
        loadFromImport(result, t('header.defaultEventName'));
        showToast(t('import.loaded', { count: result.guests.length }));
      } else {
        mergeFromImport(result);
        showToast(t('import.importedMore', { count: result.guests.length }));
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
    if (!targetTableId || !state) return;
    // Allowed, but say so — otherwise a keep-apart quietly stops meaning anything.
    const guest = guestById.get(guestId);
    const clashes = (guest?.apartGuestIds ?? [])
      .map((id) => guestById.get(id))
      .filter((other): other is Guest => !!other && other.tableId === targetTableId);
    if (guest && clashes.length) {
      showToast(
        t('autoSeat.feudWarning', {
          name: guest.surname ? `${guest.name} ${guest.surname}` : guest.name,
          other: clashes.map((c) => (c.surname ? `${c.name} ${c.surname}` : c.name)).join(', '),
        })
      );
    }
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
    const forGuests = readFindSeatFlag();
    void decodeSharedState(param).then((shared) => {
      if (cancelled) return;
      clearShareParam();
      if (!shared) {
        showToast(t('share.invalid'));
        return;
      }
      if (forGuests) {
        setFindSeatState(shared);
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
      confirmAgain: { message: t('settings.markAllComingConfirmFinal', { count: guestCount }) },
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
      confirmAgain: { message: t('settings.markAllPendingConfirmFinal', { count: guestCount }) },
      onConfirm: () => {
        const snapshot = state;
        runWithUndo(snapshot, () => setAllRsvp(undefined), t('settings.markedAllPending'));
      },
    });
  };

  const handleUnseatAll = () => {
    const seatedGuests = state?.guests.filter((g) => g.tableId).length ?? 0;
    askConfirm({
      message: t('settings.unseatAllConfirm'),
      confirmLabel: t('settings.unseatAll'),
      danger: true,
      confirmAgain: { message: t('settings.unseatAllConfirmFinal', { count: seatedGuests }) },
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
      confirmAgain: {
        message: t('header.resetConfirmFinal', {
          guests: snapshot?.guests.length ?? 0,
          tables: snapshot?.tables.length ?? 0,
        }),
      },
      onConfirm: () => {
        resetAll();
        setSettingsOpen(false);
        showToast(
          t('events.deleted', { name: snapshot?.eventName?.trim() || t('events.untitled') }),
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
    const { assignments, seated, leftUnseated, unplaced } = autoSeat(state);
    if (seated === 0) {
      // Nothing moved, so there is nothing to undo — just say why, in as much detail as we have.
      if (unplaced.length) setAutoSeatReport({ seated, unplaced });
      else showToast(t('autoSeat.noRoom'));
      return;
    }
    assignSeats(assignments);
    const msg =
      leftUnseated > 0
        ? t('autoSeat.someLeft', { count: seated, left: leftUnseated })
        : t('autoSeat.seated', { count: seated });
    showToast(msg, { label: t('common.undo'), onClick: () => restoreSnapshot(snapshot) });
    // Who was left behind, and why, is the part someone can act on — so it gets a dialog, not a line.
    if (unplaced.length) setAutoSeatReport({ seated, unplaced });
  };

  const handleResetArrivals = () => {
    const arrived = state?.guests.filter((g) => g.arrived).length ?? 0;
    askConfirm({
      message: t('checkin.resetConfirm'),
      confirmLabel: t('checkin.reset'),
      danger: true,
      confirmAgain: { message: t('checkin.resetConfirmFinal', { count: arrived }) },
      onConfirm: () => resetArrivals(),
    });
  };

  // Duplicate a table (empty copy inheriting capacity/shape/side/tags) with a brief confirmation toast.
  const handleDuplicateTable = (tableId: string) => {
    const table = tableById.get(tableId);
    if (!table) return;
    duplicateTable(tableId, t('tables.namePrefix'));
    showToast(t('tables.duplicatedTable', { name: tableDisplayName(table, t) }));
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
  const toastNode = <Toast toast={toast} onAction={dismissToast} />;

  // Create a new event from the onboarding flow, then leave the "creating" state.
  const startEvent = (init: Partial<EventState>) => {
    createEvent(init);
    setCreatingNew(false);
  };

  const handleDeleteEvent = (ev: EventSummary) => {
    const name = ev.eventName?.trim() || t('events.untitled');
    askConfirm({
      message: t('events.deleteConfirm', { name }),
      confirmLabel: t('events.delete'),
      danger: true,
      confirmAgain: {
        message: t('events.deleteConfirmFinal', { name, guests: ev.guestCount, tables: ev.tableCount }),
      },
      onConfirm: () => {
        deleteEvent(ev.id);
        showToast(t('events.deleted', { name }));
      },
    });
  };

  // Close the open event back to the events picker — the event stays saved and can be reopened.
  const handleCloseToPicker = () => {
    setCreatingNew(false);
    closeEvent();
  };

  // The onboarding screen, optionally with a Back link (shown when other events already exist).
  const onboardingScreen = (onBack?: () => void) => (
    <Onboarding
      onBack={onBack}
      onImported={(result, fallbackName, eventType) =>
        startEvent({
          ...result,
          eventName: result.eventName ?? fallbackName,
          // A chosen event type applies only when the file didn't already carry invitation details.
          ...(eventType !== 'wedding' && !result.details ? { details: { eventType } } : {}),
        })
      }
      onLoadDemo={() => startEvent(getDemoEventState())}
      onStartBlank={(eventType) => {
        const cfg = eventTypeConfig(eventType);
        startEvent({
          eventName: eventType === 'wedding' ? t('header.defaultEventName') : t(cfg.labelKey),
          ...(eventType !== 'wedding' ? { details: { eventType } } : {}),
        });
      }}
      seedTraditions={seedTraditions}
      onSeedTraditionsChange={setSeedTraditions}
    />
  );

  // A guest link short-circuits the whole planner: no saved events are involved, so this renders
  // before the IndexedDB gate below.
  if (findSeatState) {
    return (
      <FindSeatScreen
        state={findSeatState}
        onOpenFullPlan={() => {
          const shared = findSeatState;
          setFindSeatState(null);
          askConfirm({
            message: t('share.receivedConfirm', { name: shared.eventName, count: shared.guests.length }),
            confirmLabel: t('share.load'),
            onConfirm: () => {
              loadSharedState(shared);
              showToast(t('share.loaded', { count: shared.guests.length }));
            },
          });
        }}
      />
    );
  }

  // Hold the first paint until IndexedDB has been read, so existing events never flash onboarding.
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <span
          className="w-8 h-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"
          role="status"
          aria-label={t('common.loading')}
        />
      </div>
    );
  }

  if (!activeId || !state) {
    // No event open: show the picker when others exist (and we're not explicitly creating a new
    // one), otherwise the onboarding screen. A shared list arriving via a QR/share link decodes
    // into a confirm prompt here too, so the ConfirmModal and toast must render in both branches.
    const showPicker = events.length > 0 && !creatingNew;
    return (
      <>
        {showPicker ? (
          <EventPicker
            events={events}
            onOpen={(id) => void switchEvent(id)}
            onNew={() => setCreatingNew(true)}
            onRename={renameEvent}
            onDelete={handleDeleteEvent}
          />
        ) : (
          onboardingScreen(events.length > 0 ? () => setCreatingNew(false) : undefined)
        )}
        {confirmState && <ConfirmModal {...confirmState} onClose={() => setConfirmState(null)} />}
        {autoSeatReport && <AutoSeatReport result={autoSeatReport} onClose={() => setAutoSeatReport(null)} />}
        {toastNode}
      </>
    );
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd} accessibility={dndAccessibility}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
        <NavBar
          state={state}
          query={query}
          onQueryChange={setQuery}
          matchCount={matchedIds ? matchedIds.size : null}
          searchInputRef={searchInputRef}
          onRename={setEventName}
          onAddGuest={() => setAddingGuest(true)}
          onAddTable={() => addTable(t('tables.namePrefix'))}
          onImportFile={(file) => void handleImportFile(file, 'replace')}
          onOpenCheckIn={() => setCheckInOpen(true)}
          onOpenOverview={() => setStatsOpen(true)}
          onOpenEvents={handleCloseToPicker}
          onOpenSettings={() => setSettingsOpen(true)}
          onShowInvitation={() => setInvitationOpen(true)}
          onShowQr={() => setQrOpen(true)}
          onToast={showToast}
        />

        <main className="flex-1 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 items-start">
          <div className="lg:sticky lg:top-[72px] lg:h-[calc(100vh-88px)]">
            <UnseatedPanel
              guests={unseatedGuests}
              matchedIds={matchedIds}
              linkBadges={linkBadges}
              feudBadges={feudBadges}
              tags={customTags}
              onGuestClick={(g) => setEditingGuestId(g.id)}
              onAutoSeat={handleAutoSeat}
            />
          </div>

          <div className="min-w-0 w-full">
            {state.tables.length > 0 && (
              <div data-print="hide" className="flex flex-wrap items-center justify-between gap-2 mb-3">
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
                    feudBadges={feudBadges}
                    highlighted={matchedTableIds ? matchedTableIds.has(table.id) : false}
                    onEditCapacity={() => setCapacityTableId(table.id)}
                    onDuplicateTable={() => handleDuplicateTable(table.id)}
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
                    feudBadges={feudBadges}
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
                    onDuplicateTable={() => handleDuplicateTable(table.id)}
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
        {/* Extra bottom room on phones so the fixed quick-add button doesn't float over the credit. */}
        <div className="pb-20 lg:pb-0">
          <Credits />
        </div>
      </div>

      {/* Mobile speed-dial: the most common actions one thumb-tap away — add guest/table plus the
          day-of check-in and share QR — so they aren't buried behind the nav drawer on phones (where
          this app mostly lives). Shown at exactly the widths where the nav bar collapses. */}
      {quickAddOpen && (
        <div className="lg:hidden fixed inset-0 z-30" onClick={() => setQuickAddOpen(false)} aria-hidden />
      )}
      <div data-print="hide" className="lg:hidden fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
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
                const name = editingGuest.surname ? `${editingGuest.name} ${editingGuest.surname}` : editingGuest.name;
                setEditingGuestId(null);
                runWithUndo(snapshot, () => removeGuest(editingGuest.id), t('guestEditor.deleted', { name }));
              },
            })
          }
          onClose={() => setEditingGuestId(null)}
          onLink={(otherId) => handleLinkGuests(editingGuest.id, otherId)}
          onKeepApart={(otherId) => keepApart(editingGuest.id, otherId)}
          onAllowTogether={(otherId) => allowTogether(editingGuest.id, otherId)}
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
      {autoSeatReport && <AutoSeatReport result={autoSeatReport} onClose={() => setAutoSeatReport(null)} />}

      {invitationOpen && (
        <InvitationModal
          state={state}
          onChange={updateEventDetails}
          onShowQr={() => setQrOpen(true)}
          onToast={showToast}
          seedTraditions={seedTraditions}
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
          onSwitchEvents={() => {
            setSettingsOpen(false);
            handleCloseToPicker();
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
