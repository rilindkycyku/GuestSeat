import type { EventState, Guest, RsvpStatus, Table, TableSide, TagColor } from '../types';
import { makeId } from './importGuests';

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
 */

const HASH_KEY = 's';

// Payload markers (first character of the encoded string).
const MARK_COMPACT_GZIP = 'z'; // compact array form, gzip-compressed (current default)
const MARK_FULL_GZIP = 'c'; // legacy: full EventState JSON, gzip-compressed
const MARK_FULL_PLAIN = 'u'; // full EventState JSON, uncompressed (no CompressionStream support)

const COMPACT_VERSION = 1;

const SIDE_CODES: Record<TableSide, number> = { groom: 1, bride: 2 };
const SIDE_BY_CODE: Record<number, TableSide> = { 1: 'groom', 2: 'bride' };
const RSVP_CODES: Record<RsvpStatus, number> = { confirmed: 1, declined: 2 };
const RSVP_BY_CODE: Record<number, RsvpStatus> = { 1: 'confirmed', 2: 'declined' };

type CompactTable = [name: string, capacity: number, side: number, autoSuffix: string, tagIdx: number[]];
type CompactTag = [label: string, color: string];
type CompactGuest = [
  name: string,
  surname: string,
  tableIdx: number,
  rsvp: number,
  notes: string,
  linkedIdx: number[],
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

  const cTables: CompactTable[] = tables.map((tb) => [
    tb.name,
    tb.capacity,
    tb.side ? SIDE_CODES[tb.side] : 0,
    tb.autoSuffix ?? '',
    (tb.tagIds ?? []).map((id) => tagIndex.get(id)).filter((i): i is number => i != null),
  ]);
  const cTags: CompactTag[] = tags.map((tg) => [tg.label, tg.color]);
  const cGuests: CompactGuest[] = state.guests.map((g) => [
    g.name,
    g.surname ?? '',
    g.tableId != null && tableIndex.has(g.tableId) ? tableIndex.get(g.tableId)! : -1,
    g.rsvp ? RSVP_CODES[g.rsvp] : 0,
    g.notes ?? '',
    (g.linkedGuestIds ?? []).map((id) => guestIndex.get(id)).filter((i): i is number => i != null),
  ]);

  return [COMPACT_VERSION, state.eventName, cTables, cTags, cGuests, state.details ?? null, state.updatedAt];
}

/** Rebuild a full EventState from the compact array form, regenerating fresh ids. */
function fromCompact(data: CompactState): EventState | null {
  const [version, eventName, cTables, cTags, cGuests, details, updatedAt] = data;
  if (version !== COMPACT_VERSION || !Array.isArray(cTables) || !Array.isArray(cGuests)) return null;

  const tagIds = (cTags ?? []).map(() => makeId('tag'));
  const tags = (cTags ?? []).map(([label, color], i) => ({ id: tagIds[i], label, color: color as TagColor }));

  const tableIds = cTables.map(() => makeId('t'));
  const tables: Table[] = cTables.map(([name, capacity, side, autoSuffix, tagIdx], i) => {
    const tb: Table = { id: tableIds[i], name, capacity };
    if (side && SIDE_BY_CODE[side]) tb.side = SIDE_BY_CODE[side];
    if (autoSuffix) tb.autoSuffix = autoSuffix;
    const ids = (tagIdx ?? []).map((ti) => tagIds[ti]).filter((id): id is string => !!id);
    if (ids.length) tb.tagIds = ids;
    return tb;
  });

  const guestIds = cGuests.map(() => makeId('g'));
  const guests: Guest[] = cGuests.map(([name, surname, tableIdx, rsvp, notes, linkedIdx], i) => {
    const g: Guest = {
      id: guestIds[i],
      name,
      tableId: tableIdx != null && tableIdx >= 0 ? tableIds[tableIdx] ?? null : null,
    };
    if (surname) g.surname = surname;
    if (notes) g.notes = notes;
    if (rsvp && RSVP_BY_CODE[rsvp]) g.rsvp = RSVP_BY_CODE[rsvp];
    const links = (linkedIdx ?? []).map((li) => guestIds[li]).filter((id): id is string => !!id);
    if (links.length) g.linkedGuestIds = links;
    return g;
  });

  return { eventName, guests, tables, tags, details: details ?? undefined, updatedAt };
}

const hasCompression =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
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

/** Build a shareable URL for the current page that encodes the given state in its hash. */
export async function encodeStateToLink(state: EventState): Promise<string> {
  // Compact + gzip when the browser supports it — the only form small enough to fit a big
  // list into a QR code. Fall back to plain full JSON only when CompressionStream is missing.
  const payload = hasCompression
    ? MARK_COMPACT_GZIP + toBase64Url(await gzip(JSON.stringify(toCompact(state))))
    : MARK_FULL_PLAIN + toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${payload}`;
  return url.toString();
}

/** Decode a share payload (the value of `#s=...`) back into an EventState, or null if invalid. */
export async function decodeSharedState(payload: string): Promise<EventState | null> {
  try {
    const marker = payload[0];
    const bytes = fromBase64Url(payload.slice(1));
    const json =
      marker === MARK_COMPACT_GZIP || marker === MARK_FULL_GZIP ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (marker === MARK_COMPACT_GZIP) return fromCompact(parsed as CompactState);
    // Legacy full-JSON payloads ('c' / 'u').
    if (!parsed || !Array.isArray(parsed.guests) || !Array.isArray(parsed.tables)) return null;
    return parsed as EventState;
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

/** Strip the share payload from the URL so a refresh doesn't re-trigger the import prompt. */
export function clearShareParam(): void {
  const url = new URL(window.location.href);
  window.history.replaceState(null, '', url.pathname + url.search);
}
