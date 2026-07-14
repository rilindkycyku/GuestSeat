import type { EventState, EventType } from '../types';

/**
 * IndexedDB-backed persistence for GuestSeat.
 *
 * The app used to keep a single event in localStorage under `guestseat.state.v1`. That capped us
 * at one list and at localStorage's ~5 MB string quota. IndexedDB lets us store *many* events —
 * each a full {@link EventState} — so a planner can close one wedding, open another, and come back
 * to either anytime. Events live in the `events` object store keyed by a short opaque id; the id of
 * the event currently open is remembered in the tiny `meta` store so the app reopens where you left.
 */

const DB_NAME = 'guestseat';
const DB_VERSION = 1;
const EVENTS_STORE = 'events';
const META_STORE = 'meta';
const ACTIVE_ID_KEY = 'activeId';

/** The legacy single-event localStorage key, migrated into IndexedDB on first run. */
const LEGACY_STATE_KEY = 'guestseat.state.v1';

/** One saved event as it lives on disk: an opaque id plus the full event state. */
export interface StoredEvent {
  id: string;
  state: EventState;
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

export function getAllEvents(): Promise<StoredEvent[]> {
  return withStore<StoredEvent[]>(EVENTS_STORE, 'readonly', (s) => s.getAll() as IDBRequest<StoredEvent[]>).then(
    (all) => all ?? []
  );
}

export function getEvent(id: string): Promise<StoredEvent | undefined> {
  return withStore<StoredEvent>(EVENTS_STORE, 'readonly', (s) => s.get(id) as IDBRequest<StoredEvent>);
}

export function putEvent(rec: StoredEvent): Promise<void> {
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    s.put(rec);
  }).then(() => undefined);
}

export function deleteEventRecord(id: string): Promise<void> {
  return withStore(EVENTS_STORE, 'readwrite', (s) => {
    s.delete(id);
  }).then(() => undefined);
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

/**
 * Move a pre-IndexedDB user's single localStorage event into the new store, once. Runs only when the
 * events store is still empty and the legacy key is present, so it never clobbers real IndexedDB data
 * and never re-imports after the user clears their events. Returns the migrated event's id, if any.
 */
export async function migrateLegacyState(makeId: (prefix: string) => string): Promise<string | null> {
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
