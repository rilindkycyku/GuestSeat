import type { EventState, Guest, RsvpStatus, Table, TableShape, TableSide, TagColor } from '../types';
import { makeEventState, makeId, parseImportedJson } from './importGuests';

/**
 * Share links carry a full EventState snapshot in the URL hash, so a guest list can be
 * shared just by sending a link — the recipient's app decodes it and offers to load it,
 * with no manual JSON import. The payload lives in the hash (`#s=...`) so it never reaches
 * a server. When the browser supports gzip streams the JSON is compressed first, which
 * keeps links short enough for typical wedding lists.
 *
 * The state is first re-serialized into a *compact* form (see {@link toCompact}): random
 * per-item ids — which are high-entropy and don't compress — are dropped in favour of array
 * indices, and every field name is stripped. This shrinks a ~200-guest list roughly 3× versus
 * the raw JSON, which is the difference between a link that fits in a QR code and one that
 * doesn't. Ids are regenerated on decode; they only need to be internally consistent.
 *
 * The compressed bytes are then encoded with {@link toBase42} rather than base64. base42 uses
 * only characters from QR's *alphanumeric* set (digits, upper-case letters, a few symbols),
 * which lets the QR encoder use its high-capacity alphanumeric mode (~4,296 chars) instead of
 * byte mode (~2,953) — worth ~45% more data, enough to push a ~500-guest list into a single
 * scannable QR with no server. The alphabet is also URL-fragment-safe, so the same string
 * lives directly in the link. See {@link toQrPayloadUrl} for the matching QR-side trick.
 */

const HASH_KEY = 's';
// Marks a link built for guests rather than for a co-planner: the app opens it straight into the
// find-your-seat lookup instead of offering to import the plan. It rides in the hash alongside the
// payload, so a guest link still reaches no server, and an older app simply ignores the extra key.
const FIND_KEY = 'f';

// Payload markers (first character of the encoded string). Current markers are upper-case so
// they sit inside QR alphanumeric mode alongside the base42 body; the lower-case markers are
// older base64 payloads we still decode for links shared before the base42 switch.
const MARK_COMPACT_GZIP_B42 = 'A'; // compact array form, gzip-compressed, base42 (current default)
const MARK_FULL_PLAIN_B42 = 'B'; // full EventState JSON, uncompressed, base42 (no CompressionStream)
const MARK_COMPACT_GZIP = 'z'; // legacy: compact array form, gzip-compressed, base64
const MARK_FULL_GZIP = 'c'; // legacy: full EventState JSON, gzip-compressed, base64
// (legacy 'u' = full JSON, uncompressed base64 — still decoded, handled by the default branch)

const COMPACT_VERSION = 1;

const SIDE_CODES: Record<TableSide, number> = { groom: 1, bride: 2 };
const SIDE_BY_CODE: Record<number, TableSide> = { 1: 'groom', 2: 'bride' };
const RSVP_CODES: Record<RsvpStatus, number> = { confirmed: 1, declined: 2 };
const RSVP_BY_CODE: Record<number, RsvpStatus> = { 1: 'confirmed', 2: 'declined' };
const SHAPE_CODES: Record<TableShape, number> = { round: 1, long: 2 };
const SHAPE_BY_CODE: Record<number, TableShape> = { 1: 'round', 2: 'long' };

// How many entries the first published version of each tuple had. Entries beyond these are the
// later additions, and only they may be trimmed away when empty — an older decoder reads tuple
// positions, so dropping an early entry would shift everything after it.
const TABLE_ARITY_V1 = 5;
const GUEST_ARITY_V1 = 6;

/**
 * Drop trailing empty entries — `''`, `0`, or `[]` — from a tuple, never cutting into its first
 * `keepFirst` positions. This is what keeps the appended fields free: a guest with no meal, tags
 * or feuds encodes to exactly the tuple it did before those fields existed.
 */
function trimTail<T extends unknown[]>(tuple: T, keepFirst: number): unknown[] {
  const out: unknown[] = tuple.slice();
  while (out.length > keepFirst) {
    const last = out[out.length - 1];
    const empty = last === '' || last === 0 || (Array.isArray(last) && last.length === 0);
    if (!empty) break;
    out.pop();
  }
  return out;
}

type CompactTable = [
  name: string,
  capacity: number,
  side: number,
  autoSuffix: string,
  tagIdx: number[],
  // Appended after v1 shipped — see the note on {@link CompactGuest}.
  shape?: number,
];
type CompactTag = [label: string, color: string];
/**
 * A guest as a positional tuple. Entries after `linkedIdx` were appended once the format was
 * already in the wild, and deliberately *without* bumping {@link COMPACT_VERSION}: a decoder that
 * predates them ignores the extra entries, while this one treats missing entries as empty. Bumping
 * the version instead would make every already-deployed copy of the app reject new links outright
 * (`fromCompact` rejects an unknown version), which is a worse failure than an older client not
 * showing meal choices. Trailing empty entries are trimmed on encode, so a list that uses none of
 * these fields produces exactly the same bytes — and the same QR size — as before.
 */
type CompactGuest = [
  name: string,
  surname: string,
  tableIdx: number,
  rsvp: number,
  notes: string,
  linkedIdx: number[],
  tagIdx?: number[],
  meal?: string,
  arrived?: number,
  apartIdx?: number[],
];
type CompactState = [
  version: number,
  eventName: string,
  tables: CompactTable[],
  tags: CompactTag[],
  guests: CompactGuest[],
  details: EventState['details'] | null,
  updatedAt: string,
];

/** Re-serialize an EventState into the index-based compact array form used inside share links. */
function toCompact(state: EventState): CompactState {
  const tables = state.tables;
  const tags = state.tags ?? [];
  const tableIndex = new Map(tables.map((tb, i) => [tb.id, i]));
  const tagIndex = new Map(tags.map((tg, i) => [tg.id, i]));
  const guestIndex = new Map(state.guests.map((g, i) => [g.id, i]));

  const tagRefs = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => tagIndex.get(id)).filter((i): i is number => i != null);
  const guestRefs = (ids: string[] | undefined) =>
    (ids ?? []).map((id) => guestIndex.get(id)).filter((i): i is number => i != null);

  const cTables = tables.map(
    (tb) =>
      trimTail(
        [
          tb.name,
          tb.capacity,
          tb.side ? SIDE_CODES[tb.side] : 0,
          tb.autoSuffix ?? '',
          tagRefs(tb.tagIds),
          tb.shape ? SHAPE_CODES[tb.shape] : 0,
        ],
        TABLE_ARITY_V1
      ) as CompactTable
  );
  const cTags: CompactTag[] = tags.map((tg) => [tg.label, tg.color]);
  const cGuests = state.guests.map(
    (g) =>
      trimTail(
        [
          g.name,
          g.surname ?? '',
          g.tableId != null && tableIndex.has(g.tableId) ? tableIndex.get(g.tableId)! : -1,
          g.rsvp ? RSVP_CODES[g.rsvp] : 0,
          g.notes ?? '',
          guestRefs(g.linkedGuestIds),
          tagRefs(g.tagIds),
          g.meal ?? '',
          g.arrived ? 1 : 0,
          guestRefs(g.apartGuestIds),
        ],
        GUEST_ARITY_V1
      ) as CompactGuest
  );

  return [COMPACT_VERSION, state.eventName, cTables, cTags, cGuests, state.details ?? null, state.updatedAt];
}

/** Rebuild a full EventState from the compact array form, regenerating fresh ids. */
function fromCompact(data: CompactState): EventState | null {
  const [version, eventName, cTables, cTags, cGuests, details, updatedAt] = data;
  if (version !== COMPACT_VERSION || !Array.isArray(cTables) || !Array.isArray(cGuests)) return null;

  const tagIds = (cTags ?? []).map(() => makeId('tag'));
  const tags = (cTags ?? []).map(([label, color], i) => ({ id: tagIds[i], label, color: color as TagColor }));

  const tableIds = cTables.map(() => makeId('t'));
  const tables: Table[] = cTables.map(([name, capacity, side, autoSuffix, tagIdx, shape], i) => {
    const tb: Table = { id: tableIds[i], name, capacity };
    if (side && SIDE_BY_CODE[side]) tb.side = SIDE_BY_CODE[side];
    if (autoSuffix) tb.autoSuffix = autoSuffix;
    const ids = (tagIdx ?? []).map((ti) => tagIds[ti]).filter((id): id is string => !!id);
    if (ids.length) tb.tagIds = ids;
    if (shape && SHAPE_BY_CODE[shape]) tb.shape = SHAPE_BY_CODE[shape];
    return tb;
  });

  const guestIds = cGuests.map(() => makeId('g'));
  const resolve = (idx: number[] | undefined, pool: string[]) =>
    (idx ?? []).map((i) => pool[i]).filter((id): id is string => !!id);
  const guests: Guest[] = cGuests.map(
    ([name, surname, tableIdx, rsvp, notes, linkedIdx, tagIdx, meal, arrived, apartIdx], i) => {
      const g: Guest = {
        id: guestIds[i],
        name,
        tableId: tableIdx != null && tableIdx >= 0 ? (tableIds[tableIdx] ?? null) : null,
      };
      if (surname) g.surname = surname;
      if (notes) g.notes = notes;
      if (rsvp && RSVP_BY_CODE[rsvp]) g.rsvp = RSVP_BY_CODE[rsvp];
      const links = resolve(linkedIdx, guestIds);
      if (links.length) g.linkedGuestIds = links;
      const apart = resolve(apartIdx, guestIds);
      if (apart.length) g.apartGuestIds = apart;
      const guestTagIds = resolve(tagIdx, tagIds);
      if (guestTagIds.length) g.tagIds = guestTagIds;
      if (typeof meal === 'string' && meal) g.meal = meal;
      if (arrived) g.arrived = true;
      return g;
    }
  );

  return { eventName, guests, tables, tags, details: details ?? undefined, updatedAt };
}

const hasCompression = typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 42 characters that are BOTH in QR's alphanumeric set and safe to drop straight into a URL
// fragment (no space, %, or + — which a URL parser would mangle). Two bytes map to three
// base42 chars (little-endian), a trailing odd byte to two — the same scheme as RFC 9285
// base45, narrowed to a URL-safe alphabet (42³ = 74088 ≥ 65536, so two bytes still fit).
const B42_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-:/*$';
const B42_REVERSE: Record<string, number> = {};
for (let i = 0; i < B42_ALPHABET.length; i++) B42_REVERSE[B42_ALPHABET[i]] = i;

function toBase42(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let v = bytes[i] * 256 + bytes[i + 1];
      out += B42_ALPHABET[v % 42];
      v = Math.floor(v / 42);
      out += B42_ALPHABET[v % 42];
      out += B42_ALPHABET[Math.floor(v / 42)];
    } else {
      const v = bytes[i];
      out += B42_ALPHABET[v % 42];
      out += B42_ALPHABET[Math.floor(v / 42)];
    }
  }
  return out;
}

function fromBase42(text: string): Uint8Array<ArrayBuffer> {
  const out: number[] = [];
  let i = 0;
  for (; i + 3 <= text.length; i += 3) {
    const v = B42_REVERSE[text[i]] + B42_REVERSE[text[i + 1]] * 42 + B42_REVERSE[text[i + 2]] * 1764;
    out.push(Math.floor(v / 256), v % 256);
  }
  if (text.length - i === 2) {
    out.push(B42_REVERSE[text[i]] + B42_REVERSE[text[i + 1]] * 42);
  }
  const bytes = new Uint8Array(out.length);
  bytes.set(out);
  return bytes;
}

/**
 * Rewrite a share link into the exact string to encode in a QR code. Hosts and schemes are
 * case-insensitive, so upper-casing them keeps the whole prefix inside QR alphanumeric mode
 * (the base42 fragment is already upper-case), which — together with base42 — is what lets a
 * big list fit. The returned string opens to the same page; only the QR uses it, the copyable
 * link stays in its normal lower-case form.
 */
export function toQrPayloadUrl(link: string): string {
  try {
    const u = new URL(link);
    return `${u.protocol}//${u.host}`.toUpperCase() + u.pathname + u.search + u.hash;
  } catch {
    return link;
  }
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/**
 * Build a shareable URL for the current page that encodes the given state in its hash.
 *
 * `forGuests` marks the link as a guest link (see {@link FIND_KEY}) — the same payload, opened into
 * the seat lookup rather than an import prompt.
 */
export async function encodeStateToLink(state: EventState, forGuests = false): Promise<string> {
  // Compact + gzip when the browser supports it — the only form small enough to fit a big
  // list into a QR code. Fall back to plain full JSON only when CompressionStream is missing.
  // Either way the bytes are base42-encoded so the QR can use its alphanumeric mode.
  const payload = hasCompression
    ? MARK_COMPACT_GZIP_B42 + toBase42(await gzip(JSON.stringify(toCompact(state))))
    : MARK_FULL_PLAIN_B42 + toBase42(new TextEncoder().encode(JSON.stringify(state)));
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${payload}${forGuests ? `&${FIND_KEY}=1` : ''}`;
  return url.toString();
}

/** Decode a share payload (the value of `#s=...`) back into an EventState, or null if invalid. */
export async function decodeSharedState(payload: string): Promise<EventState | null> {
  try {
    const marker = payload[0];
    const body = payload.slice(1);
    // base42 markers ('A'/'B') are the current form; the base64 markers ('z'/'c'/'u') decode
    // links shared before the switch. Compact payloads ('A'/'z') are gzip-compressed.
    const isB42 = marker === MARK_COMPACT_GZIP_B42 || marker === MARK_FULL_PLAIN_B42;
    const bytes = isB42 ? fromBase42(body) : fromBase64Url(body);
    const compressed = marker === MARK_COMPACT_GZIP_B42 || marker === MARK_COMPACT_GZIP || marker === MARK_FULL_GZIP;
    const json = compressed ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (marker === MARK_COMPACT_GZIP_B42 || marker === MARK_COMPACT_GZIP) return fromCompact(parsed as CompactState);
    // Full-JSON payloads ('B' / legacy 'c' / 'u'). A link's hash is the easiest part of the app for
    // anyone to hand-edit, so the payload goes through the same field-by-field validation as an
    // imported file rather than being cast into state on trust.
    if (!parsed || !Array.isArray(parsed.guests) || !Array.isArray(parsed.tables)) return null;
    return makeEventState(parseImportedJson(parsed));
  } catch {
    return null;
  }
}

/** Read the share payload from the current URL hash, if one is present. */
export function readShareParam(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash).get(HASH_KEY);
}

/** True when the URL's share payload is a guest link, i.e. it should open the seat lookup. */
export function readFindSeatFlag(): boolean {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return false;
  return new URLSearchParams(hash).get(FIND_KEY) === '1';
}

/** Strip the share payload from the URL so a refresh doesn't re-trigger the import prompt. */
export function clearShareParam(): void {
  const url = new URL(window.location.href);
  window.history.replaceState(null, '', url.pathname + url.search);
}
