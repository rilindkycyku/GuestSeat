import type { EventState, EventType } from '../types';
import { diffRecords, decompose, recompose, type RecordKind, type SyncRecord } from './sync/records';

/**
 * IndexedDB-backed persistence for GuestSeat.
 *
 * The app used to keep a single event in localStorage under `guestseat.state.v1`. That capped us
 * at one list and at localStorage's ~5 MB string quota. IndexedDB lets us store *many* events —
 * each a full {@link EventState} — so a planner can close one wedding, open another, and come back
 * to either anytime. Events live in the `events` object store keyed by a short opaque id; the id of
 * the event currently open is remembered in the tiny `meta` store so the app reopens where you left.
 *
 * ---- the shadow the sync casts ----
 *
 * The board reads and writes whole events, and nothing about that changed. But an event is not the
 * right unit to *sync*: two devices touching the same wedding would then overwrite each other
 * wholesale. So every write also maintains a second store, `records`, holding the same event taken
 * apart into the pieces that travel — the event's own details, one row per guest, one row per table
 * (see lib/sync/records.ts).
 *
 * `events` is what the app reads. `records` is what the cloud sees. {@link putEvent} keeps them in
 * step by *diffing*: seating one guest rewrites the whole `EventState` in React, and without the
 * diff every save would mark all 300 guests as changed and push them. Sync writes the other way —
 * records in, then {@link rebuildEvents} recomposes the event the board reads.
 *
 * Two fields on each record make the merge possible:
 *
 * - **when** it last changed (`updatedAt`) — the server's own clock once it has been through the
 *   cloud, so two devices are never compared through two different clocks;
 * - **whether the cloud has it yet** (`pending`) — a flag rather than a date comparison, because a
 *   phone whose clock is an hour behind still knows perfectly well *that* it changed something.
 *
 * Deleting needs the same care: a deleted record leaves a **tombstone** in the `deletions` store.
 * Without one, the next sync would see a row in the cloud and nothing here, conclude this device had
 * never received it, and download it straight back — deleting anything would be impossible.
 */

const DB_NAME = 'guestseat';
const DB_VERSION = 3;
const EVENTS_STORE = 'events';
const META_STORE = 'meta';
const RECORDS_STORE = 'records';
const DELETIONS_STORE = 'deletions';
const ACTIVE_ID_KEY = 'activeId';

/** The legacy single-event localStorage key, migrated into IndexedDB on first run. */
const LEGACY_STATE_KEY = 'guestseat.state.v1';

/**
 * The timestamp given to records that predate sync: the oldest one there is, rather than "now".
 *
 * An event saved before this release has no record rows at all, and when they are first built,
 * something has to be chosen or they can never be compared with anything. "Now" is the tempting
 * answer and the wrong one: on a device joining a cloud copy it has already synced with, stamping
 * its untouched rows at the moment of the first sync would make them look newer than the versions
 * the cloud has been holding, and the join would push stale copies over real work.
 *
 * Dated to (almost) the epoch instead, such a record loses every comparison and wins nothing it
 * should not: anything the cloud holds for the same key is by definition a later edit, and anything
 * the cloud has never seen still gets pushed.
 */
export const TIME_BEFORE_SYNC = 1;

/** One saved event as the board reads it. */
export interface StoredEvent {
  id: string;
  state: EventState;
}

/** A deleted record, kept so the deletion can travel to the other devices. */
export interface Tombstone {
  /** The record's key — `${eventId}|${kind}|${id}` — and its `record_id` in the cloud. */
  key: string;
  eventId: string;
  kind: RecordKind;
  id: string;
  updatedAt: number;
  pending: boolean;
}

/** A lightweight row for the events list — enough to render a picker card without loading every guest. */
export interface EventSummary {
  id: string;
  eventName: string;
  updatedAt: string;
  guestCount: number;
  tableCount: number;
  eventType?: EventType;
}

export function summarize(rec: StoredEvent): EventSummary {
  return {
    id: rec.id,
    eventName: rec.state.eventName,
    updatedAt: rec.state.updatedAt,
    guestCount: rec.state.guests.length,
    tableCount: rec.state.tables.length,
    eventType: rec.state.details?.eventType,
  };
}

/**
 * "Something in this browser's events just changed." Announced by every ordinary write below and
 * listened to by automatic sync (hooks/useSync.ts), which is what lets a guest seated on the phone
 * reach the laptop without anyone pressing a button.
 *
 * Deliberately announced from the database rather than from the components: there is one write path
 * and a dozen callers. Writes made *by* sync go through the `*Raw` helpers and stay silent, so
 * applying a downloaded change never schedules another sync to announce it back.
 */
const changeListeners = new Set<() => void>();

export function onLocalChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => {
    changeListeners.delete(fn);
  };
}

function announceChange(): void {
  changeListeners.forEach((fn) => fn());
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE)) db.createObjectStore(EVENTS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
      // v2 added tombstones; v3 the record rows they belong to. Both are empty until the first write
      // or the first sync, which builds the rows for events saved before either existed.
      if (!db.objectStoreNames.contains(DELETIONS_STORE)) db.createObjectStore(DELETIONS_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(RECORDS_STORE)) db.createObjectStore(RECORDS_STORE, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Run `body` inside a transaction on `store` and resolve once the transaction commits. */
function withStore<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = body(tx.objectStore(store));
        let result: T | undefined;
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/** The same across several stores, for the writes that must not half-happen — a deletion and its
 * tombstone, above all: one without the other is undone by the very next sync. */
function withStores(
  stores: string[],
  mode: IDBTransactionMode,
  body: (...stores: IDBObjectStore[]) => void
): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        body(...stores.map((name) => tx.objectStore(name)));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/** Every record belonging to one event. The key's `${eventId}|` prefix is what makes this a range
 * scan rather than a walk over every guest of every event. */
function eventRange(eventId: string): IDBKeyRange {
  return IDBKeyRange.bound(`${eventId}|`, `${eventId}|￿`);
}

export function getAllEvents(): Promise<StoredEvent[]> {
  return withStore<StoredEvent[]>(EVENTS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredEvent[]>).then(
    (all) => all ?? []
  );
}

export function getEvent(id: string): Promise<StoredEvent | undefined> {
  return withStore<StoredEvent>(EVENTS_STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredEvent>);
}

export function getAllRecords(): Promise<SyncRecord[]> {
  return withStore<SyncRecord[]>(RECORDS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<SyncRecord[]>).then(
    (all) => all ?? []
  );
}

export function getEventRecords(eventId: string): Promise<SyncRecord[]> {
  return withStore<SyncRecord[]>(RECORDS_STORE, 'readonly', (s) => s.getAll(eventRange(eventId)) as IDBRequest<SyncRecord[]>).then(
    (all) => all ?? []
  );
}

/**
 * Saves an event as a change made *here*, and works out what actually changed inside it.
 *
 * Every ordinary write in the app goes through this. The board hands over a whole `EventState`
 * because that is how React holds it; what reaches the cloud is only the rows whose contents
 * differ — one guest, or one table, or just the event's name.
 *
 * All of it in a single transaction: the event the board reads, the rows the cloud sees and the
 * tombstones for whatever was removed either land together or not at all.
 */
export function putEvent(rec: StoredEvent): Promise<void> {
  const next = decompose(rec.id, rec.state);
  const now = Date.now();
  return openDb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([EVENTS_STORE, RECORDS_STORE, DELETIONS_STORE], 'readwrite');
          const events = tx.objectStore(EVENTS_STORE);
          const records = tx.objectStore(RECORDS_STORE);
          const deletions = tx.objectStore(DELETIONS_STORE);

          events.put({ id: rec.id, state: rec.state });
          const existing = records.getAll(eventRange(rec.id)) as IDBRequest<SyncRecord[]>;
          existing.onsuccess = () => {
            const { write, removed } = diffRecords(existing.result ?? [], next, now);
            for (const record of write) {
              records.put(record);
              // It exists again: a tombstone left over from an undone delete would otherwise travel
              // out and delete it everywhere.
              deletions.delete(record.key);
            }
            for (const record of removed) {
              records.delete(record.key);
              deletions.put({
                key: record.key,
                eventId: record.eventId,
                kind: record.kind,
                id: record.id,
                updatedAt: now,
                pending: true,
              });
            }
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    )
    .then(() => {
      announceChange();
    });
}

/** Writes the event the board reads, without touching the rows the cloud sees. For the sync path,
 * which has just written those rows itself. */
export function putEventRaw(rec: StoredEvent): Promise<void> {
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    s.put(rec);
  }).then(() => undefined);
}

/**
 * Deletes an event, every row it was made of, and leaves a tombstone for each.
 *
 * The cascade is the point: a guest row left behind in the cloud would be downloaded by the next
 * device as a guest belonging to an event that no longer exists. One transaction, so an interrupted
 * delete cannot leave the event gone and its guests still travelling.
 */
export function deleteEventRecord(id: string): Promise<void> {
  const now = Date.now();
  return openDb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([EVENTS_STORE, RECORDS_STORE, DELETIONS_STORE], 'readwrite');
          const records = tx.objectStore(RECORDS_STORE);
          const deletions = tx.objectStore(DELETIONS_STORE);
          tx.objectStore(EVENTS_STORE).delete(id);

          const existing = records.getAll(eventRange(id)) as IDBRequest<SyncRecord[]>;
          existing.onsuccess = () => {
            for (const record of existing.result ?? []) {
              records.delete(record.key);
              deletions.put({
                key: record.key,
                eventId: record.eventId,
                kind: record.kind,
                id: record.id,
                updatedAt: now,
                pending: true,
              });
            }
          };

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    )
    .then(() => {
      announceChange();
    });
}

/** Writes rows exactly as given, keeping their own `updatedAt` — the sync apply path. */
export function putRecordsRaw(records: SyncRecord[]): Promise<void> {
  if (records.length === 0) return Promise.resolve();
  return withStore(RECORDS_STORE, 'readwrite', (s) => {
    records.forEach((record) => s.put(record));
  }).then(() => undefined);
}

/** Deletes rows another device deleted, leaving tombstones that are already accounted for. */
export function deleteRecordsRaw(entries: { key: string; eventId: string; kind: RecordKind; id: string; updatedAt: number }[]): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return withStores([RECORDS_STORE, DELETIONS_STORE], 'readwrite', (records, deletions) => {
    entries.forEach((entry) => {
      records.delete(entry.key);
      deletions.put({ ...entry, pending: false });
    });
  });
}

/**
 * Puts the events the board reads back together from the rows, after a sync has written them.
 *
 * An event whose own record has gone is deleted here too — that is how a deletion made on another
 * device reaches this one. An event whose rows arrived without their event record is left alone
 * rather than invented: the meta row is on its way, and a phantom on the picker is worse than a
 * moment's wait.
 */
export function rebuildEvents(eventIds: Iterable<string>): Promise<string[]> {
  const ids = [...new Set(eventIds)];
  if (ids.length === 0) return Promise.resolve([]);
  return openDb().then(
    (db) =>
      new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction([EVENTS_STORE, RECORDS_STORE], 'readwrite');
        const events = tx.objectStore(EVENTS_STORE);
        const records = tx.objectStore(RECORDS_STORE);
        const gone: string[] = [];

        for (const id of ids) {
          const req = records.getAll(eventRange(id)) as IDBRequest<SyncRecord[]>;
          req.onsuccess = () => {
            const list = req.result ?? [];
            const state = recompose(list);
            if (state) events.put({ id, state });
            else if (list.length === 0) {
              events.delete(id);
              gone.push(id);
            }
          };
        }

        tx.oncomplete = () => resolve(gone);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

/**
 * Builds the rows for events saved before any of this existed — the one-off every device does on
 * its first sync after updating.
 *
 * Dated {@link TIME_BEFORE_SYNC} and flagged as owed, so they *reach* a cloud that has never held
 * them and lose to anything the cloud already has under the same key.
 */
export async function ensureRecords(): Promise<number> {
  const [events, records] = await Promise.all([getAllEvents(), getAllRecords()]);
  const covered = new Set(records.map((r) => r.eventId));
  const missing = events.filter((event) => !covered.has(event.id));
  if (missing.length === 0) return 0;

  const rows = missing.flatMap((event) =>
    decompose(event.id, event.state).map((record) => ({ ...record, updatedAt: TIME_BEFORE_SYNC, pending: true }))
  );
  await putRecordsRaw(rows);
  return rows.length;
}

export function getDeletions(): Promise<Tombstone[]> {
  return withStore<Tombstone[]>(DELETIONS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<Tombstone[]>).then(
    (all) => all ?? []
  );
}

/** Records tombstones as given — used by the push path to mark deletions as sent. */
export function putTombstones(entries: Tombstone[]): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return withStore(DELETIONS_STORE, 'readwrite', (s) => {
    entries.forEach((entry) => s.put(entry));
  }).then(() => undefined);
}

/**
 * Withdraws tombstones for rows that exist again — an undone delete, or a backup restored from
 * before one. Leaving them would let the next sync delete the row again, here and everywhere else.
 */
export function clearTombstones(keys: string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return withStore(DELETIONS_STORE, 'readwrite', (s) => {
    keys.forEach((key) => s.delete(key));
  }).then(() => undefined);
}

/**
 * Empties everything sync touches — for "take the cloud copy and forget what is here", the one
 * honest way to make a device match the cloud exactly. The tombstones go with the rows: one kept
 * here would travel straight back out and delete what has just been downloaded.
 */
export function clearSyncedStores(): Promise<void> {
  return withStores([EVENTS_STORE, RECORDS_STORE, DELETIONS_STORE], 'readwrite', (events, records, deletions) => {
    events.clear();
    records.clear();
    deletions.clear();
  });
}

export function getActiveId(): Promise<string | null> {
  return withStore<string>(META_STORE, 'readonly', (s) => s.get(ACTIVE_ID_KEY) as IDBRequest<string>).then(
    (id) => id ?? null
  );
}

export function setActiveId(id: string | null): Promise<void> {
  return withStore(META_STORE, 'readwrite', (s) => {
    if (id == null) s.delete(ACTIVE_ID_KEY);
    else s.put(id, ACTIVE_ID_KEY);
  }).then(() => undefined);
}

/**
 * Nuke every saved event — the last-resort "Start over" from the crash-recovery screen. Deletes the
 * whole IndexedDB database (and the legacy localStorage key) so a corrupt event can't crash on reload.
 */
export function clearAllData(): Promise<void> {
  dbPromise = null;
  try {
    localStorage.removeItem(LEGACY_STATE_KEY);
  } catch {
    /* ignore */
  }
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve();
      return;
    }
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

let migrationPromise: Promise<string | null> | null = null;

/**
 * Move a pre-IndexedDB user's single localStorage event into the new store, once. Runs only when the
 * events store is still empty and the legacy key is present, so it never clobbers real IndexedDB data
 * and never re-imports after the user clears their events. Returns the migrated event's id, if any.
 *
 * Memoized so React StrictMode's double-invoked mount effect (dev) can't race two migrations into two
 * duplicate events — concurrent callers all await the same run.
 */
export function migrateLegacyState(makeId: (prefix: string) => string): Promise<string | null> {
  if (!migrationPromise) migrationPromise = runMigration(makeId);
  return migrationPromise;
}

async function runMigration(makeId: (prefix: string) => string): Promise<string | null> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_STATE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  const existing = await getAllEvents();
  if (existing.length > 0) {
    // Real IndexedDB data already exists — don't touch it, but retire the stale legacy key.
    try {
      localStorage.removeItem(LEGACY_STATE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as EventState;
    if (!parsed || !Array.isArray(parsed.guests) || !Array.isArray(parsed.tables)) return null;
    const id = makeId('ev');
    await putEvent({ id, state: parsed });
    await setActiveId(id);
    try {
      localStorage.removeItem(LEGACY_STATE_KEY);
    } catch {
      /* ignore */
    }
    return id;
  } catch {
    return null;
  }
}
