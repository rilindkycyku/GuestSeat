import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventState, Guest, Table } from '../types';
import { makeEventState, makeId } from '../lib/importGuests';
import { clearState, loadState, saveState } from '../lib/storage';

export function useEventState() {
  const [state, setState] = useState<EventState | null>(() => loadState());
  const skipNextSave = useRef(false);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
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
    skipNextSave.current = true;
    setState(null);
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
  };
}
