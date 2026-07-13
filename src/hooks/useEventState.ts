import { useCallback, useEffect, useState } from 'react';
import type { EventDetails, EventState, Guest, RsvpStatus, Table, TableTag, TagColor } from '../types';
import { makeEventState, makeId } from '../lib/importGuests';
import { TAG_COLOR_ORDER } from '../lib/tagColors';
import { clearState, loadState, saveState } from '../lib/storage';

export function useEventState() {
  // Seed only with the user's saved state. When there's nothing saved this is null, which
  // lets the app open on the onboarding screen so each user starts with their own list.
  const [state, setState] = useState<EventState | null>(() => loadState());

  useEffect(() => {
    if (state) saveState(state);
  }, [state]);

  const loadFromImport = useCallback((guests: Guest[], tables: Table[], eventName?: string) => {
    setState(makeEventState({ guests, tables, eventName }));
  }, []);

  const mergeFromImport = useCallback((guests: Guest[], tables: Table[] = []) => {
    setState((prev) => {
      const base = prev ?? makeEventState();
      return {
        ...base,
        guests: [...base.guests, ...guests],
        tables: [...base.tables, ...tables],
        updatedAt: new Date().toISOString(),
      };
    });
  }, []);

  const resetAll = useCallback(() => {
    clearState();
    // Clear back to the onboarding screen rather than reseeding any bundled list.
    setState(null);
  }, []);

  // Replace the whole event with a snapshot received via a share link. Guest/table IDs, tags
  // and seating all come through intact, so the recipient sees an exact copy of the sender's list.
  const loadSharedState = useCallback((shared: EventState) => {
    setState({ ...shared, updatedAt: new Date().toISOString() });
  }, []);

  // Restore a previously captured snapshot verbatim — the backbone of the undo toasts shown
  // after destructive actions (unseat all, reset, mark all, delete guest). Unlike loadSharedState
  // this keeps the original updatedAt so an undo truly rewinds to the prior state.
  const restoreSnapshot = useCallback((snapshot: EventState) => {
    setState(snapshot);
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
