import type { EventState, Guest, Table } from '../types';
import { tableDisplayName, type Translator } from './tableDisplay';

/**
 * The board's derived data: what the search matched, who sits where, and how full each table is.
 *
 * These used to be `useMemo`s inside App, which made them the one part of the board with no way to
 * be tested — search in particular has rules that aren't obvious (a table's *display* name counts as
 * a match, linked partners come along with a match, tables hidden by the tag filter never match).
 */

/** How full each table is, by table id. */
export function countSeated(guests: Guest[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of guests) {
    if (g.tableId) counts.set(g.tableId, (counts.get(g.tableId) ?? 0) + 1);
  }
  return counts;
}

/** Seated guests bucketed by table, each bucket sorted by first name. */
export function groupGuestsByTable(guests: Guest[]): Map<string, Guest[]> {
  const byTable = new Map<string, Guest[]>();
  for (const g of guests) {
    if (!g.tableId) continue;
    const list = byTable.get(g.tableId) ?? [];
    list.push(g);
    byTable.set(g.tableId, list);
  }
  for (const list of byTable.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return byTable;
}

/**
 * Guests matching the search box, or null when there's no query (null and "everyone" are different:
 * null means "not searching", which is what the board shows normally).
 *
 * A guest matches on their name, their surname, or the name of the table they're at — searching
 * "table 7" is how someone jumps to a table. Anyone linked to a match is pulled in too, so a couple
 * never shows up half-filtered. Guests at tables the tag filter has hidden can't match at all.
 */
export function matchGuests(
  state: EventState,
  query: string,
  visibleTableIds: Set<string>,
  t: Translator
): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;

  const tableById = new Map(state.tables.map((tb) => [tb.id, tb]));
  const guestById = new Map(state.guests.map((g) => [g.id, g]));
  const isVisible = (g: Guest) => !g.tableId || visibleTableIds.has(g.tableId);

  const matched = new Set<string>();
  for (const g of state.guests) {
    if (!isVisible(g)) continue;
    const table = g.tableId ? tableById.get(g.tableId) : undefined;
    const haystack = `${g.name} ${g.surname ?? ''} ${table ? tableDisplayName(table, t) : ''}`.toLowerCase();
    if (haystack.includes(q)) matched.add(g.id);
  }
  for (const id of [...matched]) {
    for (const linkedId of guestById.get(id)?.linkedGuestIds ?? []) {
      const linked = guestById.get(linkedId);
      if (linked && isVisible(linked)) matched.add(linkedId);
    }
  }
  return matched;
}

/** Tables holding at least one matched guest, or null when there's no query. */
export function tablesWithMatches(guests: Guest[], matchedIds: Set<string> | null): Set<string> | null {
  if (!matchedIds) return null;
  const tables = new Set<string>();
  for (const g of guests) {
    if (g.tableId && matchedIds.has(g.id)) tables.add(g.tableId);
  }
  return tables;
}

/** Unseated guests, narrowed to the search when one is active, sorted by first name. */
export function unseatedFor(guests: Guest[], matchedIds: Set<string> | null): Guest[] {
  const unseated = guests.filter((g) => !g.tableId);
  const shown = matchedIds ? unseated.filter((g) => matchedIds.has(g.id)) : unseated;
  return [...shown].sort((a, b) => a.name.localeCompare(b.name));
}

/** The tables to render: the tag-filtered set, narrowed to search matches while searching. */
export function tablesToRender(filtered: Table[], matchedTableIds: Set<string> | null, isSearching: boolean): Table[] {
  if (!isSearching || !matchedTableIds) return filtered;
  return filtered.filter((tb) => matchedTableIds.has(tb.id));
}
