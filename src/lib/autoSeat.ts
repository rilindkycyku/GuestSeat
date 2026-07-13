import type { EventState, Guest, Table } from '../types';

export interface AutoSeatResult {
  /** New seating assignments to apply: which guest goes to which table. */
  assignments: { guestId: string; tableId: string }[];
  /** How many guests were seated. */
  seated: number;
  /** How many stayed unseated because nothing fit. */
  leftUnseated: number;
}

/** A group of guests that must be seated together (linked couples / families), plus one loose guest. */
interface Party {
  guests: Guest[];
  tagIds: Set<string>;
}

/**
 * Automatically seat every currently-unseated guest, respecting table capacity, keeping linked
 * guests together, and preferring tables that match the party's tags (and the wedding side those
 * tags stand for). Guests who have declined are skipped — there's no point seating a "no".
 *
 * The heuristic is deliberately simple and predictable: build parties from the link graph, seat the
 * biggest parties first (they're the hardest to place), and for each one pick the table with the
 * best tag overlap that still has room, breaking ties toward the tightest fit so big empty tables
 * stay open for big parties. It never moves an already-seated guest.
 */
export function autoSeat(state: EventState): AutoSeatResult {
  const seatedByTable = new Map<string, number>();
  const tagsByTable = new Map<string, Set<string>>();
  for (const g of state.guests) {
    if (!g.tableId) continue;
    seatedByTable.set(g.tableId, (seatedByTable.get(g.tableId) ?? 0) + 1);
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
    for (const m of members) for (const id of m.tagIds ?? []) tagIds.add(id);
    parties.push({ guests: members, tagIds });
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

  const assignments: { guestId: string; tableId: string }[] = [];
  let leftUnseated = 0;

  for (const party of parties) {
    const size = party.guests.length;
    let best: { table: Table; score: number; slack: number } | null = null;
    for (const tb of state.tables) {
      const free = remaining.get(tb.id) ?? 0;
      if (free < size) continue;
      const pool = tablePool(tb);
      let overlap = 0;
      for (const id of party.tagIds) if (pool.has(id)) overlap++;
      const slack = free - size; // leftover seats after seating this party
      // Prefer more tag overlap; among equal overlap, prefer the tightest fit.
      const score = overlap * 1000 - slack;
      if (!best || score > best.score) best = { table: tb, score, slack };
    }
    if (!best) {
      leftUnseated += size;
      continue;
    }
    for (const m of party.guests) assignments.push({ guestId: m.id, tableId: best.table.id });
    remaining.set(best.table.id, (remaining.get(best.table.id) ?? 0) - size);
    // Fold the party's tags into the table pool so later parties cluster with them too.
    const pool = tagsByTable.get(best.table.id) ?? new Set<string>();
    for (const id of party.tagIds) pool.add(id);
    tagsByTable.set(best.table.id, pool);
  }

  return { assignments, seated: assignments.length, leftUnseated };
}
