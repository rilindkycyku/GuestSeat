import { useCallback, useEffect, useState } from 'react';
import type { EventState, Guest, RsvpStatus, Table, TableTag, TagColor } from '../types';
import { makeEventState, makeId } from '../lib/importGuests';
import { TAG_COLOR_ORDER } from '../lib/tagColors';
import { getDefaultEventState } from '../lib/defaultEvent';
import { clearState, loadState, saveState } from '../lib/storage';

export function useEventState() {
  // Seed with the saved state, falling back to the bundled default guest list so the
  // app opens straight to the seating chart without requiring an upload.
  const [state, setState] = useState<EventState | null>(() => loadState() ?? getDefaultEventState());

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
    setState(getDefaultEventState());
  }, []);

  // Replace the whole event with a snapshot received via a share link. Guest/table IDs, tags
  // and seating all come through intact, so the recipient sees an exact copy of the sender's list.
  const loadSharedState = useCallback((shared: EventState) => {
    setState({ ...shared, updatedAt: new Date().toISOString() });
  }, []);

  const setEventName = useCallback((eventName: string) => {
    setState((prev) => (prev ? { ...prev, eventName, updatedAt: new Date().toISOString() } : prev));
  }, []);

  const addTable = useCallback((namePrefix = 'Table') => {
    setState((prev) => {
      const base = prev ?? makeEventState();
      const nextNumber = base.tables.length + 1;
      const newTable: Table = {
        id: makeId('t'),
        name: `${namePrefix} ${nextNumber}`,
        capacity: 8,
        autoSuffix: String(nextNumber),
      };
      return { ...base, tables: [...base.tables, newTable], updatedAt: new Date().toISOString() };
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
    resetAll,
    setEventName,
    addTable,
    updateTable,
    removeTable,
    seatGuest,
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
  };
}
