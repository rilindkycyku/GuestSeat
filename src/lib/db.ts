import type { EventState, EventType } from '../types';

/**
 * IndexedDB-backed persistence for GuestSeat.
 *
 * The app used to keep a single event in localStorage under `guestseat.state.v1`. That capped us
 * at one list and at localStorage's ~5 MB string quota. IndexedDB lets us store *many* events —
 * each a full {@link EventState} — so a planner can close one wedding, open another, and come back
 * to either anytime. Events live in the `events` object store keyed by a short opaque id; the id of
 * the event currently open is remembered in the tiny `meta` store so the app reopens where you left.
 *
 * ---- what sync adds here ----
 *
 * Cloud sync (lib/sync/) is two-way, which means every write has to leave behind two facts the
 * store alone cannot express:
 *
 * - **when** the record last changed (`updatedAt`), so two devices can be compared. Once a record
 *   has been through the cloud this holds the time the *server* gave it, not this device's clock.
 * - **whether the cloud has it yet** (`pending`). A flag rather than a date comparison, because a
 *   phone whose clock is an hour behind is still perfectly able to know *that* it changed
 *   something — it is only wrong about when.
 *
 * Both are stamped by {@link putEvent}, the single path every ordinary change already goes through.
 * Sync itself writes through the `*Raw` helpers, which keep whatever timestamp came down from the
 * cloud and stay silent, so applying a downloaded change never looks like a new local edit.
 *
 * Deleting needs the same care: a deleted event leaves a **tombstone** in the `deletions` store.
 * Without one, the next sync would see an event present in the cloud and absent here, conclude this
 * device had simply never received it, and download it straight back — deleting anything would be
 * impossible on a synced device.
 */

const DB_NAME = 'guestseat';
const DB_VERSION = 2;
const EVENTS_STORE = 'events';
const META_STORE = 'meta';
const DELETIONS_STORE = 'deletions';
const ACTIVE_ID_KEY = 'activeId';

/** The legacy single-event localStorage key, migrated into IndexedDB on first run. */
const LEGACY_STATE_KEY = 'guestseat.state.v1';

/** The name sync files these records under — one store today, but rows carry it so the cloud table
 * can hold more than events later without a migration in anybody's own project. */
export const EVENTS_KIND = 'events';

/**
 * The timestamp given to events that predate sync: the oldest one there is, rather than "now".
 *
 * An event saved before this release has no `updatedAt`, and something has to be chosen or it can
 * never be compared with anything. "Now" is the tempting answer and the wrong one: on a device that
 * is joining a cloud copy it has already synced with once, stamping its untouched events at the
 * moment of the first sync would make them look newer than the versions the cloud has been holding,
 * and the join would push stale copies over real work.
 *
 * Dated to (almost) the epoch instead, an unstamped event loses every comparison and wins nothing
 * it should not: anything the cloud holds for the same id is by definition a later edit, and
 * anything the cloud has never seen still gets pushed.
 */
export const TIME_BEFORE_SYNC = 1;

/**
 * One saved event as it lives on disk: an opaque id, the full event state, and the two fields sync
 * needs. Both sync fields are optional — a record written before sync existed has neither, and is
 * treated as {@link TIME_BEFORE_SYNC} and still owed to the cloud.
 */
export interface StoredEvent {
  id: string;
  state: EventState;
  /** ms epoch of the last change; the server's own clock once the record has been through it. */
  updatedAt?: number;
  /** Changed on this device and not yet accepted by the cloud. */
  pending?: boolean;
}

/** A deleted event, kept so the deletion can travel to the other devices. */
export interface Tombstone {
  /** `${kind}:${id}` — the store key, and the same key sync compares rows by. */
  key: string;
  kind: string;
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
      // v2: tombstones. Nothing but sync reads them.
      if (!db.objectStoreNames.contains(DELETIONS_STORE)) db.createObjectStore(DELETIONS_STORE, { keyPath: 'key' });
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

/** The same across two stores at once, for the writes that must not half-happen — a deletion and
 * its tombstone, above all: one without the other is undone by the very next sync. */
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

export function getAllEvents(): Promise<StoredEvent[]> {
  return withStore<StoredEvent[]>(EVENTS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredEvent[]>).then(
    (all) => all ?? []
  );
}

export function getEvent(id: string): Promise<StoredEvent | undefined> {
  return withStore<StoredEvent>(EVENTS_STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredEvent>);
}

/**
 * Saves an event as a change made *here*: stamped with this moment and marked as still owed to the
 * cloud. Every ordinary write in the app goes through this.
 *
 * The one path that must not be stamped is sync applying what came down — that record already
 * carries the timestamp it was given on the device where it was edited, and replacing it with "now"
 * would make an old edit look like the newest one everywhere. That path uses {@link putEventRaw}.
 */
export function putEvent(rec: StoredEvent): Promise<void> {
  const stamped: StoredEvent = { ...rec, updatedAt: Date.now(), pending: true };
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    s.put(stamped);
  }).then(() => {
    announceChange();
  });
}

/** Writes a record exactly as given, keeping its own `updatedAt`. For the sync apply path. */
export function putEventRaw(rec: StoredEvent): Promise<void> {
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    s.put(rec);
  }).then(() => undefined);
}

/**
 * The same for many records in a single transaction. A first sync applies every event the cloud
 * holds; one transaction per record is a round trip through the database engine each time, which on
 * a phone is the app looking stuck. One transaction for the lot is also all-or-nothing, so an
 * interrupted sync leaves a batch either fully applied or not at all.
 */
export function putEventsRaw(recs: StoredEvent[]): Promise<void> {
  if (recs.length === 0) return Promise.resolve();
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    recs.forEach((rec) => s.put(rec));
  }).then(() => undefined);
}

/**
 * Deletes an event and leaves a tombstone behind, so the deletion travels to the other devices.
 * The two happen in one transaction: a deletion whose tombstone failed to write would be undone by
 * the next sync, which would see the event in the cloud, miss it here, and download it again.
 */
export function deleteEventRecord(id: string): Promise<void> {
  return withStores([EVENTS_STORE, DELETIONS_STORE], 'readwrite', (events, deletions) => {
    events.delete(id);
    deletions.put({ key: tombstoneKey(EVENTS_KIND, id), kind: EVENTS_KIND, id, updatedAt: Date.now(), pending: true });
  }).then(() => {
    announceChange();
  });
}

/** Deletes many events and leaves their tombstones — the sync apply path for rows deleted elsewhere,
 * which arrive already accounted for and so are marked as nothing this device still owes. */
export function deleteEventsRaw(entries: { id: string; updatedAt: number }[]): Promise<void> {
  if (entries.length === 0) return Promise.resolve();
  return withStores([EVENTS_STORE, DELETIONS_STORE], 'readwrite', (events, deletions) => {
    entries.forEach(({ id, updatedAt }) => {
      events.delete(id);
      deletions.put({ key: tombstoneKey(EVENTS_KIND, id), kind: EVENTS_KIND, id, updatedAt, pending: false });
    });
  });
}

export function tombstoneKey(kind: string, id: string): string {
  return `${kind}:${id}`;
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
 * Withdraws tombstones for events that exist again.
 *
 * Ids are unique, so a deleted event normally never comes back — except where an id is chosen
 * rather than generated: importing a backup taken before the deletion, or undoing a delete. Leaving
 * the tombstone in place would let the next sync delete the event again, here and everywhere else.
 */
export function clearTombstones(keys: string[]): Promise<void> {
  if (keys.length === 0) return Promise.resolve();
  return withStore(DELETIONS_STORE, 'readwrite', (s) => {
    keys.forEach((key) => s.delete(key));
  }).then(() => undefined);
}

/**
 * Empties the events and their tombstones — for "take the cloud copy and forget what is here", the
 * one honest way to make a device match the cloud exactly. The tombstones have to go with the
 * events: one kept here would travel straight back out and delete the very row just downloaded.
 */
export function clearSyncedStores(): Promise<void> {
  return withStores([EVENTS_STORE, DELETIONS_STORE], 'readwrite', (events, deletions) => {
    events.clear();
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
