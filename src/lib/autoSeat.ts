import type { EventState, Guest, Table } from '../types';

/** Why a party stayed unseated: nothing had room, or the only roomy tables held someone to avoid. */
export type UnplacedReason = 'noRoom' | 'keepApart';

export interface AutoSeatResult {
  /** New seating assignments to apply: which guest goes to which table. */
  assignments: { guestId: string; tableId: string }[];
  /** How many guests were seated. */
  seated: number;
  /** How many stayed unseated because nothing fit. */
  leftUnseated: number;
  /**
   * Who stayed unseated, grouped by party so a family reads as one entry, with the reason. A bare
   * count tells someone that seating failed; this tells them what to go and fix.
   */
  unplaced: { names: string[]; reason: UnplacedReason }[];
}

/** A group of guests that must be seated together (linked couples / families), plus one loose guest. */
interface Party {
  guests: Guest[];
  tagIds: Set<string>;
  /** Guests nobody in this party may share a table with (the union of their keep-apart lists). */
  avoid: Set<string>;
}

function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
}

/**
 * Automatically seat every currently-unseated guest, respecting table capacity, keeping linked
 * guests together, keeping feuding guests apart, and preferring tables that match the party's tags
 * (and the wedding side those tags stand for). Guests who have declined are skipped — there's no
 * point seating a "no".
 *
 * The heuristic is deliberately simple and predictable: build parties from the link graph, seat the
 * biggest parties first (they're the hardest to place), and for each one pick the table with the
 * best tag overlap that still has room and holds nobody the party must avoid, breaking ties toward
 * the tightest fit so big empty tables stay open for big parties. It never moves an already-seated
 * guest — which also means a keep-apart pair someone seated together by hand is left alone; the
 * board flags that rather than this quietly rearranging their work.
 *
 * A party that is linked *and* kept apart internally is contradictory. Links win, because they model
 * couples and families who arrive together; the guest editor won't let such a pair be created, so
 * this only comes up for data arriving from a file.
 */
export function autoSeat(state: EventState): AutoSeatResult {
  const seatedByTable = new Map<string, number>();
  const tagsByTable = new Map<string, Set<string>>();
  // Who sits where, so a table holding someone a party must avoid can be ruled out.
  const occupantsByTable = new Map<string, Set<string>>();
  for (const g of state.guests) {
    if (!g.tableId) continue;
    seatedByTable.set(g.tableId, (seatedByTable.get(g.tableId) ?? 0) + 1);
    const occupants = occupantsByTable.get(g.tableId) ?? new Set<string>();
    occupants.add(g.id);
    occupantsByTable.set(g.tableId, occupants);
    if (g.tagIds?.length) {
      const set = tagsByTable.get(g.tableId) ?? new Set<string>();
      for (const id of g.tagIds) set.add(id);
      tagsByTable.set(g.tableId, set);
    }
  }

  // Remaining free seats per table, seeded from capacity minus who's already there.
  const remaining = new Map<string, number>();
  for (const tb of state.tables) {
    remaining.set(tb.id, Math.max(0, tb.capacity - (seatedByTable.get(tb.id) ?? 0)));
  }

  const guestById = new Map(state.guests.map((g) => [g.id, g]));
  const toSeat = state.guests.filter((g) => !g.tableId && g.rsvp !== 'declined');

  // Build parties as connected components over linkedGuestIds, restricted to the guests we're seating.
  const seatable = new Set(toSeat.map((g) => g.id));
  const visited = new Set<string>();
  const parties: Party[] = [];
  for (const g of toSeat) {
    if (visited.has(g.id)) continue;
    const members: Guest[] = [];
    const stack = [g.id];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id) || !seatable.has(id)) continue;
      visited.add(id);
      const member = guestById.get(id);
      if (!member) continue;
      members.push(member);
      for (const linked of member.linkedGuestIds ?? []) {
        if (!visited.has(linked) && seatable.has(linked)) stack.push(linked);
      }
    }
    const tagIds = new Set<string>();
    const avoid = new Set<string>();
    for (const m of members) {
      for (const id of m.tagIds ?? []) tagIds.add(id);
      for (const id of m.apartGuestIds ?? []) avoid.add(id);
    }
    // Someone linked into the party can't also be avoided by it — links win (see the note above).
    for (const m of members) avoid.delete(m.id);
    parties.push({ guests: members, tagIds, avoid });
  }

  // Hardest-to-place (largest) parties first.
  parties.sort((a, b) => b.guests.length - a.guests.length);

  // A table's tag pool for matching = its own tags, its wedding side, and any tags already on
  // guests seated there — so a party joins people it shares a group with.
  const tablePool = (tb: Table): Set<string> => {
    const pool = new Set<string>(tb.tagIds ?? []);
    if (tb.side) pool.add(tb.side);
    for (const id of tagsByTable.get(tb.id) ?? []) pool.add(id);
    return pool;
  };

  /** True when the table already holds someone this party must not share a table with. */
  const blockedByFeud = (party: Party, tableId: string): boolean => {
    const occupants = occupantsByTable.get(tableId);
    if (!occupants?.size) return false;
    for (const id of party.avoid) if (occupants.has(id)) return true;
    // The other direction too, in case a file arrived with a one-sided keep-apart.
    const partyIds = new Set(party.guests.map((m) => m.id));
    for (const id of occupants) {
      for (const avoided of guestById.get(id)?.apartGuestIds ?? []) {
        if (partyIds.has(avoided)) return true;
      }
    }
    return false;
  };

  const assignments: { guestId: string; tableId: string }[] = [];
  const unplaced: { names: string[]; reason: UnplacedReason }[] = [];
  let leftUnseated = 0;

  for (const party of parties) {
    const size = party.guests.length;
    let best: { table: Table; score: number } | null = null;
    // Tracked so an unplaced party can say *why*: "nothing had room" and "there was room, but only
    // at tables holding someone they must avoid" call for different fixes.
    let roomButFeuding = false;
    for (const tb of state.tables) {
      const free = remaining.get(tb.id) ?? 0;
      if (free < size) continue;
      if (blockedByFeud(party, tb.id)) {
        roomButFeuding = true;
        continue;
      }
      const pool = tablePool(tb);
      let overlap = 0;
      for (const id of party.tagIds) if (pool.has(id)) overlap++;
      const slack = free - size; // leftover seats after seating this party
      // Prefer more tag overlap; among equal overlap, prefer the tightest fit.
      const score = overlap * 1000 - slack;
      if (!best || score > best.score) best = { table: tb, score };
    }
    if (!best) {
      leftUnseated += size;
      unplaced.push({
        names: party.guests.map(fullName).sort((a, b) => a.localeCompare(b)),
        reason: roomButFeuding ? 'keepApart' : 'noRoom',
      });
      continue;
    }
    const tableId = best.table.id;
    for (const m of party.guests) assignments.push({ guestId: m.id, tableId });
    remaining.set(tableId, (remaining.get(tableId) ?? 0) - size);
    // Fold the party into the table's pools so later parties cluster with them — and so a feud with
    // anyone just seated here is honoured for the rest of the run.
    const pool = tagsByTable.get(tableId) ?? new Set<string>();
    for (const id of party.tagIds) pool.add(id);
    tagsByTable.set(tableId, pool);
    const occupants = occupantsByTable.get(tableId) ?? new Set<string>();
    for (const m of party.guests) occupants.add(m.id);
    occupantsByTable.set(tableId, occupants);
  }

  return { assignments, seated: assignments.length, leftUnseated, unplaced };
}

/**
 * Keep-apart pairs currently sharing a table. Auto-seating avoids creating these, but seating by
 * hand is allowed to — so the board can point them out instead of refusing the drop.
 */
export function seatedFeuds(guests: Guest[]): Map<string, Guest[]> {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const out = new Map<string, Guest[]>();
  for (const g of guests) {
    if (!g.tableId || !g.apartGuestIds?.length) continue;
    const clashes = g.apartGuestIds
      .map((id) => byId.get(id))
      .filter((other): other is Guest => !!other && other.tableId === g.tableId);
    if (clashes.length) out.set(g.id, clashes);
  }
  return out;
}
