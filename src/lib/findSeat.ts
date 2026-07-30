import type { EventState, Guest, Table, TableTag } from '../types';

/**
 * The lookup behind the guest QR screen: someone types their name at the door and has to recognise
 * *their own* row in the answer.
 *
 * A name alone doesn't do that. Two cousins called Butrinti produce two identical cards, and the
 * guest picks one at random — so every match also carries the things the planner already recorded
 * about who a guest belongs to: their group tags, the people they're linked to (partner, family,
 * the +1 they came with), the table's side, their meal. Cards that still share a name are told
 * about each other, including the common case where both sit at the same table and the ambiguity
 * turns out not to matter.
 *
 * Matching itself is accent-insensitive, because "Kyçyku" is typed "Kycyku" on half the phones
 * arriving at an Albanian wedding, and order-insensitive across name and surname.
 */

/** Below this many characters nothing is listed — this screen is public. */
export const FIND_SEAT_MIN_QUERY = 2;
/** At most this many cards are shown; the screen asks for a surname when there are more. */
export const FIND_SEAT_LIMIT = 12;

export interface SeatMatch {
  guest: Guest;
  table: Table | null;
  /** The guest's group tags ("Bride's family") — the planner's own label for who they came with. */
  tags: TableTag[];
  /** Full names of the guests this one is linked to: the strongest hint that a card is yours. */
  companions: string[];
  /**
   * Set when other shown cards carry this exact name: which of them this is, how many there are,
   * and whether they all sit at one table — in which case picking the wrong card changes nothing.
   */
  sameName?: { index: number; count: number; oneTable: boolean };
}

export interface FindSeatResult {
  matches: SeatMatch[];
  /** How many guests matched in total, including any beyond {@link FIND_SEAT_LIMIT}. */
  total: number;
}

/**
 * Normalize a name for comparison: strip accents, lower-case, collapse whitespace. Albanian ë/ç
 * decompose to e/c, so "Kycyku" finds "Kyçyku" and "Behar" finds "Behár".
 */
export function foldName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every query token must claim a *different* word, so "bu bu" doesn't match the single "Butrinti". */
function tokensClaimWords(tokens: string[], words: string[]): boolean {
  const used = new Set<number>();
  return tokens.every((token) => {
    const i = words.findIndex((word, idx) => !used.has(idx) && word.startsWith(token));
    if (i === -1) return false;
    used.add(i);
    return true;
  });
}

/**
 * How well a guest's folded full name answers the query — lower is better, `null` is no match.
 * The order matters at the door: someone who typed their whole name should see themselves first,
 * not the person whose surname happens to contain the same letters.
 */
function score(query: string, tokens: string[], folded: string): number | null {
  if (!folded) return null;
  if (folded === query) return 0; // typed in full
  if (folded.startsWith(query)) return 1; // "butrinti ky" → "Butrinti Kyçyku"
  const words = folded.split(' ').filter(Boolean);
  if (words.some((word) => word.startsWith(query))) return 2; // surname typed first
  if (tokens.length > 1 && tokensClaimWords(tokens, words)) return 3; // any order
  if (folded.includes(query)) return 4; // mid-word, the old behaviour
  return null;
}

function fullName(guest: Guest): string {
  return guest.surname ? `${guest.name} ${guest.surname}` : guest.name;
}

/**
 * Guests matching what was typed, ranked and capped, each with the extra data that tells same-named
 * guests apart. Anything shorter than {@link FIND_SEAT_MIN_QUERY} matches nothing at all.
 */
export function findSeatMatches(state: EventState, query: string): FindSeatResult {
  const folded = foldName(query);
  if (folded.length < FIND_SEAT_MIN_QUERY) return { matches: [], total: 0 };
  const tokens = folded.split(' ').filter(Boolean);

  const scored: { guest: Guest; rank: number }[] = [];
  for (const guest of state.guests) {
    const rank = score(folded, tokens, foldName(fullName(guest)));
    if (rank != null) scored.push({ guest, rank });
  }
  scored.sort((a, b) => a.rank - b.rank || a.guest.name.localeCompare(b.guest.name));

  const tableById = new Map(state.tables.map((tb) => [tb.id, tb]));
  const tagById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const guestById = new Map(state.guests.map((g) => [g.id, g]));

  const matches: SeatMatch[] = scored.slice(0, FIND_SEAT_LIMIT).map(({ guest }) => ({
    guest,
    table: guest.tableId ? (tableById.get(guest.tableId) ?? null) : null,
    tags: (guest.tagIds ?? []).map((id) => tagById.get(id)).filter((tag): tag is TableTag => !!tag),
    companions: (guest.linkedGuestIds ?? [])
      .map((id) => guestById.get(id))
      .filter((g): g is Guest => !!g)
      .map(fullName),
  }));

  annotateSameNames(matches);
  return { matches, total: scored.length };
}

/** Tell cards that share a name about each other, in the order they're shown. */
function annotateSameNames(matches: SeatMatch[]): void {
  const byName = new Map<string, SeatMatch[]>();
  for (const match of matches) {
    const key = foldName(fullName(match.guest));
    const group = byName.get(key) ?? [];
    group.push(match);
    byName.set(key, group);
  }
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    // "Same table" only counts when they are actually seated — two unseated namesakes still
    // leave the guest with a question, and saying "the same table" of no table would be a lie.
    const seatedAt = group[0].table?.id ?? null;
    const oneTable = seatedAt != null && group.every((m) => m.table?.id === seatedAt);
    group.forEach((match, i) => {
      match.sameName = { index: i + 1, count: group.length, oneTable };
    });
  }
}
