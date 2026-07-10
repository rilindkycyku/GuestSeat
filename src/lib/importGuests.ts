import type { EventState, Guest, ImportGuestEntry, ImportShape, Table, TableNamingMode } from '../types';

function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function normalizeEntry(entry: ImportGuestEntry, group?: string): Guest | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return { id: makeId('g'), name: trimmed, tableId: null, group };
  }
  if (entry && typeof entry === 'object') {
    const name = (entry.name ?? entry.firstName ?? entry.first_name ?? '').toString().trim();
    const surname = (entry.surname ?? entry.lastName ?? entry.last_name ?? '').toString().trim();
    if (!name) return null;
    return {
      id: entry.id || makeId('g'),
      name,
      surname: surname || undefined,
      notes: entry.notes,
      group: entry.group ?? group,
      tableId: null,
      linkedGuestIds: Array.isArray(entry.linkedGuestIds) ? entry.linkedGuestIds : undefined,
    };
  }
  return null;
}

export type ImportErrorCode =
  | 'INVALID_JSON'
  | 'GUESTS_KEY_EMPTY'
  | 'FLAT_ARRAY_EMPTY'
  | 'GROUPED_EMPTY'
  | 'UNRECOGNIZED';

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(code);
    this.code = code;
  }
}

/**
 * Accepts three shapes:
 *  1. { "A": ["Name1", "Name2"], "B": [...] } - letters/groups mapping to first-name arrays
 *     (the format produced by the user's own guest-list export)
 *  2. [ "Full guest entry", { name, surname, table }, ... ] - flat array
 *  3. { guests: [...], tables: [...], eventName } - a previously exported GuestSeat file (round-trip)
 *
 * `tableLabel` is used as the display prefix for tables generated from shape 1 (e.g. "Table A").
 * `namingMode` controls whether those tables are suffixed with their original key ("Table A") or
 * a sequential number ("Table 1").
 */
export function parseImportedJson(
  raw: unknown,
  tableLabel = 'Table',
  namingMode: TableNamingMode = 'letters'
): { guests: Guest[]; tables: Table[]; eventName?: string } {
  if (raw === null || typeof raw !== 'object') {
    throw new ImportError('INVALID_JSON');
  }

  const data = raw as ImportShape;

  // Shape 3: full GuestSeat export (round-trip import)
  if (!Array.isArray(data) && 'guests' in data && Array.isArray((data as any).guests)) {
    const full = data as { guests: ImportGuestEntry[]; tables?: Partial<Table>[]; eventName?: string };
    const tableIdMap = new Map<string, string>();
    const tables: Table[] = (full.tables ?? []).map((t) => {
      const id = t.id ?? makeId('t');
      if (t.id) tableIdMap.set(t.id, t.id);
      return { id, name: t.name ?? tableLabel, capacity: t.capacity ?? 8 };
    });
    const guests = full.guests
      .map((e) => normalizeEntry(e))
      .filter((g): g is Guest => g !== null)
      .map((g, i) => {
        const original = full.guests[i];
        const rawTable =
          typeof original === 'object' && original ? original.table ?? (original as any).tableId : undefined;
        return rawTable ? { ...g, tableId: tables.some((t) => t.id === rawTable) ? rawTable : null } : g;
      });
    if (guests.length === 0) throw new ImportError('GUESTS_KEY_EMPTY');
    // Drop any link references to guests that didn't survive normalization (e.g. blank names).
    const validGuestIds = new Set(guests.map((g) => g.id));
    const cleanedGuests = guests.map((g) =>
      g.linkedGuestIds?.length
        ? { ...g, linkedGuestIds: g.linkedGuestIds.filter((id) => validGuestIds.has(id)) }
        : g
    );
    return { guests: cleanedGuests, tables, eventName: full.eventName };
  }

  // Shape 2: flat array
  if (Array.isArray(data)) {
    const guests = data.map((e) => normalizeEntry(e)).filter((g): g is Guest => g !== null);
    if (guests.length === 0) {
      throw new ImportError('FLAT_ARRAY_EMPTY');
    }
    return { guests, tables: [] };
  }

  // Shape 1: grouped object of arrays (the format used by lista_e_dasmes.json).
  // Each key is treated as a table name, and its names are seated at that table.
  const groupKeys = Object.keys(data as Record<string, unknown>);
  const allArrays = groupKeys.every((k) => Array.isArray((data as Record<string, unknown>)[k]));
  if (groupKeys.length > 0 && allArrays) {
    const guests: Guest[] = [];
    const tables: Table[] = [];
    for (const key of groupKeys) {
      const entries = (data as Record<string, ImportGuestEntry[]>)[key];
      const suffix = namingMode === 'numbers' ? String(tables.length + 1) : key;
      const table: Table = { id: makeId('t'), name: `${tableLabel} ${suffix}`, capacity: entries.length };
      const tableGuests: Guest[] = [];
      for (const entry of entries) {
        const g = normalizeEntry(entry, key);
        if (g) tableGuests.push({ ...g, tableId: table.id });
      }
      if (tableGuests.length > 0) {
        tables.push(table);
        guests.push(...tableGuests);
      }
    }
    if (guests.length === 0) {
      throw new ImportError('GROUPED_EMPTY');
    }
    return { guests, tables };
  }

  throw new ImportError('UNRECOGNIZED');
}

export function makeEventState(partial: Partial<EventState> = {}): EventState {
  return {
    eventName: partial.eventName ?? 'Guest List',
    guests: partial.guests ?? [],
    tables: partial.tables ?? [],
    updatedAt: new Date().toISOString(),
  };
}

export { makeId };
