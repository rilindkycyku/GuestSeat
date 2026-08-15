/**
 * Two-way sync between this browser's IndexedDB and the user's own Supabase project.
 *
 * The shape of the thing, before the details:
 *
 * - Every local change is flagged `pending` — "not sent yet" — and stays flagged until the cloud has
 *   accepted it (db.ts sets it; this file clears it). A deletion leaves a tombstone carrying the
 *   same flag, so a delete travels like any other change.
 * - Every record also carries `updatedAt`. Once it has been through the cloud that is the time the
 *   *server* gave it, read back from the push, so two devices are never compared through two
 *   different clocks.
 * - The cloud side is one table of `(kind, record_id, updated_at, deleted, data)` rows — one row per
 *   saved event, with the whole {@link EventState} in the `data` column. One table means a user who
 *   set this up in March does not have to run a migration in their own project because April's
 *   release added a field to a guest.
 * - A sync pulls what changed since the last pull, applies it unless this device is holding an
 *   unsent change to the same event, then pushes what it is holding. **The last device to sync
 *   wins, per event.**
 * - **Except on the very first sync of a newly connected device**, which pushes nothing at all until
 *   the user has been shown what is in the cloud and has said what should happen to it. See
 *   {@link connectSummary} and {@link MODES}: that rule is what stands between a phone someone has
 *   just installed the app on and an evening of somebody's seating plan.
 * - Every pushed row is stamped with which device pushed it (device.ts), because the account cannot
 *   say — the same email is signed in everywhere — and "which of my devices did that?" is the first
 *   question anybody asks when a sync does something surprising.
 *
 * ---- what an event being one row costs ----
 *
 * The unit of conflict is the whole event, not the guest. Two devices editing *different* events
 * merge perfectly; two devices editing *the same* event without syncing in between end with the
 * version that reached the cloud last, and the other side's edits to that event are gone. That is
 * the honest trade for a planner used on a phone and a laptop by one or two people, and it is
 * stated plainly in the panel rather than hidden. Finer conflict resolution would mean storing every
 * guest as its own record, which is a different app; the seating board is edited as a whole.
 *
 * The pure half (what to send, what to apply) is separated from the half that touches the database
 * and the network, so the merge rules can be tested without either — see sync.test.ts.
 */

import type { EventState } from '../../types';
import {
  EVENTS_KIND,
  TIME_BEFORE_SYNC,
  type StoredEvent,
  type Tombstone,
  clearSyncedStores,
  clearTombstones,
  deleteEventsRaw,
  getAllEvents,
  getDeletions,
  putEventsRaw,
  putTombstones,
} from '../db';
import { DEVICE_PREFIX, META_KIND, TABLE } from './schema';
import { SyncError, readConfig, rest, saveConfig, ensureSession, type SyncConfig, type SyncSummary } from './supabase';
import { deviceStamp, thisDevice } from './device';

/** Kinds a downloaded row is allowed to name. Anything else is ignored rather than written: the rows
 * come back from a database the user administers themselves, and a typo in a hand-run SQL statement
 * should not have the app writing into a store that does not exist. */
const ALLOWED_KINDS = new Set<string>([EVENTS_KIND]);

/** PostgREST caps a response at 1000 rows by default; asking for fewer keeps a first sync of a long
 * history to a handful of quick requests instead of one enormous one. */
const DOWNLOAD_LIMIT = 500;
const UPLOAD_LIMIT = 100;

export function rowKey(kind: string, id: string): string {
  return `${kind}:${id}`;
}

/** One record on its way to or from the cloud. */
export interface SyncRow {
  kind: string;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: EventState | null;
}

/** Everything this device holds, as the merge sees it. */
export interface LocalState {
  records: StoredEvent[];
  deletions: Tombstone[];
}

// ---- pure: what this device owes the cloud, and what it should take from it ----

/**
 * Every local record and tombstone that is still waiting to reach the cloud.
 *
 * Waiting is a flag (`pending`), not a date comparison. A device whose clock is wrong is still
 * perfectly able to know *that* it changed something — it is only wrong about when — so nothing here
 * asks the clock anything, and an edit made on a phone an hour behind is sent like any other.
 *
 * `all` ignores the flag and sends the lot: the "upload everything again" path, for a cloud copy
 * that lost rows or was never finished by an interrupted first sync.
 *
 * `exclude` holds the rows this same sync has just applied from the cloud: they are, by definition,
 * changes this device did not make, and sending them straight back would be a write per row for
 * nothing.
 */
export function localChanges({
  records = [],
  deletions = [],
  all = false,
  exclude = new Set<string>(),
}: Partial<LocalState> & { all?: boolean; exclude?: Set<string> }): SyncRow[] {
  const rows: SyncRow[] = [];

  for (const rec of records) {
    if (!rec?.id) continue;
    if (!all && !rec.pending) continue;
    if (exclude.has(rowKey(EVENTS_KIND, rec.id))) continue;
    rows.push({
      kind: EVENTS_KIND,
      id: rec.id,
      updatedAt: Number(rec.updatedAt) || 0,
      deleted: false,
      data: rec.state,
    });
  }

  for (const stone of deletions) {
    if (!stone?.kind || !stone?.id) continue;
    if (!all && !stone.pending) continue;
    if (exclude.has(rowKey(stone.kind, stone.id))) continue;
    rows.push({
      kind: stone.kind,
      id: stone.id,
      updatedAt: Number(stone.updatedAt) || 0,
      deleted: true,
      data: null,
    });
  }

  return rows;
}

/**
 * `${kind}:${id}` → what this device holds for it: the timestamp, and whether the change is still
 * waiting to be sent. Deletions included. The whole of the local side, as the merge sees it.
 *
 * A record dated {@link TIME_BEFORE_SYNC} is the one exception to "unsent wins". It is flagged so
 * that it *reaches* a cloud that has never held it, but it predates sync and its date is a
 * placeholder, not an edit anyone made — so against a row the cloud actually has it must lose.
 */
export function localSnapshot({ records = [], deletions = [] }: Partial<LocalState>): {
  times: Map<string, number>;
  pending: Set<string>;
} {
  const times = new Map<string, number>();
  const pending = new Set<string>();

  const add = (kind: string, id: string, at: number, isPending: boolean) => {
    const key = rowKey(kind, id);
    times.set(key, at);
    if (isPending && at !== TIME_BEFORE_SYNC) pending.add(key);
  };

  for (const rec of records) {
    if (rec?.id) add(EVENTS_KIND, rec.id, Number(rec.updatedAt) || 0, Boolean(rec.pending));
  }
  for (const stone of deletions) {
    if (stone?.kind && stone?.id) add(stone.kind, stone.id, Number(stone.updatedAt) || 0, Boolean(stone.pending));
  }
  return { times, pending };
}

export interface ApplyPlan {
  write: SyncRow[];
  remove: SyncRow[];
  /** Every key this plan touches, so the push a moment later does not send them straight back. */
  keys: Set<string>;
  skipped: number;
  /** The newest `updated_at` seen, including skipped rows — the new pull watermark. */
  maxTs: number;
}

/** A downloaded payload only becomes an event if it actually looks like one. The database belongs to
 * the user and can be edited by hand; a row of nonsense must be ignored, not written over a real
 * event. */
function looksLikeEvent(data: unknown): data is EventState {
  if (!data || typeof data !== 'object') return false;
  const state = data as Partial<EventState>;
  return Array.isArray(state.guests) && Array.isArray(state.tables);
}

/**
 * What to do with what came down: write it, delete it, or leave the local copy alone because it is
 * the newer one (it will be pushed a few lines later, and the other device will take it then).
 *
 * Two rules, and neither of them compares one device's clock with another's:
 *
 * 1. **An unsent local change wins.** It is kept, skipped here, and pushed a few lines later. So the
 *    rule across devices is "the last one to sync wins" rather than "the one whose clock reads
 *    latest wins", and nothing typed on this device is ever discarded before it has been sent.
 * 2. **Otherwise the cloud row wins.** There is exactly one row per event, so it always holds the
 *    last state anybody pushed; and an incremental pull only returns rows changed since this
 *    device's watermark. A row that arrives while the local copy is settled is therefore news by
 *    construction — no date arithmetic required to know it.
 *
 * The one comparison left is equality, and it means "this is my own row coming back": every push
 * records the timestamp the row ended up with, so an echo matches to the millisecond and is skipped
 * instead of being re-applied on every sync.
 *
 * A deletion for an event this device has never had is skipped rather than recorded — there is
 * nothing to delete, and a tombstone for a record that never existed here would be pure noise.
 *
 * `cloudWins` drops rule 1 for the length of one sync: what the cloud holds is applied even over an
 * unsent local change. It is not for ordinary syncing — it is for the moment a device joins a cloud
 * copy it has never met ({@link MODES.MERGE} / {@link MODES.TAKE}), where "unsent" means nothing
 * more than "written before this browser had anywhere to send it".
 */
export function applyPlan(
  rows: SyncRow[],
  { times, pending = new Set<string>() }: { times: Map<string, number>; pending?: Set<string> },
  { cloudWins = false }: { cloudWins?: boolean } = {}
): ApplyPlan {
  const write: SyncRow[] = [];
  const remove: SyncRow[] = [];
  let skipped = 0;
  let maxTs = 0;

  for (const row of rows) {
    if (!row?.kind || !row?.id || !Number.isFinite(row.updatedAt)) {
      skipped++;
      continue;
    }
    if (!ALLOWED_KINDS.has(row.kind)) {
      skipped++;
      continue;
    }
    maxTs = Math.max(maxTs, row.updatedAt);

    const key = rowKey(row.kind, row.id);
    // Not yet sent from here: this device's version is the one going out, so what came down is last
    // round's news whatever its timestamp says.
    if (!cloudWins && pending.has(key)) {
      skipped++;
      continue;
    }

    const local = times.get(key);
    if (local !== undefined && local === row.updatedAt) {
      skipped++;
      continue;
    }
    if (row.deleted) {
      if (local === undefined) skipped++;
      else remove.push(row);
      continue;
    }
    if (!looksLikeEvent(row.data)) {
      skipped++;
      continue;
    }
    write.push(row);
  }

  const keys = new Set([...write, ...remove].map((row) => rowKey(row.kind, row.id)));
  return { write, remove, keys, skipped, maxTs };
}

/** The table's columns. `user_id` is sent rather than left to the column default, because a bulk
 * insert through PostgREST fills omitted keys with NULL unless asked otherwise — and NULL is the one
 * value the row-level-security check will refuse. */
export function rowForServer(row: SyncRow, userId: string, device: { id: string; name: string } | null = null) {
  return {
    user_id: userId,
    kind: row.kind,
    record_id: row.id,
    // Sent for a project whose setup script predates the timestamp trigger; where the trigger exists
    // it overrides this with the server's own clock, which is the entire point of it.
    updated_at: new Date(row.updatedAt).toISOString(),
    deleted: Boolean(row.deleted),
    data: row.deleted ? null : row.data,
    // Left off entirely for a project without the columns, where naming them would have PostgREST
    // refuse the whole batch.
    ...(device ? { device_id: device.id, device_name: device.name } : {}),
  };
}

export function rowFromServer(raw: {
  kind?: string;
  record_id?: string;
  updated_at?: string;
  deleted?: boolean;
  data?: unknown;
}): SyncRow {
  return {
    kind: raw?.kind ?? '',
    id: raw?.record_id ?? '',
    updatedAt: Date.parse(raw?.updated_at ?? ''),
    deleted: Boolean(raw?.deleted),
    data: (raw?.data ?? null) as EventState | null,
  };
}

/** How many records this device holds, in the same terms the cloud counts its rows. */
export function localCount({ records = [], deletions = [] }: Partial<LocalState> = {}): number {
  return records.length + deletions.length;
}

/** Every key this device holds, tombstones included — the local half of the comparison a device
 * makes when it first meets a cloud copy. */
export function localKeys({ records = [], deletions = [] }: Partial<LocalState> = {}): Set<string> {
  const keys = new Set<string>();
  for (const rec of records) if (rec?.id) keys.add(rowKey(EVENTS_KIND, rec.id));
  for (const stone of deletions) if (stone?.kind && stone?.id) keys.add(rowKey(stone.kind, stone.id));
  return keys;
}

/** `${kind}:${id}` keys → how many of each kind, for a summary a person can read. */
export function countByKind(keys: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) {
    const text = String(key);
    const at = text.indexOf(':');
    // Anything without a kind in front of it is not one of these keys at all — and slicing blindly
    // would invent a kind name out of the id.
    if (at <= 0) continue;
    const kind = text.slice(0, at);
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}

/**
 * Whether this device is carrying anything of its own yet.
 *
 * It decides which direction is *offered first* when a device joins a cloud copy, and nothing more.
 * The user still chooses.
 */
export function deviceHasNothing({ records = [], deletions = [] }: Partial<LocalState> = {}): boolean {
  if (deletions.length > 0) return false;
  return !records.some((rec) => (Number(rec?.updatedAt) || 0) > TIME_BEFORE_SYNC);
}

/**
 * The records the cloud has never heard of, whatever this device believes about them.
 *
 * Every other rule in this file asks the *device* what it still owes: a flag it sets when it changes
 * something and clears when the cloud accepts it. That is enough right up until the two disagree — a
 * cloud copy emptied or rebuilt from elsewhere, a row lost, an upsert that reported more than it
 * stored — and then the disagreement is permanent, because a record whose flag says "sent" is never
 * looked at again.
 *
 * So this asks the other side instead. The keys are the cloud's own answer to "what do you have",
 * and anything local missing from it is owed — no matter what the flag says.
 */
export function missingInCloud(
  { records = [], deletions = [] }: Partial<LocalState>,
  keys: Set<string> = new Set()
): { records: StoredEvent[]; deletions: Tombstone[] } {
  return {
    records: records.filter((rec) => rec?.id && !rec.pending && !keys.has(rowKey(EVENTS_KIND, rec.id))),
    deletions: deletions.filter(
      (stone) => stone?.kind && stone?.id && !stone.pending && !keys.has(rowKey(stone.kind, stone.id))
    ),
  };
}

/**
 * Which records predate sync, and so are still owed to the cloud.
 *
 * Two kinds, and they are the same thing at different moments. A record with **no** timestamp was
 * written before this release. A record dated exactly {@link TIME_BEFORE_SYNC} is one of those on a
 * later pass: stamped by an earlier sync, and *still* never accepted by the cloud.
 *
 * Being flagged does not make them win anything — {@link localSnapshot} keeps them out of the
 * "unsent beats the cloud" rule — so an untouched event on a device joining a copy still loses to
 * the cloud's version of the same event. The mark only means "the cloud has not confirmed this",
 * and the first push that succeeds replaces the placeholder date with the server's own.
 */
export function unstamped(records: StoredEvent[] = []): StoredEvent[] {
  return records.filter((rec) => {
    if (!rec?.id) return false;
    const at = Number(rec.updatedAt) || 0;
    // Been through the cloud, which is the only thing that gives a record a real date.
    if (at !== 0 && at !== TIME_BEFORE_SYNC) return false;
    // Already dated and already marked: nothing to write, it is on its way out as it is.
    return !(at === TIME_BEFORE_SYNC && rec.pending);
  });
}

/** The three answers to "this device and the cloud copy do not match — which one is right?". */
export const MODES = {
  /** Keep both: the cloud wins wherever the same event exists on both sides, and whatever only this
   * device has is uploaded. The safe answer, and the one offered first. */
  MERGE: 'merge',
  /** Take the cloud copy and drop what is here. For the device that is new or was wiped. */
  TAKE: 'take',
  /** This device is the real one: everything here goes up, over whatever the cloud holds. */
  PUSH: 'push',
} as const;

export type SyncMode = (typeof MODES)[keyof typeof MODES];

// ---- the database side ----

export async function readLocalState(): Promise<LocalState> {
  const [records, deletions] = await Promise.all([getAllEvents(), getDeletions()]);
  return { records, deletions };
}

/**
 * Marks the records that predate sync, in memory as well as on disk, so the push a few lines later
 * can see them. One write transaction for the lot rather than one per record.
 */
export async function stampUnstamped(state: LocalState, at = TIME_BEFORE_SYNC): Promise<number> {
  const jobs = unstamped(state.records);
  if (jobs.length === 0) return 0;
  for (const rec of jobs) {
    rec.updatedAt = at;
    rec.pending = true;
  }
  await putEventsRaw(jobs);
  return jobs.length;
}

async function applyToDb(plan: ApplyPlan): Promise<void> {
  // The id is taken from the row rather than from the payload: the row's key is what the whole merge
  // was decided on, so a payload disagreeing with it must not create a second event.
  await putEventsRaw(
    plan.write.map((row) => ({
      id: row.id,
      state: row.data as EventState,
      updatedAt: row.updatedAt,
      // Arrived from the cloud, so by definition it is not waiting to go to the cloud.
      pending: false,
    }))
  );
  await deleteEventsRaw(plan.remove.map((row) => ({ id: row.id, updatedAt: row.updatedAt })));
  // Anything written above exists again, so a tombstone this device is still holding for it would
  // otherwise travel back out and delete it everywhere.
  await clearTombstones(plan.write.map((row) => rowKey(row.kind, row.id)));
}

async function downloadRows(since: string): Promise<SyncRow[]> {
  const columns = 'select=kind,record_id,updated_at,deleted,data';
  const filter = since ? `&updated_at=gt.${encodeURIComponent(since)}` : '';
  const rows: SyncRow[] = [];
  for (let offset = 0; ; offset += DOWNLOAD_LIMIT) {
    const part = await rest<Record<string, unknown>[]>(
      `${TABLE}?${columns}${filter}&kind=neq.${META_KIND}&order=updated_at.asc,kind.asc,record_id.asc&limit=${DOWNLOAD_LIMIT}&offset=${offset}`
    );
    const list = Array.isArray(part) ? part : [];
    rows.push(...list.map(rowFromServer));
    if (list.length < DOWNLOAD_LIMIT) return rows;
  }
}

/**
 * Every key the cloud copy holds, `${kind}:${record_id}`, tombstones included.
 *
 * Only the two columns that make the key: even for a planner with dozens of events that is a list of
 * short strings, not the events themselves, which is what makes the check below affordable.
 */
export async function cloudKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let offset = 0; ; offset += DOWNLOAD_LIMIT) {
    const part = await rest<{ kind?: string; record_id?: string }[]>(
      `${TABLE}?kind=neq.${META_KIND}&select=kind,record_id&order=kind.asc,record_id.asc&limit=${DOWNLOAD_LIMIT}&offset=${offset}`
    );
    const list = Array.isArray(part) ? part : [];
    list.forEach((row) => {
      if (row?.kind && row?.record_id) keys.add(rowKey(row.kind, row.record_id));
    });
    if (list.length < DOWNLOAD_LIMIT) return keys;
  }
}

export interface ConnectSummary {
  local: number;
  cloud: number;
  both: number;
  onlyLocal: number;
  onlyCloud: number;
  localByKind: Record<string, number>;
  cloudByKind: Record<string, number>;
  deviceEmpty: boolean;
  recommended: SyncMode;
}

/**
 * The two sides counted against each other, without writing a single thing.
 *
 * This is what a newly connected device shows before it is allowed to push — see {@link runSync}. It
 * costs two short-string columns of the cloud table and one read of the local one, which is nothing
 * next to what it prevents: a device that has just installed the app pushing its emptiness over
 * everything the other one holds, with nobody ever shown the numbers.
 */
export async function connectSummary(): Promise<ConnectSummary> {
  const state = await readLocalState();
  const cloud = await cloudKeys();
  const local = localKeys(state);

  let both = 0;
  for (const key of local) if (cloud.has(key)) both++;

  const deviceEmpty = deviceHasNothing(state);
  return {
    local: local.size,
    cloud: cloud.size,
    both,
    onlyLocal: local.size - both,
    onlyCloud: cloud.size - both,
    localByKind: countByKind(local),
    cloudByKind: countByKind(cloud),
    deviceEmpty,
    // Offered first, never applied by itself. An empty cloud has nothing to lose; a device with
    // nothing of its own has nothing worth defending; anything else keeps both sides.
    recommended: cloud.size === 0 ? MODES.PUSH : deviceEmpty ? MODES.TAKE : MODES.MERGE,
  };
}

// ---- which device did that ----

export interface DeviceRow {
  id: string;
  name: string;
  created: number | null;
  lastSync: string | null;
  pushed: number;
  pulled: number;
  records: number;
  /** This very browser. */
  self: boolean;
}

/**
 * This device's own row in the user's project: name, when it last synced, how much it holds.
 *
 * It lives under the `meta` kind, which sync itself reads straight past, so it is bookkeeping about
 * the events rather than one of them. The point is the sync panel on *another* device: with one
 * account signed in everywhere, a list of devices and what each of them last did is the only way to
 * answer "where did that come from?".
 *
 * Best effort throughout: a device that cannot register itself still syncs perfectly.
 */
export async function registerDevice({ pushed = 0, pulled = 0, records = 0 } = {}): Promise<void> {
  const config = await ensureSession();
  const device = thisDevice();
  if (!device.id) return;

  const row: Record<string, unknown> = {
    user_id: config.userId,
    kind: META_KIND,
    record_id: `${DEVICE_PREFIX}${device.id}`,
    deleted: false,
    data: {
      id: device.id,
      name: device.name,
      created: device.created,
      lastSync: new Date().toISOString(),
      pushed,
      pulled,
      records,
    },
    ...(config.deviceColumns === false ? {} : { device_id: device.id, device_name: device.name }),
  };

  const send = (body: Record<string, unknown>) =>
    rest(`${TABLE}?on_conflict=user_id,kind,record_id`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: [body],
    });

  await send(row).catch(async (err: unknown) => {
    if (!missingColumn(err)) throw err;
    saveConfig({ deviceColumns: false });
    delete row.device_id;
    delete row.device_name;
    await send(row);
  });
}

/** Every device that has ever synced with this project, newest first. */
export async function readDevices(): Promise<DeviceRow[]> {
  const rows = await rest<{ record_id?: string; updated_at?: string; data?: Record<string, unknown> }[]>(
    `${TABLE}?kind=eq.${META_KIND}&record_id=like.${encodeURIComponent(`${DEVICE_PREFIX}*`)}` +
      '&select=record_id,updated_at,data&order=updated_at.desc'
  );
  const self = thisDevice().id;
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const data = row?.data ?? {};
    const id = String(data.id || String(row?.record_id || '').slice(DEVICE_PREFIX.length));
    return {
      id,
      name: String(data.name || ''),
      created: Number(data.created) || null,
      lastSync: (data.lastSync as string) || row?.updated_at || null,
      pushed: Number(data.pushed) || 0,
      pulled: Number(data.pulled) || 0,
      records: Number(data.records) || 0,
      self: id === self,
    };
  });
}

/** Removes a device from that list — one that was sold, reinstalled or is simply gone. It does not
 * disconnect anything: the row is a note about a device, not the device's access. */
export async function forgetDevice(id: string): Promise<void> {
  await rest(`${TABLE}?kind=eq.${META_KIND}&record_id=eq.${encodeURIComponent(`${DEVICE_PREFIX}${id}`)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

export interface ChangeRow {
  kind: string;
  id: string;
  at: string | null;
  deleted: boolean;
  deviceId: string;
  device: string;
  self: boolean;
}

/**
 * The last few rows written to the project, and which device wrote each one.
 *
 * The audit trail that turns "something replaced my seating plan" into a sentence with a subject in
 * it. Rows written by a device whose browser refused storage carry no device, which is said plainly
 * rather than guessed at.
 */
export async function recentChanges(limit = 12): Promise<ChangeRow[]> {
  const config = readConfig();
  const withDevice = config.deviceColumns !== false;
  const columns = withDevice
    ? 'kind,record_id,updated_at,deleted,device_id,device_name'
    : 'kind,record_id,updated_at,deleted';
  const path = (cols: string) =>
    `${TABLE}?kind=neq.${META_KIND}&select=${cols}&order=updated_at.desc&limit=${limit}`;

  let rows: Record<string, unknown>[];
  try {
    rows = await rest<Record<string, unknown>[]>(path(columns));
  } catch (err) {
    if (!withDevice || !missingColumn(err)) throw err;
    saveConfig({ deviceColumns: false });
    rows = await rest<Record<string, unknown>[]>(path('kind,record_id,updated_at,deleted'));
  }

  const self = thisDevice().id;
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    kind: String(row?.kind ?? ''),
    id: String(row?.record_id ?? ''),
    at: (row?.updated_at as string) ?? null,
    deleted: Boolean(row?.deleted),
    deviceId: String(row?.device_id ?? ''),
    device: String(row?.device_name ?? ''),
    self: Boolean(row?.device_id) && row.device_id === self,
  }));
}

/**
 * Marks everything the cloud turns out not to have as unsent again, so the push at the end of this
 * same sync carries it up.
 *
 * The timestamp is left exactly as it is: what the record says about *when* it last changed is still
 * true, and the merge goes on being decided the way it always was. Only the "the cloud has this"
 * belief is corrected, because that is the part that was wrong.
 */
export async function repairCopy(state: LocalState): Promise<number> {
  const missing = missingInCloud(state, await cloudKeys());
  const total = missing.records.length + missing.deletions.length;
  if (total === 0) return 0;

  for (const rec of missing.records) rec.pending = true;
  for (const stone of missing.deletions) stone.pending = true;
  await putEventsRaw(missing.records);
  await putTombstones(missing.deletions);
  return total;
}

/** The repair on demand, for the panel that has just shown the user two numbers that disagree. The
 * daily check finds this by itself, but "by itself" is up to a day away. */
export async function repairNow(): Promise<number> {
  return repairCopy(await readLocalState());
}

/** What this device holds, for a panel that wants to compare it against the cloud's own count. */
export async function countLocal(): Promise<number> {
  return localCount(await readLocalState());
}

/**
 * "That column is not in the table" — a project whose table was created by hand, or by a future
 * migration this release has not caught up with.
 *
 * Worth telling apart from every other failure, because the answer is not to stop: the device stamp
 * is a nice-to-have, the events are not, and a phone must go on syncing with a project the user has
 * not got round to updating. PostgREST reports it as PGRST204 and names the column.
 */
function missingColumn(err: unknown): boolean {
  if (err instanceof SyncError && err.pgCode === 'PGRST204') return true;
  return /device_id|device_name/i.test((err as Error)?.message || '');
}

async function upsertRows(batch: unknown[]) {
  return rest<{ kind?: string; record_id?: string; updated_at?: string }[]>(
    `${TABLE}?on_conflict=user_id,kind,record_id&select=kind,record_id,updated_at`,
    {
      method: 'POST',
      body: batch,
      // An upsert: the same event edited twice must update its row, not fail on the primary key.
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    }
  );
}

/**
 * Sends the rows and reads back the timestamp the server gave each one.
 *
 * The read-back is what keeps every device's timestamps in a single clock: a row written here and a
 * row written on the laptop are then both dated by Postgres, so comparing them means something.
 * `select=` keeps the response to three columns — without it the whole `data` payload comes back and
 * a first sync would pay for itself twice.
 */
async function pushRows(rows: SyncRow[], config: SyncConfig): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  // Left off from the start for a project already known not to have the columns; discovered the hard
  // way (once) for a project nobody has asked about yet.
  let device = config.deviceColumns === false ? null : deviceStamp();
  let known = config.deviceColumns !== null;

  for (let i = 0; i < rows.length; i += UPLOAD_LIMIT) {
    const batch = rows.slice(i, i + UPLOAD_LIMIT);
    let answer: { kind?: string; record_id?: string; updated_at?: string }[];
    try {
      answer = await upsertRows(batch.map((row) => rowForServer(row, config.userId, device)));
    } catch (err) {
      if (!device || !missingColumn(err)) throw err;
      // Remembered, so the next push does not spend a failed request finding this out again.
      saveConfig({ deviceColumns: false });
      device = null;
      known = true;
      answer = await upsertRows(batch.map((row) => rowForServer(row, config.userId, null)));
    }
    for (const row of Array.isArray(answer) ? answer : []) {
      const at = Date.parse(row?.updated_at ?? '');
      if (row?.kind && row?.record_id && Number.isFinite(at)) times.set(rowKey(row.kind, row.record_id), at);
    }
  }
  // A push that went through carrying the stamp is proof the project has the columns. A push of
  // nothing is proof of nothing, and recording it would leave a project without them believed to
  // have them — the one belief that makes the next real push fail.
  if (rows.length > 0 && device && !known) saveConfig({ deviceColumns: true });
  return times;
}

/**
 * Whether the project stamped the rows itself, judged from what came back.
 *
 * The trigger sets `updated_at` to the server's `now()`, which will not land on the exact
 * millisecond this device asked for; a project whose table was created without the trigger keeps the
 * value it was sent, to the millisecond. So: any row that came back changed means the trigger is
 * there, and rows that all came back identical mean it is not.
 *
 * Worth knowing rather than ignoring, because without the trigger the ordering of the whole table is
 * at the mercy of every device's clock — a phone an hour behind writes rows dated an hour ago, which
 * every other device's watermark has already scrolled past. Returns null when the push had nothing
 * to say.
 */
export function detectServerClock(rows: SyncRow[], times: Map<string, number>): boolean | null {
  let seen = false;
  for (const row of rows) {
    const at = times.get(rowKey(row.kind, row.id));
    if (at === undefined) continue;
    if (at !== row.updatedAt) return true;
    seen = true;
  }
  return seen ? false : null;
}

/**
 * Clears the "waiting to be sent" flag on everything the cloud has just accepted, and adopts the
 * timestamp the server gave it.
 *
 * The database is re-read first, because the user does not stop dragging guests around while a
 * request is in flight: an event edited between the push and this moment must stay flagged, or that
 * edit would sit on this device for ever, believed to have been sent. Comparing `updatedAt` against
 * what was actually pushed is how that is told apart.
 */
async function markPushed(rows: SyncRow[], times: Map<string, number>): Promise<number> {
  if (rows.length === 0) return 0;
  const state = await readLocalState();
  // Two maps rather than one, and each row is looked up in the map its own kind belongs to. An event
  // and its tombstone never coexist, but they *do* swap places — undoing a delete re-creates the
  // event under the same id — and writing a tombstone-shaped object into the events store (or the
  // reverse) would corrupt the record rather than merely miss it.
  const recordsByKey = new Map<string, StoredEvent>();
  const stonesByKey = new Map<string, Tombstone>();
  for (const rec of state.records) if (rec?.id) recordsByKey.set(rowKey(EVENTS_KIND, rec.id), rec);
  for (const stone of state.deletions) if (stone?.kind && stone?.id) stonesByKey.set(rowKey(stone.kind, stone.id), stone);

  const records: StoredEvent[] = [];
  const stones: Tombstone[] = [];
  let count = 0;

  for (const row of rows) {
    const key = rowKey(row.kind, row.id);
    const local = row.deleted ? stonesByKey.get(key) : recordsByKey.get(key);
    if (!local) continue;
    if ((Number(local.updatedAt) || 0) !== row.updatedAt) continue;

    const at = times.get(key) ?? row.updatedAt;
    if (row.deleted) stones.push({ ...(local as Tombstone), updatedAt: at, pending: false });
    else records.push({ ...(local as StoredEvent), updatedAt: at, pending: false });
    count++;
  }

  await putEventsRaw(records);
  await putTombstones(stones);
  return count;
}

export interface SyncResult extends SyncSummary {
  mode: SyncMode | null;
  stamped: number;
  repaired: number;
  skipped: number;
  /** Something came down, so whatever is on screen has to be re-read. */
  changed: boolean;
}

let inFlight: Promise<SyncResult> | null = null;

/**
 * One sync: pull, apply, push. Returns a summary of what moved.
 *
 * Calls that arrive while one is running join it instead of starting a second — automatic sync is
 * triggered by several things at once (a save, the tab regaining focus, coming back online) and two
 * overlapping runs would push the same rows twice and race over the watermarks.
 *
 * A sync the user asked for by name — "take the cloud copy", "this device is the right one" — is
 * never answered with somebody else's run. It waits for the one in flight and then does its own
 * thing, because joining an ordinary sync would silently do the opposite of what was pressed.
 */
export function sync(options: { full?: boolean; mode?: SyncMode | null } = {}): Promise<SyncResult> {
  if (inFlight && !options.mode) return inFlight;

  const previous = inFlight ? inFlight.catch(() => undefined) : Promise.resolve();
  const mine = previous
    .then(() => runSync(options))
    .finally(() => {
      if (inFlight === mine) inFlight = null;
    });
  inFlight = mine;
  return mine;
}

export function isSyncing(): boolean {
  return inFlight !== null;
}

/** How often the two sides are counted against each other. */
const BETWEEN_CHECKS = 24 * 60 * 60 * 1000;

/** How often a device re-signs its own row when nothing at all has moved. */
const BETWEEN_DEVICE_NOTES = 60 * 60 * 1000;

/**
 * Once a day, checks that the cloud holds at least as much as this device does, and repairs it when
 * it does not.
 *
 * The count is one row and a header, and it is the only request that runs on the ordinary day. The
 * list of keys is fetched **only** when that count comes out short, which is the one case where
 * something is definitely missing — the cloud can legitimately hold *more* than this device
 * (tombstones it has already swept, rows another device deleted), never less.
 */
async function repairIfShort(config: SyncConfig, skip: boolean): Promise<number> {
  if (skip) return 0;
  if (Date.now() - (Number(config.checkedAt) || 0) < BETWEEN_CHECKS) return 0;

  try {
    const inCloud = await countCloud();
    // Written before the work rather than after: a check that keeps failing half way through must
    // not run on every single sync from then on.
    saveConfig({ checkedAt: Date.now() });
    // Read here rather than handed in: what this device holds is whatever survived the download
    // that has just been applied, and re-flagging a stale copy would undo it.
    const state = await readLocalState();
    if (inCloud === null || inCloud >= localCount(state)) return 0;
    return await repairCopy(state);
  } catch {
    // A check is not the sync. Whatever went wrong here, the changes this device is holding still
    // deserve their push, and the next run will try the check again.
    return 0;
  }
}

/**
 * One sync, in whichever of the four shapes applies.
 *
 * The ordinary one (no `mode`, connection long since settled) is what it sounds like: pull what
 * changed, apply it unless this device is holding an unsent change to the same event, push what it
 * is holding.
 *
 * The other three exist because a device that has just installed the app has nothing, and "nothing"
 * is a perfectly valid thing to push over somebody's evening. So:
 *
 * - **No decision yet** (`decided === false`): this device pulls and pushes **nothing**, and says so
 *   (`needsDecision`). Nothing can be lost by a sync that only reads.
 * - **MERGE**: full pull with the cloud winning every collision, then push only what the cloud has
 *   never heard of. Both sides survive.
 * - **TAKE**: the cloud copy replaces what is here. The download completes *before* anything local
 *   is cleared, so a failed request leaves the events untouched.
 * - **PUSH**: this device is declared the right one and everything here goes up over the cloud. The
 *   panel makes the user type the word for that one.
 */
async function runSync({ full = false, mode = null }: { full?: boolean; mode?: SyncMode | null }): Promise<SyncResult> {
  const startedAt = Date.now();
  try {
    const config = await ensureSession();
    if (!config.userId) throw new SyncError('The session has no user — sign in again.', 'session');

    // Connected, but nobody has yet said what should happen to what is up there. Read-only until
    // they do — see the sync panel, which is where the question gets asked.
    const undecided = !mode && config.decided === false;
    // Either the user asked for it, a mode was chosen, or a previous run left the cloud empty and
    // owing. A device with no decision also takes the whole table: its watermarks mean nothing yet.
    const fromScratch = Boolean(mode) || full || Boolean(config.fullPushNext);
    const fullDownload = fromScratch || undecided;

    let state = await readLocalState();
    const stamped = await stampUnstamped(state);

    const rows = await downloadRows(fullDownload ? '' : config.pulledAt);

    // Cleared only now, with the whole cloud copy already in hand: a download that failed half way
    // must leave the device exactly as it was, not empty.
    if (mode === MODES.TAKE) {
      await clearSyncedStores();
      state = await readLocalState();
    }

    // Joining a copy is the one time an unsent local change is not the newer truth — it is whatever
    // this browser happened to write before it had anywhere to send it.
    const cloudWins = mode === MODES.TAKE || mode === MODES.MERGE;
    const plan = applyPlan(rows, localSnapshot(state), { cloudWins });
    await applyToDb(plan);

    const repaired = await repairIfShort(config, fromScratch || undecided);

    // Everything the cloud already holds, from the download that has just finished — so a merge can
    // push what is missing without asking the project a second time.
    const cloudSeen = mode === MODES.MERGE ? new Set(rows.map((row) => rowKey(row.kind, row.id))) : null;
    const exclude = cloudSeen ? new Set([...plan.keys, ...cloudSeen]) : plan.keys;

    // Read again rather than reused: what goes up is what is on disk *after* the download was
    // applied and the repair re-flagged whatever the cloud turned out to be missing. Pushing the
    // pre-download copy would send back the very rows that have just replaced it.
    const afterApply = await readLocalState();

    const toPush =
      undecided || mode === MODES.TAKE
        ? []
        : localChanges({
            ...afterApply,
            // A full sync also re-sends everything, so that a cloud copy which lost rows (or was
            // never fully written by an interrupted first sync) is completed from this device.
            all: fromScratch,
            exclude,
          });
    const serverTimes = await pushRows(toPush, config);
    await markPushed(toPush, serverTimes);
    const serverClock = detectServerClock(toPush, serverTimes);

    // Only ever moved forward by rows actually seen. Advancing it to "now" instead would skip any
    // row another device wrote while this sync was in flight — the one class of change that would
    // then never be downloaded at all.
    const pulledAt = Math.max(plan.maxTs, Date.parse(config.pulledAt) || 0);
    const summary: SyncSummary = {
      at: new Date().toISOString(),
      error: null,
      pulled: plan.write.length + plan.remove.length,
      pushed: toPush.length,
      // Carried into the saved summary so the panel can go on saying "this device has not decided"
      // after a reload, rather than only in the moment the sync returned.
      needsDecision: undecided,
    };
    saveConfig({
      pulledAt: pulledAt ? new Date(pulledAt).toISOString() : '',
      pushedAt: startedAt,
      fullPushNext: false,
      // Answering the question is what settles it, and it stays settled from then on.
      ...(mode ? { decided: true } : {}),
      // Left alone when this run pushed nothing, so a quiet sync does not erase what the last busy
      // one found out.
      ...(serverClock === null ? {} : { serverClock }),
      last: summary,
    });

    // Last, and never fatal: the events have already moved, and a device that failed to sign its own
    // name in the project has still synced perfectly. Written when something actually moved, and
    // otherwise at most once an hour — an open tab syncs every ten minutes whether or not anything
    // happened, and a note saying "this device was here" does not need re-writing for a check that
    // found nothing.
    if (
      summary.pulled > 0 ||
      summary.pushed > 0 ||
      Date.now() - (Number(config.deviceNotedAt) || 0) > BETWEEN_DEVICE_NOTES
    ) {
      await registerDevice({
        pushed: summary.pushed,
        pulled: summary.pulled,
        records: localCount(await readLocalState()),
      })
        .then(() => saveConfig({ deviceNotedAt: Date.now() }))
        .catch(() => undefined);
    }

    return { ...summary, mode, stamped, repaired, skipped: plan.skipped, changed: summary.pulled > 0 };
  } catch (err) {
    saveConfig({
      last: {
        at: new Date().toISOString(),
        error: (err as Error)?.message || 'Sync failed.',
        pulled: 0,
        pushed: 0,
      },
    });
    throw err;
  }
}

/** How many rows the cloud copy holds — the answer to "did anything actually get up there?". */
export async function countCloud(): Promise<number | null> {
  // `limit=1` keeps the body to one row; the number itself rides in the header. Deliberately no
  // `Range` header alongside it — a range asking for a row an empty table does not have is answered
  // with 416, and an empty cloud copy is exactly the state right after the delete button. The
  // bookkeeping rows are not the user's events, so they are left out of the count.
  const res = await rest(`${TABLE}?kind=neq.${META_KIND}&select=record_id&limit=1`, {
    headers: { Prefer: 'count=exact' },
    raw: true,
  });
  // PostgREST reports the count in Content-Range as `0-0/123`.
  const range = res.headers.get('content-range') || '';
  const count = Number(range.split('/')[1]);
  return Number.isFinite(count) ? count : null;
}

/**
 * Empties the cloud copy of this user, leaving every device's own events untouched.
 *
 * The watermarks go with it. Left in place, this device would consider itself up to date with a
 * table that no longer has anything in it and would never push its events back up — so the next sync
 * starts from nothing, exactly like the first one did.
 */
export async function deleteCloud(): Promise<void> {
  const config = await ensureSession();
  await rest(`${TABLE}?user_id=eq.${encodeURIComponent(config.userId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
  // Everything this device holds is now missing from the cloud, though none of it is *flagged* as
  // unsent — it was sent, to rows that no longer exist. So the next sync is told to send the lot.
  // Emptying the copy on purpose, behind two confirmations, *is* the decision about what happens to
  // it, so the device is not asked again.
  saveConfig({ pulledAt: '', pushedAt: 0, last: null, fullPushNext: true, decided: true });
}

/** Sync from scratch on the next run without touching anything already stored — used after
 * connecting a device, so it takes the whole cloud copy and offers its own events back. */
export function resetWatermarks(): SyncConfig {
  return saveConfig({ pulledAt: '', pushedAt: 0 });
}

/**
 * Whether anything at all is still waiting to be sent from this device.
 *
 * Read once at startup, because the fact itself outlives the tab: a change saved on a train and still
 * unsent is just as unsent after the app is closed and reopened, and an indicator that forgot it
 * would go back to claiming everything is fine.
 */
export async function hasUnsent(): Promise<boolean> {
  const { pending } = localSnapshot(await readLocalState());
  return pending.size > 0;
}

export function lastSync(): SyncSummary | null {
  return readConfig().last;
}
