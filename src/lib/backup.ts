/**
 * The whole app in one file: every saved event, not just the one that happens to be open.
 *
 * The board's own "Export → JSON" writes the *open* event, which is the right thing for handing a
 * list to somebody else. It is the wrong thing for a backup, and the difference has a cost: a
 * planner running three weddings who exported each one separately, cleared their browser and came
 * back has three files to re-import one at a time, each landing as a new event with no memory of
 * which was which.
 *
 * So this is the other file — `guestseat-backup-2026-08-15.json`, every event with its id — and it
 * restores in two modes, exactly like the sync panel's two directions:
 *
 * - **Replace** puts the browser back to what the file says, and nothing else.
 * - **Merge** adds only the events this device does not already have, and never touches one it does.
 *   That is what makes an old backup safe to open by mistake: it cannot undo work done since.
 *
 * Everything here is local. A backup file never leaves the device unless the user sends it
 * somewhere, and importing one is the same write path an ordinary edit uses — so a restored event is
 * marked as this device's unsent change and goes up on the next sync, rather than sitting here
 * looking synced while the cloud has never heard of it.
 */

import type { EventState } from '../types';
import {
  clearTombstones,
  deleteEventRecord,
  getActiveId,
  getAllEvents,
  putEvent,
  setActiveId,
  tombstoneKey,
  EVENTS_KIND,
  type StoredEvent,
} from './db';
import { makeId } from './importGuests';
import { downloadBlob } from './exportData';

export const BACKUP_APP = 'GuestSeat';
export const BACKUP_VERSION = 1;

export interface BackupEvent {
  id: string;
  state: EventState;
}

export interface BackupFile {
  app: string;
  version: number;
  exportedAt: string;
  events: BackupEvent[];
}

export type BackupErrorCode =
  | 'notJson'
  /** A valid JSON file, but not one of ours and not a guest list either. */
  | 'unrecognized'
  /** A backup of a different app. */
  | 'otherApp'
  | 'empty';

export class BackupError extends Error {
  code: BackupErrorCode;
  /** The app name a foreign backup claimed, for a message that can name it. */
  app?: string;

  constructor(code: BackupErrorCode, app?: string) {
    super(code);
    this.name = 'BackupError';
    this.code = code;
    this.app = app;
  }
}

/** Does this object hold the two lists every event has? The shape check the rest of the file
 * relies on — a hand-edited file must not be written over somebody's events. */
function looksLikeEvent(value: unknown): value is EventState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<EventState>;
  return Array.isArray(state.guests) && Array.isArray(state.tables);
}

/** An event as it will be stored: the file's own arrays, with the two fields that must be strings
 * made into strings. Anything else in the object is carried through untouched, so a field added by a
 * newer release survives a round trip through an older one. */
function normalizeState(raw: EventState, fallbackName: string): EventState {
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : new Date().toISOString();
  return {
    ...raw,
    eventName: typeof raw.eventName === 'string' && raw.eventName.trim() ? raw.eventName : fallbackName,
    guests: raw.guests.filter((g) => g && typeof g === 'object'),
    tables: raw.tables.filter((t) => t && typeof t === 'object'),
    updatedAt,
  };
}

export function buildBackup(records: StoredEvent[], now = new Date()): BackupFile {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    // Only the id and the state: `updatedAt`/`pending` describe this device's relationship with its
    // own cloud copy, and carrying them into another browser would tell it that events it has never
    // sent are already up there.
    events: records.filter((rec) => rec?.id && looksLikeEvent(rec.state)).map((rec) => ({ id: rec.id, state: rec.state })),
  };
}

/** The filename a backup lands under: dated, so a folder of them sorts itself. */
export function backupFilename(now = new Date()): string {
  return `guestseat-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Reads every saved event and hands the browser a file. Returns how many events went into it. */
export async function exportBackup(): Promise<number> {
  const records = await getAllEvents();
  const backup = buildBackup(records);
  downloadBlob(JSON.stringify(backup, null, 2), backupFilename(), 'application/json');
  return backup.events.length;
}

/**
 * Reads a file that claims to be a backup, in any of the three shapes worth accepting:
 *
 * 1. this file's own format — `{ app: "GuestSeat", events: [{ id, state }] }`;
 * 2. a single event, which is what the board's own JSON export writes;
 * 3. an array of events, which is what someone hand-assembling a file would most likely produce.
 *
 * A backup written by some *other* app is refused by name rather than half-imported: `app` is there
 * to be checked, and "this is a copy of something else" is a more useful sentence than a list of
 * missing fields. `fallbackName` names an event whose own name did not survive.
 */
export function parseBackup(raw: unknown, fallbackName = 'Event'): BackupFile {
  if (!raw || typeof raw !== 'object') throw new BackupError('notJson');

  // Shape 2: a single event, straight from "Export → JSON".
  if (looksLikeEvent(raw)) {
    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      events: [{ id: makeId('ev'), state: normalizeState(raw, fallbackName) }],
    };
  }

  // Shape 3: a bare array of events or of stored records.
  const list = Array.isArray(raw) ? raw : (raw as Partial<BackupFile>).events;
  if (!Array.isArray(list)) {
    const app = (raw as { app?: unknown }).app;
    if (typeof app === 'string' && app && app !== BACKUP_APP) throw new BackupError('otherApp', app);
    throw new BackupError('unrecognized');
  }

  const app = (raw as Partial<BackupFile>).app;
  if (typeof app === 'string' && app && app !== BACKUP_APP) throw new BackupError('otherApp', app);

  const events: BackupEvent[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as { id?: unknown; state?: unknown };
    // Either `{ id, state }` (a stored record) or the state itself (an event in a plain array).
    const state = looksLikeEvent(candidate.state) ? candidate.state : looksLikeEvent(entry) ? (entry as EventState) : null;
    if (!state) continue;
    const id = typeof candidate.id === 'string' && candidate.id ? candidate.id : makeId('ev');
    events.push({ id, state: normalizeState(state, fallbackName) });
  }
  if (events.length === 0) throw new BackupError('empty');

  return {
    app: BACKUP_APP,
    version: Number((raw as Partial<BackupFile>).version) || BACKUP_VERSION,
    exportedAt: String((raw as Partial<BackupFile>).exportedAt ?? new Date().toISOString()),
    events,
  };
}

/** What an import did — "imported successfully" is no answer when the interesting part is how much
 * of the file was already here. */
export interface ImportSummary {
  added: number;
  existing: number;
  removed: number;
}

/**
 * Writes a backup back into the database.
 *
 * `replace` is a restore: every event here is dropped first, so what is on screen afterwards is
 * exactly what is in the file. On a device that syncs, the events it drops are deleted properly —
 * with tombstones — so the deletion travels instead of the next sync quietly downloading them all
 * back and leaving the user with both sets.
 *
 * `merge` adds only the events whose id is not here yet and never touches one that is, so a file
 * from three months ago cannot undo three months of work.
 */
export async function importBackup(
  backup: BackupFile,
  { mode = 'replace' }: { mode?: 'replace' | 'merge' } = {}
): Promise<ImportSummary> {
  const existing = await getAllEvents();
  const existingIds = new Set(existing.map((rec) => rec.id));
  const incomingIds = new Set(backup.events.map((ev) => ev.id));
  const summary: ImportSummary = { added: 0, existing: 0, removed: 0 };

  if (mode === 'replace') {
    const doomed = existing.filter((rec) => !incomingIds.has(rec.id));
    // Deleted one by one rather than cleared wholesale, because each deletion has to leave a
    // tombstone behind: on a device that syncs, a silently emptied store is downloaded straight back
    // from the cloud and the user ends up with both sets.
    for (const rec of doomed) await deleteEventRecord(rec.id);
    summary.removed = doomed.length;
  }

  for (const event of backup.events) {
    if (mode === 'merge' && existingIds.has(event.id)) {
      summary.existing++;
      continue;
    }
    // Through `putEvent`, not the raw writer: a restored event *is* a change made on this device,
    // and the next sync should carry it up.
    await putEvent({ id: event.id, state: event.state });
    summary.added++;
  }

  // An event brought back may be one this device deleted before the file was taken; its tombstone
  // has to be withdrawn now that the event exists again, or the next sync would delete it once more.
  await clearTombstones(backup.events.map((event) => tombstoneKey(EVENTS_KIND, event.id)));

  // The event that was open may not have survived a replace.
  const active = await getActiveId();
  if (active && !incomingIds.has(active) && !(mode === 'merge' && existingIds.has(active))) {
    await setActiveId(null);
  }

  return summary;
}

/** Reads a `File` from a picker and turns it into a backup, or throws a {@link BackupError}. */
export async function readBackupFile(file: File, fallbackName = 'Event'): Promise<BackupFile> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    throw new BackupError('notJson');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('notJson');
  }
  return parseBackup(parsed, fallbackName);
}
