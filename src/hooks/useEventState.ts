import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EventDetails,
  EventState,
  Guest,
  ImportResult,
  RsvpStatus,
  Table,
  TableTag,
  TagColor,
} from '../types';
import { makeEventState, makeId, mergeTags } from '../lib/importGuests';
import { TAG_COLOR_ORDER } from '../lib/tagColors';
import {
  type EventSummary,
  type StoredEvent,
  deleteEventRecord,
  getAllEvents,
  getEvent,
  getActiveId,
  migrateLegacyState,
  putEvent,
  setActiveId,
  summarize,
} from '../lib/db';

const buildState = makeEventState;

/** True when two summary rows are display-identical, so the picker list can skip a needless re-render. */
function sameSummary(a: EventSummary, b: EventSummary): boolean {
  return (
    a.eventName === b.eventName &&
    a.updatedAt === b.updatedAt &&
    a.guestCount === b.guestCount &&
    a.tableCount === b.tableCount &&
    a.eventType === b.eventType
  );
}

export function useEventState() {
  // The event currently open (null while on the events picker / onboarding), the id it's stored
  // under, and lightweight summaries of every saved event for the picker. `ready` gates the first
  // render until IndexedDB has been read, so we don't flash onboarding over existing events.
  const [state, setState] = useState<EventState | null>(null);
  const [activeId, setActiveIdState] = useState<string | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [ready, setReady] = useState(false);

  // Latest activeId readable synchronously from callbacks with stable ([]) identities, so they don't
  // need to close over the changing value (and so we never run side effects inside a state updater).
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // One-time load: migrate any legacy localStorage event, then hydrate the open event + the list.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await migrateLegacyState(makeId);
        const all = await getAllEvents();
        let active = await getActiveId();
        if (active && !all.some((e) => e.id === active)) active = null;
        const rec = active ? all.find((e) => e.id === active) : undefined;
        if (cancelled) return;
        setEvents(all.map(summarize));
        setActiveIdState(rec ? active : null);
        setState(rec ? rec.state : null);
      } catch {
        // IndexedDB unavailable (e.g. private mode with storage blocked) — start empty.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the open event on every change and keep its summary row in sync. The summary is only
  // rewritten when a display-visible field actually changed, so ordinary edits (seating a guest,
  // toggling a tag) don't churn the picker list.
  useEffect(() => {
    if (!ready || !activeId || !state) return;
    const rec: StoredEvent = { id: activeId, state };
    void putEvent(rec);
    setEvents((prev) => {
      const next = summarize(rec);
      const idx = prev.findIndex((e) => e.id === activeId);
      if (idx === -1) return [next, ...prev];
      if (sameSummary(prev[idx], next)) return prev;
      return prev.map((e) => (e.id === activeId ? next : e));
    });
  }, [state, activeId, ready]);

  // Create a brand-new saved event and open it. Used by onboarding (import/blank/demo), by loading
  // a shared list, and to re-materialize an event after an undo. Returns the new event's id.
  const createEvent = useCallback((initial: Partial<EventState> = {}): string => {
    const id = makeId('ev');
    const newState = buildState(initial);
    setActiveIdState(id);
    setState(newState);
    setEvents((prev) => [summarize({ id, state: newState }), ...prev.filter((e) => e.id !== id)]);
    void putEvent({ id, state: newState });
    void setActiveId(id);
    return id;
  }, []);

  // Open an already-saved event, loading its full state from IndexedDB.
  const switchEvent = useCallback(async (id: string) => {
    const rec = await getEvent(id);
    if (!rec) return;
    setActiveIdState(id);
    setState(rec.state);
    void setActiveId(id);
  }, []);

  // Close the open event and return to the events picker — the event stays saved for later.
  const closeEvent = useCallback(() => {
    setActiveIdState(null);
    setState(null);
    void setActiveId(null);
  }, []);

  // Permanently delete a saved event. If it was the open one, fall back to the picker.
  const deleteEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    void deleteEventRecord(id);
    if (activeIdRef.current === id) {
      setActiveIdState(null);
      setState(null);
      void setActiveId(null);
    }
  }, []);

  // Rename a saved event from the picker. The open event goes through setEventName instead.
  const renameEvent = useCallback((id: string, name: string) => {
    void (async () => {
      const rec = await getEvent(id);
      if (!rec) return;
      const updated: StoredEvent = {
        id,
        state: { ...rec.state, eventName: name, updatedAt: new Date().toISOString() },
      };
      await putEvent(updated);
      setEvents((prev) => prev.map((e) => (e.id === id ? summarize(updated) : e)));
    })();
  }, []);

  // Replace the open event with an imported one. The whole parse result is carried over — tags and
  // invitation details included — so re-importing a GuestSeat export gives back what was exported.
  const loadFromImport = useCallback((result: ImportResult, fallbackName?: string) => {
    setState(makeEventState({ ...result, eventName: result.eventName ?? fallbackName }));
  }, []);

  // "Add to this event": append imported guests and tables, folding the imported tag palette into
  // the existing one (see {@link mergeTags}) so tag references survive an id collision between
  // two separately-created events.
  const mergeFromImport = useCallback((result: ImportResult) => {
    setState((prev) => {
      const base = prev ?? makeEventState();
      const merged = mergeTags(base.tags ?? [], result.tags ?? [], result.guests, result.tables);
      return {
        ...base,
        guests: [...base.guests, ...merged.guests],
        tables: [...base.tables, ...merged.tables],
        ...(merged.tags.length ? { tags: merged.tags } : {}),
        // An import only fills in details the open event is missing — it never overwrites the
        // invitation someone has already written.
        ...(result.details ? { details: { ...result.details, ...base.details } } : {}),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // "Delete this event": permanently remove the open event and drop back to the picker / onboarding.
  const resetAll = useCallback(() => {
    const curr = activeIdRef.current;
    if (curr) {
      setEvents((prev) => prev.filter((e) => e.id !== curr));
      void deleteEventRecord(curr);
    }
    setActiveIdState(null);
    setState(null);
    void setActiveId(null);
  }, []);

  // Load a snapshot received via a share link as a brand-new event, so it sits alongside — rather
  // than replacing — whatever the recipient was already working on. IDs, tags and seating come intact.
  const loadSharedState = useCallback(
    (shared: EventState) => {
      createEvent({ ...shared });
    },
    [createEvent]
  );

  // Restore a previously captured snapshot — the backbone of the undo toasts shown after destructive
  // actions (unseat all, reset, mark all, delete guest). If an event is open it rewinds it in place;
  // if the destructive action was a full reset (no open event), the snapshot is re-created as an event.
  const restoreSnapshot = useCallback((snapshot: EventState) => {
    if (activeIdRef.current) {
      setState(snapshot);
      return;
    }
    // The event was fully deleted (undo after "Delete this event") — re-materialize it.
    const id = makeId('ev');
    setActiveIdState(id);
    setState(snapshot);
    setEvents((prev) => [summarize({ id, state: snapshot }), ...prev]);
    void putEvent({ id, state: snapshot });
    void setActiveId(id);
  }, []);

  const setEventName = useCallback((eventName: string) => {
    setState((prev) => (prev ? { ...prev, eventName, updatedAt: new Date().toISOString() } : prev));
  }, []);

  // Merge a patch into the event's invitation details (bride/groom, venue, date, agenda…).
  const updateEventDetails = useCallback((patch: Partial<EventDetails>) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        details: { ...prev.details, ...patch },
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const addTable = useCallback((namePrefix = 'Table') => {
    setState((prev) => {
      const base = prev ?? makeEventState();
      const nextNumber = base.tables.length + 1;
      // Inherit the capacity and shape of the last table added: once someone sets their tables to,
      // say, 10 seats or a long banquet shape, every "Add table" after keeps that instead of
      // snapping back to the round-8 default — a small optimization for rooms of uniform tables.
      const last = base.tables[base.tables.length - 1];
      const newTable: Table = {
        id: makeId('t'),
        name: `${namePrefix} ${nextNumber}`,
        capacity: last?.capacity ?? 8,
        ...(last?.shape ? { shape: last.shape } : {}),
        autoSuffix: String(nextNumber),
      };
      return { ...base, tables: [...base.tables, newTable], updatedAt: new Date().toISOString() };
    });
  }, []);

  // Duplicate a table: a new, empty table right after the source, carrying its capacity, shape,
  // side and tags — but not its guests or its (possibly hand-typed) name, which is re-numbered so
  // the copy reads as a fresh table. Handy for filling a room with identical tables in one tap each.
  const duplicateTable = useCallback((tableId: string, namePrefix = 'Table') => {
    setState((prev) => {
      if (!prev) return prev;
      const index = prev.tables.findIndex((tb) => tb.id === tableId);
      if (index === -1) return prev;
      const source = prev.tables[index];
      const nextNumber = prev.tables.length + 1;
      const copy: Table = {
        id: makeId('t'),
        name: `${namePrefix} ${nextNumber}`,
        capacity: source.capacity,
        ...(source.shape ? { shape: source.shape } : {}),
        ...(source.side ? { side: source.side } : {}),
        ...(source.tagIds?.length ? { tagIds: [...source.tagIds] } : {}),
        autoSuffix: String(nextNumber),
      };
      const tables = [...prev.tables];
      tables.splice(index + 1, 0, copy);
      return { ...prev, tables, updatedAt: new Date().toISOString() };
    });
  }, []);

  const updateTable = useCallback((tableId: string, patch: Partial<Table>) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === tableId ? { ...t, ...patch } : t)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const removeTable = useCallback((tableId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tables: prev.tables.filter((t) => t.id !== tableId),
        guests: prev.guests.map((g) => (g.tableId === tableId ? { ...g, tableId: null } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const seatGuest = useCallback((guestId: string, tableId: string | null) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => (g.id === guestId ? { ...g, tableId } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // Apply a batch of seat assignments in one update (used by auto-seat) so the whole fill is a
  // single undoable step instead of many.
  const assignSeats = useCallback((assignments: { guestId: string; tableId: string }[]) => {
    if (assignments.length === 0) return;
    setState((prev) => {
      if (!prev) return prev;
      const byGuest = new Map(assignments.map((a) => [a.guestId, a.tableId]));
      return {
        ...prev,
        guests: prev.guests.map((g) => (byGuest.has(g.id) ? { ...g, tableId: byGuest.get(g.id)! } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // Day-of check-in: flip a guest's arrived flag.
  const toggleArrived = useCallback((guestId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => (g.id === guestId ? { ...g, arrived: !g.arrived } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  // Clear every guest's arrived flag — start a fresh check-in.
  const resetArrivals = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => (g.arrived ? { ...g, arrived: false } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const addGuest = useCallback((guest: Partial<Guest> & { name: string }) => {
    setState((prev) => {
      const base = prev ?? makeEventState();
      const newGuest: Guest = {
        id: makeId('g'),
        name: guest.name.trim(),
        surname: guest.surname?.trim() || undefined,
        notes: guest.notes?.trim() || undefined,
        tableId: guest.tableId ?? null,
      };
      return { ...base, guests: [...base.guests, newGuest], updatedAt: new Date().toISOString() };
    });
  }, []);

  const updateGuest = useCallback((guestId: string, patch: Partial<Guest>) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => (g.id === guestId ? { ...g, ...patch } : g)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const removeGuest = useCallback((guestId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests
          .filter((g) => g.id !== guestId)
          .map((g) =>
            g.linkedGuestIds?.includes(guestId)
              ? { ...g, linkedGuestIds: g.linkedGuestIds.filter((id) => id !== guestId) }
              : g
          ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const linkGuests = useCallback((guestIdA: string, guestIdB: string) => {
    if (guestIdA === guestIdB) return;
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => {
          if (g.id === guestIdA) {
            const links = g.linkedGuestIds ?? [];
            return links.includes(guestIdB) ? g : { ...g, linkedGuestIds: [...links, guestIdB] };
          }
          if (g.id === guestIdB) {
            const links = g.linkedGuestIds ?? [];
            return links.includes(guestIdA) ? g : { ...g, linkedGuestIds: [...links, guestIdA] };
          }
          return g;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const setAllRsvp = useCallback((rsvp: RsvpStatus | undefined) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => ({ ...g, rsvp })),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const unseatAll = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => ({ ...g, tableId: null })),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const addTag = useCallback((label: string, color?: TagColor): string => {
    const id = makeId('tag');
    setState((prev) => {
      const base = prev ?? makeEventState();
      const existing = base.tags ?? [];
      // Cycle through the palette so consecutive new tags get distinct colors by default.
      const nextColor = color ?? TAG_COLOR_ORDER[existing.length % TAG_COLOR_ORDER.length];
      const newTag: TableTag = { id, label: label.trim() || 'Tag', color: nextColor };
      return { ...base, tags: [...existing, newTag], updatedAt: new Date().toISOString() };
    });
    return id;
  }, []);

  const updateTag = useCallback((tagId: string, patch: Partial<Omit<TableTag, 'id'>>) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tags: (prev.tags ?? []).map((tag) => (tag.id === tagId ? { ...tag, ...patch } : tag)),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const removeTag = useCallback((tagId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tags: (prev.tags ?? []).filter((tag) => tag.id !== tagId),
        // Drop the tag from any table that carried it.
        tables: prev.tables.map((tb) =>
          tb.tagIds?.includes(tagId) ? { ...tb, tagIds: tb.tagIds.filter((id) => id !== tagId) } : tb
        ),
        // …and from any guest that carried it.
        guests: prev.guests.map((g) =>
          g.tagIds?.includes(tagId) ? { ...g, tagIds: g.tagIds.filter((id) => id !== tagId) } : g
        ),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const toggleGuestTag = useCallback((guestId: string, tagId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => {
          if (g.id !== guestId) return g;
          const current = g.tagIds ?? [];
          const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
          return { ...g, tagIds: next };
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const toggleTableTag = useCallback((tableId: string, tagId: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        tables: prev.tables.map((tb) => {
          if (tb.id !== tableId) return tb;
          const current = tb.tagIds ?? [];
          const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId];
          return { ...tb, tagIds: next };
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const unlinkGuests = useCallback((guestIdA: string, guestIdB: string) => {
    setState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        guests: prev.guests.map((g) => {
          if (g.id === guestIdA || g.id === guestIdB) {
            const otherId = g.id === guestIdA ? guestIdB : guestIdA;
            if (!g.linkedGuestIds?.includes(otherId)) return g;
            return { ...g, linkedGuestIds: g.linkedGuestIds.filter((id) => id !== otherId) };
          }
          return g;
        }),
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  return {
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
    setAllRsvp,
    unseatAll,
    addTag,
    updateTag,
    removeTag,
    toggleTableTag,
    toggleGuestTag,
  };
}
