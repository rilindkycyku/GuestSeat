import type { EventState, Guest, ImportGuestEntry, ImportShape, Table } from '../types';

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
      id: makeId('g'),
      name,
      surname: surname || undefined,
      notes: entry.notes,
      group: entry.group ?? group,
      tableId: null,
    };
  }
  return null;
}

export class ImportError extends Error {}

/**
 * Accepts three shapes:
 *  1. { "A": ["Name1", "Name2"], "B": [...] } - letters/groups mapping to first-name arrays
 *     (the format produced by the user's own guest-list export)
 *  2. [ "Full guest entry", { name, surname, table }, ... ] - flat array
 *  3. { guests: [...], tables: [...], eventName } - a previously exported GuestSeat file (round-trip)
 */
export function parseImportedJson(raw: unknown): { guests: Guest[]; tables: Table[]; eventName?: string } {
  if (raw === null || typeof raw !== 'object') {
    throw new ImportError('That file is not valid JSON for a guest list.');
  }

  const data = raw as ImportShape;

  // Shape 3: full GuestSeat export (round-trip import)
  if (!Array.isArray(data) && 'guests' in data && Array.isArray((data as any).guests)) {
    const full = data as { guests: ImportGuestEntry[]; tables?: Partial<Table>[]; eventName?: string };
    const tableIdMap = new Map<string, string>();
    const tables: Table[] = (full.tables ?? []).map((t) => {
      const id = t.id ?? makeId('t');
      if (t.id) tableIdMap.set(t.id, t.id);
      return { id, name: t.name ?? 'Table', capacity: t.capacity ?? 8 };
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
    if (guests.length === 0) throw new ImportError('That file has a "guests" list but no valid entries were found.');
    return { guests, tables, eventName: full.eventName };
  }

  // Shape 2: flat array
  if (Array.isArray(data)) {
    const guests = data.map((e) => normalizeEntry(e)).filter((g): g is Guest => g !== null);
    if (guests.length === 0) {
      throw new ImportError('That JSON array did not contain any recognizable guest names.');
    }
    return { guests, tables: [] };
  }

  // Shape 1: grouped object of arrays (the format used by lista_e_dasmes.json)
  const groupKeys = Object.keys(data as Record<string, unknown>);
  const allArrays = groupKeys.every((k) => Array.isArray((data as Record<string, unknown>)[k]));
  if (groupKeys.length > 0 && allArrays) {
    const guests: Guest[] = [];
    for (const key of groupKeys) {
      const entries = (data as Record<string, ImportGuestEntry[]>)[key];
      for (const entry of entries) {
        const g = normalizeEntry(entry, key);
        if (g) guests.push(g);
      }
    }
    if (guests.length === 0) {
      throw new ImportError('That JSON did not contain any recognizable guest names.');
    }
    return { guests, tables: [] };
  }

  throw new ImportError(
    'Unrecognized JSON structure. Expected a list of names, a list of guest objects, or groups of names.'
  );
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
