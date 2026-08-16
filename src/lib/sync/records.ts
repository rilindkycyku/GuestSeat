/**
 * An event, taken apart into the smallest pieces worth syncing on their own — and put back together.
 *
 * ---- why an event is not one record ----
 *
 * The obvious design is one row per event: the whole {@link EventState} in one `jsonb` column. It
 * works, it is simple, and it loses somebody's work the first time two devices touch the same
 * wedding without syncing in between — because the unit of conflict is then the entire event. The
 * scenario is not hypothetical for this app: the day-of check-in happens on a phone at a venue
 * (often with no signal at all) while someone else is still moving guests around on a laptop. With
 * one row per event, whichever syncs later wins and the other's evening is gone.
 *
 * So a saved event travels as many rows, exactly as FinanCarePersonal syncs a transaction rather
 * than a whole ledger:
 *
 * - one **event** record — the name, the invitation details, the tag palette, and the *order* of the
 *   guests and tables;
 * - one **guest** record per guest;
 * - one **table** record per table.
 *
 * Two devices editing different guests of the same event now both keep their edits: their rows never
 * collide. Two devices editing *the same guest* still end with the later one, which is the smallest
 * unit anybody can reasonably ask for.
 *
 * All of it is still **one database table** in the user's project — kinds and ids are columns, not
 * tables. Nothing here needs a schema change when the app grows a field.
 *
 * ---- the order list ----
 *
 * Rows are a set; a guest list is a sequence. Rather than stamp an index onto every guest (where
 * inserting one at the top would rewrite every row after it), the event record carries the two id
 * orders. Reordering is then a change to one small record, and a guest that arrives from another
 * device without being in the order yet is simply appended — nothing is ever dropped for being
 * unlisted.
 *
 * Everything here is pure, so the merge rules can be tested without a database or a network.
 */

import type { EventDetails, EventState, Guest, Table, TableTag } from '../../types';

export type RecordKind = 'event' | 'guest' | 'table';

/** The kinds a row is allowed to name — see `applyPlan`, which ignores anything else rather than
 * writing it, since the rows come back from a database the user administers themselves. */
export const RECORD_KINDS: RecordKind[] = ['event', 'guest', 'table'];

/** What the event record holds: everything about an event that is not a guest or a table. */
export interface EventMeta {
  eventName: string;
  details?: EventDetails;
  tags?: TableTag[];
  /** The app's own "last edited", shown on the picker card. Kept as the ISO string it already is. */
  updatedAt: string;
  guestOrder: string[];
  tableOrder: string[];
}

export interface SyncRecord {
  /** `${eventId}|${kind}|${id}` — the key on disk *and* the `record_id` in the cloud, so a row means
   * the same thing on both sides and a key range can scan one event's records. */
  key: string;
  eventId: string;
  kind: RecordKind;
  id: string;
  /** ms epoch of the last change; the server's own clock once the record has been through it. */
  updatedAt?: number;
  /** Changed on this device and not yet accepted by the cloud. */
  pending?: boolean;
  data: EventMeta | Guest | Table;
}

export function recordKey(eventId: string, kind: RecordKind, id: string): string {
  return `${eventId}|${kind}|${id}`;
}

/** The two halves of a key, for a row that arrived from the cloud carrying only its id. */
export function parseRecordKey(key: string): { eventId: string; kind: RecordKind; id: string } | null {
  const parts = String(key).split('|');
  if (parts.length !== 3) return null;
  const [eventId, kind, id] = parts;
  if (!eventId || !id || !RECORD_KINDS.includes(kind as RecordKind)) return null;
  return { eventId, kind: kind as RecordKind, id };
}

/** Everything about an event except its guests and tables. */
export function eventMeta(state: EventState): EventMeta {
  const meta: EventMeta = {
    eventName: state.eventName,
    updatedAt: state.updatedAt,
    guestOrder: state.guests.map((g) => g.id),
    tableOrder: state.tables.map((t) => t.id),
  };
  if (state.details) meta.details = state.details;
  if (state.tags?.length) meta.tags = state.tags;
  return meta;
}

/** One saved event, as the rows that will travel. Order in the returned list is irrelevant. */
export function decompose(eventId: string, state: EventState): SyncRecord[] {
  const records: SyncRecord[] = [
    { key: recordKey(eventId, 'event', eventId), eventId, kind: 'event', id: eventId, data: eventMeta(state) },
  ];
  for (const guest of state.guests) {
    if (!guest?.id) continue;
    records.push({ key: recordKey(eventId, 'guest', guest.id), eventId, kind: 'guest', id: guest.id, data: guest });
  }
  for (const table of state.tables) {
    if (!table?.id) continue;
    records.push({ key: recordKey(eventId, 'table', table.id), eventId, kind: 'table', id: table.id, data: table });
  }
  return records;
}

function isGuest(value: unknown): value is Guest {
  const guest = value as Partial<Guest>;
  return Boolean(guest && typeof guest === 'object' && typeof guest.name === 'string');
}

function isTable(value: unknown): value is Table {
  const table = value as Partial<Table>;
  return Boolean(table && typeof table === 'object' && typeof table.name === 'string' && Number.isFinite(table.capacity));
}

function isMeta(value: unknown): value is EventMeta {
  const meta = value as Partial<EventMeta>;
  return Boolean(meta && typeof meta === 'object' && typeof meta.eventName === 'string');
}

/** Whether a payload is usable as the kind its row claims. The database belongs to the user and can
 * be edited by hand; a row of nonsense is ignored rather than written over a real guest. */
export function validRecord(kind: RecordKind, data: unknown): boolean {
  if (kind === 'guest') return isGuest(data);
  if (kind === 'table') return isTable(data);
  return isMeta(data);
}

/**
 * The rows back into an event.
 *
 * Guests and tables come out in the order the event record gives, with anything missing from that
 * order appended — a guest another device added a second ago is in the rows before it is in the
 * order, and appending is the only answer that never drops them. Returns null without an event
 * record: a bag of guests with no event to belong to is not an event, and inventing one would put a
 * phantom on the picker.
 */
export function recompose(records: SyncRecord[]): EventState | null {
  const metaRecord = records.find((r) => r.kind === 'event');
  if (!metaRecord || !isMeta(metaRecord.data)) return null;
  const meta = metaRecord.data;

  const order = <T extends { id: string }>(list: SyncRecord[], ids: string[]): T[] => {
    const byId = new Map(list.map((r) => [r.id, r.data as unknown as T]));
    const out: T[] = [];
    for (const id of ids) {
      const item = byId.get(id);
      if (item) {
        out.push(item);
        byId.delete(id);
      }
    }
    // Whatever the order has not heard of yet, in a stable order of its own.
    for (const id of [...byId.keys()].sort()) out.push(byId.get(id)!);
    return out;
  };

  const guests = order<Guest>(
    records.filter((r) => r.kind === 'guest' && isGuest(r.data)),
    meta.guestOrder ?? []
  );
  const tables = order<Table>(
    records.filter((r) => r.kind === 'table' && isTable(r.data)),
    meta.tableOrder ?? []
  );

  const state: EventState = {
    eventName: meta.eventName,
    guests,
    tables,
    updatedAt: meta.updatedAt || new Date().toISOString(),
  };
  if (meta.tags?.length) state.tags = meta.tags;
  if (meta.details) state.details = meta.details;

  // A guest seated at a table this device no longer has would render as seated nowhere; clearing it
  // is what the board would do anyway, and it keeps the state self-consistent after a partial pull.
  const tableIds = new Set(tables.map((t) => t.id));
  state.guests = guests.map((g) => (g.tableId && !tableIds.has(g.tableId) ? { ...g, tableId: null } : g));
  return state;
}

/**
 * Key order matters to `JSON.stringify` and not to anything else, and the app rebuilds objects by
 * spreading (`{ ...guest, tableId }`), which can move a key. Sorting them makes "did this actually
 * change?" mean what it says instead of flagging every save as a change.
 */
export function stableString(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableString).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableString(v)}`).join(',')}}`;
}

export function sameData(a: unknown, b: unknown): boolean {
  return stableString(a) === stableString(b);
}

export interface RecordDiff {
  /** Only the records that actually need writing, already stamped. */
  write: SyncRecord[];
  /** Records whose payload has gone, to delete and tombstone. */
  removed: SyncRecord[];
}

/**
 * What actually changed between the rows an event had and the rows it has now.
 *
 * This runs on every save the app makes — seating one guest rewrites the whole `EventState` in
 * React, and without this every one of those saves would mark all 300 guests as changed and push
 * them. Comparing the payloads is what turns "the event was saved" into "this guest moved".
 *
 * The event record is compared like any other, so re-ordering the tables changes exactly one row.
 */
export function diffRecords(previous: SyncRecord[], next: SyncRecord[], now = Date.now()): RecordDiff {
  const before = new Map(previous.map((r) => [r.key, r]));
  const write: SyncRecord[] = [];

  for (const record of next) {
    const old = before.get(record.key);
    before.delete(record.key);
    // Unchanged: it stays exactly as it is on disk, including what it knows about the cloud. This is
    // the case for all but one or two records on a normal save, and skipping the write is the whole
    // point — a rewritten record is a record pushed.
    if (old && sameData(old.data, record.data)) continue;
    write.push({ ...record, updatedAt: now, pending: true });
  }

  // Whatever the new state no longer mentions: a deleted guest, a removed table.
  return { write, removed: [...before.values()] };
}
