/**
 * Two-way sync between this browser's IndexedDB and the user's own Supabase project.
 *
 * The shape of the thing, before the details:
 *
 * - What travels is not an event but the pieces it is made of — the event's own details, one row per
 *   guest, one row per table (lib/sync/records.ts). Two devices editing different guests of the same
 *   wedding therefore both keep their edits, which is the whole reason for the extra machinery: the
 *   day-of check-in happens on a phone at the venue while somebody else is still moving guests
 *   around on a laptop.
 * - Every local change is flagged `pending` — "not sent yet" — and stays flagged until the cloud has
 *   accepted it (db.ts sets it; this file clears it). A deletion leaves a tombstone carrying the
 *   same flag, so a delete travels like any other change.
 * - Every record also carries `updatedAt`. Once it has been through the cloud that is the time the
 *   *server* gave it, read back from the push, so two devices are never compared through two
 *   different clocks.
 * - The cloud side is one table of `(kind, record_id, updated_at, deleted, data)` rows — one row per
 *   record, with the payload in a `jsonb` column. Still **one table**: kinds and ids are columns, so
 *   a release that adds a field to a guest needs no migration in anybody's own database.
 * - A sync pulls what changed since the last pull, applies it unless this device is holding an
 *   unsent change to the same record, then pushes what it is holding. **The last device to sync
 *   wins, per record** — per guest, per table, per event name.
 * - **Except on the very first sync of a newly connected device**, which pushes nothing at all until
 *   the user has been shown what is in the cloud and has said what should happen to it. See
 *   {@link connectSummary} and {@link MODES}: that rule is what stands between a phone someone has
 *   just installed the app on and an evening of somebody's seating plan.
 * - Every pushed row is stamped with which device pushed it (device.ts), because the account cannot
 *   say — the same email is signed in everywhere — and "which of my devices did that?" is the first
 *   question anybody asks when a sync does something surprising.
 *
 * The pure half (what to send, what to apply) is separated from the half that touches the database
 * and the network, so the merge rules can be tested without either — see sync.test.ts.
 */

import {
  TIME_BEFORE_SYNC,
  type Tombstone,
  clearSyncedStores,
  clearTombstones,
  deleteRecordsRaw,
  ensureRecords,
  getAllRecords,
  getDeletions,
  putRecordsRaw,
  putTombstones,
  rebuildEvents,
} from '../db';
import { RECORD_KINDS, parseRecordKey, validRecord, type RecordKind, type SyncRecord } from './records';
import { DEVICE_PREFIX, META_KIND, TABLE } from './schema';
import { SyncError, readConfig, rest, saveConfig, ensureSession, type SyncConfig, type SyncSummary } from './supabase';
import { deviceStamp, thisDevice } from './device';

/** Kinds a downloaded row is allowed to name. Anything else is ignored rather than written: the rows
 * come back from a database the user administers themselves, and a typo in a hand-run SQL statement
 * should not have the app writing something it cannot read back. */
const ALLOWED_KINDS = new Set<string>(RECORD_KINDS);

/** PostgREST caps a response at 1000 rows by default; asking for fewer keeps the first sync of a
 * 300-guest wedding to a handful of quick requests instead of one enormous one. */
const DOWNLOAD_LIMIT = 500;
const UPLOAD_LIMIT = 200;

/** One record on its way to or from the cloud. `key` is `${eventId}|${kind}|${id}` — the same string
 * the row is stored under here and under `record_id` there, so both sides mean the same thing. */
export interface SyncRow {
  kind: RecordKind;
  key: string;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
}

/** Everything this device holds, as the merge sees it. */
export interface LocalState {
  records: SyncRecord[];
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

  for (const record of records) {
    if (!record?.key) continue;
    if (!all && !record.pending) continue;
    if (exclude.has(record.key)) continue;
    rows.push({
      kind: record.kind,
      key: record.key,
      updatedAt: Number(record.updatedAt) || 0,
      deleted: false,
      data: record.data,
    });
  }

  for (const stone of deletions) {
    if (!stone?.key) continue;
    if (!all && !stone.pending) continue;
    if (exclude.has(stone.key)) continue;
    rows.push({ kind: stone.kind, key: stone.key, updatedAt: Number(stone.updatedAt) || 0, deleted: true, data: null });
  }

  return rows;
}

/**
 * Every key this device holds → its timestamp, plus the set still waiting to be sent. Deletions
 * included. The whole of the local side, as the merge sees it.
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

  const add = (key: string, at: number, isPending: boolean) => {
    times.set(key, at);
    if (isPending && at !== TIME_BEFORE_SYNC) pending.add(key);
  };

  for (const record of records) if (record?.key) add(record.key, Number(record.updatedAt) || 0, Boolean(record.pending));
  for (const stone of deletions) if (stone?.key) add(stone.key, Number(stone.updatedAt) || 0, Boolean(stone.pending));
  return { times, pending };
}

export interface ApplyPlan {
  write: SyncRow[];
  remove: SyncRow[];
  /** Every key this plan touches, so the push a moment later does not send them straight back. */
  keys: Set<string>;
  /** The events whose rows changed, so only those are put back together afterwards. */
  events: Set<string>;
  skipped: number;
  /** The newest `updated_at` seen, including skipped rows — the new pull watermark. */
  maxTs: number;
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
 * 2. **Otherwise the cloud row wins.** There is exactly one row per record, so it always holds the
 *    last state anybody pushed; and an incremental pull only returns rows changed since this
 *    device's watermark. A row that arrives while the local copy is settled is therefore news by
 *    construction — no date arithmetic required to know it.
 *
 * The one comparison left is equality, and it means "this is my own row coming back": every push
 * records the timestamp the row ended up with, so an echo matches to the millisecond and is skipped
 * instead of being re-applied on every sync.
 *
 * A deletion for a record this device has never had is skipped rather than recorded — there is
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
  const events = new Set<string>();
  let skipped = 0;
  let maxTs = 0;

  for (const row of rows) {
    const parsed = row?.key ? parseRecordKey(row.key) : null;
    if (!parsed || !row.kind || !Number.isFinite(row.updatedAt)) {
      skipped++;
      continue;
    }
    // The kind is in the key *and* in its own column; a row where they disagree is not one of ours.
    if (!ALLOWED_KINDS.has(row.kind) || parsed.kind !== row.kind) {
      skipped++;
      continue;
    }
    maxTs = Math.max(maxTs, row.updatedAt);

    // Not yet sent from here: this device's version is the one going out, so what came down is last
    // round's news whatever its timestamp says.
    if (!cloudWins && pending.has(row.key)) {
      skipped++;
      continue;
    }

    const local = times.get(row.key);
    if (local !== undefined && local === row.updatedAt) {
      skipped++;
      continue;
    }
    if (row.deleted) {
      if (local === undefined) skipped++;
      else {
        remove.push(row);
        events.add(parsed.eventId);
      }
      continue;
    }
    if (!validRecord(row.kind, row.data)) {
      skipped++;
      continue;
    }
    write.push(row);
    events.add(parsed.eventId);
  }

  const keys = new Set([...write, ...remove].map((row) => row.key));
  return { write, remove, keys, events, skipped, maxTs };
}

/** The table's columns. `user_id` is sent rather than left to the column default, because a bulk
 * insert through PostgREST fills omitted keys with NULL unless asked otherwise — and NULL is the one
 * value the row-level-security check will refuse. */
export function rowForServer(row: SyncRow, userId: string, device: { id: string; name: string } | null = null) {
  return {
    user_id: userId,
    kind: row.kind,
    record_id: row.key,
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
    kind: (raw?.kind ?? '') as RecordKind,
    key: raw?.record_id ?? '',
    updatedAt: Date.parse(raw?.updated_at ?? ''),
    deleted: Boolean(raw?.deleted),
    data: raw?.data ?? null,
  };
}

/** A downloaded row, as it is stored here. */
function toRecord(row: SyncRow): SyncRecord | null {
  const parsed = parseRecordKey(row.key);
  if (!parsed) return null;
  return {
    key: row.key,
    eventId: parsed.eventId,
    kind: row.kind,
    id: parsed.id,
    updatedAt: row.updatedAt,
    // Arrived from the cloud, so by definition it is not waiting to go to the cloud.
    pending: false,
    data: row.data as SyncRecord['data'],
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
  for (const record of records) if (record?.key) keys.add(record.key);
  for (const stone of deletions) if (stone?.key) keys.add(stone.key);
  return keys;
}

/** `${eventId}|${kind}|${id}` keys → how many of each kind, for a summary a person can read
 * ("3 events, 412 guests") rather than a bare row count. */
export function countByKind(keys: Iterable<string>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const key of keys) {
    const parsed = parseRecordKey(String(key));
    if (!parsed) continue;
    counts[parsed.kind] = (counts[parsed.kind] ?? 0) + 1;
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
  return !records.some((record) => (Number(record?.updatedAt) || 0) > TIME_BEFORE_SYNC);
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
): { records: SyncRecord[]; deletions: Tombstone[] } {
  return {
    records: records.filter((record) => record?.key && !record.pending && !keys.has(record.key)),
    deletions: deletions.filter((stone) => stone?.key && !stone.pending && !keys.has(stone.key)),
  };
}

/** The three answers to "this device and the cloud copy do not match — which one is right?". */
export const MODES = {
  /** Keep both: the cloud wins wherever the same record exists on both sides, and whatever only this
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
  const [records, deletions] = await Promise.all([getAllRecords(), getDeletions()]);
  return { records, deletions };
}

async function applyToDb(plan: ApplyPlan): Promise<void> {
  const written = plan.write.map(toRecord).filter((r): r is SyncRecord => r !== null);
  await putRecordsRaw(written);
  await deleteRecordsRaw(
    plan.remove
      .map((row) => {
        const parsed = parseRecordKey(row.key);
        return parsed ? { key: row.key, eventId: parsed.eventId, kind: row.kind, id: parsed.id, updatedAt: row.updatedAt } : null;
      })
      .filter((entry): entry is { key: string; eventId: string; kind: RecordKind; id: string; updatedAt: number } => entry !== null)
  );
  // Anything written above exists again, so a tombstone this device is still holding for it would
  // otherwise travel back out and delete it everywhere.
  await clearTombstones(written.map((record) => record.key));
  // Only the events whose rows moved are put back together — a sync that brought down one guest does
  // not rebuild the other four weddings.
  await rebuildEvents(plan.events);
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
 * Every key the cloud copy holds, tombstones included.
 *
 * Only the two columns that make the key: for a few weddings that is a list of short strings, not
 * the guests themselves, which is what makes the check below affordable.
 */
export async function cloudKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  for (let offset = 0; ; offset += DOWNLOAD_LIMIT) {
    const part = await rest<{ record_id?: string }[]>(
      `${TABLE}?kind=neq.${META_KIND}&select=record_id&order=record_id.asc&limit=${DOWNLOAD_LIMIT}&offset=${offset}`
    );
    const list = Array.isArray(part) ? part : [];
    list.forEach((row) => {
      if (row?.record_id) keys.add(row.record_id);
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
 * costs one short-string column of the cloud table and one read of the local one, which is nothing
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
  kind: RecordKind;
  key: string;
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
  const path = (cols: string) => `${TABLE}?kind=neq.${META_KIND}&select=${cols}&order=updated_at.desc&limit=${limit}`;

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
    kind: String(row?.kind ?? '') as RecordKind,
    key: String(row?.record_id ?? ''),
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

  await putRecordsRaw(missing.records.map((record) => ({ ...record, pending: true })));
  await putTombstones(missing.deletions.map((stone) => ({ ...stone, pending: true })));
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
 * is a nice-to-have, the guest list is not, and a phone must go on syncing with a project the user
 * has not got round to updating. PostgREST reports it as PGRST204 and names the column.
 */
function missingColumn(err: unknown): boolean {
  if (err instanceof SyncError && err.pgCode === 'PGRST204') return true;
  return /device_id|device_name/i.test((err as Error)?.message || '');
}

async function upsertRows(batch: unknown[]) {
  return rest<{ record_id?: string; updated_at?: string }[]>(
    `${TABLE}?on_conflict=user_id,kind,record_id&select=record_id,updated_at`,
    {
      method: 'POST',
      body: batch,
      // An upsert: the same guest edited twice must update their row, not fail on the primary key.
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    }
  );
}

/**
 * Sends the rows and reads back the timestamp the server gave each one.
 *
 * The read-back is what keeps every device's timestamps in a single clock: a row written here and a
 * row written on the laptop are then both dated by Postgres, so comparing them means something.
 * `select=` keeps the response to two columns — without it the whole `data` payload comes back and a
 * first sync would pay for itself twice.
 */
async function pushRows(rows: SyncRow[], config: SyncConfig): Promise<Map<string, number>> {
  const times = new Map<string, number>();
  // Left off from the start for a project already known not to have the columns; discovered the hard
  // way (once) for a project nobody has asked about yet.
  let device = config.deviceColumns === false ? null : deviceStamp();
  let known = config.deviceColumns !== null;

  for (let i = 0; i < rows.length; i += UPLOAD_LIMIT) {
    const batch = rows.slice(i, i + UPLOAD_LIMIT);
    let answer: { record_id?: string; updated_at?: string }[];
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
      if (row?.record_id && Number.isFinite(at)) times.set(row.record_id, at);
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
    const at = times.get(row.key);
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
 * request is in flight: a record edited between the push and this moment must stay flagged, or that
 * edit would sit on this device for ever, believed to have been sent. Comparing `updatedAt` against
 * what was actually pushed is how that is told apart.
 *
 * Two maps rather than one, and each row is looked up in the one its own kind belongs to. A record
 * and its tombstone never coexist, but they *do* swap places — undoing a delete brings the record
 * back under the same key — and writing a tombstone-shaped object into the records store (or the
 * reverse) would corrupt the row rather than merely miss it.
 */
async function markPushed(rows: SyncRow[], times: Map<string, number>): Promise<number> {
  if (rows.length === 0) return 0;
  const state = await readLocalState();
  const recordsByKey = new Map(state.records.map((record) => [record.key, record]));
  const stonesByKey = new Map(state.deletions.map((stone) => [stone.key, stone]));

  const records: SyncRecord[] = [];
  const stones: Tombstone[] = [];
  let count = 0;

  for (const row of rows) {
    const local = row.deleted ? stonesByKey.get(row.key) : recordsByKey.get(row.key);
    if (!local) continue;
    if ((Number(local.updatedAt) || 0) !== row.updatedAt) continue;

    const at = times.get(row.key) ?? row.updatedAt;
    if (row.deleted) stones.push({ ...(local as Tombstone), updatedAt: at, pending: false });
    else records.push({ ...(local as SyncRecord), updatedAt: at, pending: false });
    count++;
  }

  await putRecordsRaw(records);
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
    // Read here rather than handed in: what this device holds is whatever survived the download that
    // has just been applied, and re-flagging a stale copy would undo it.
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
 * changed, apply it unless this device is holding an unsent change to the same record, push what it
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
 * - **PUSH**: this device is declared the right one and everything here goes up over the cloud.
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

    // Events saved before this release have no rows yet; this is where they get them.
    const stamped = await ensureRecords();

    const rows = await downloadRows(fullDownload ? '' : config.pulledAt);

    // Cleared only now, with the whole cloud copy already in hand: a download that failed half way
    // must leave the device exactly as it was, not empty.
    if (mode === MODES.TAKE) await clearSyncedStores();

    const state = await readLocalState();

    // Joining a copy is the one time an unsent local change is not the newer truth — it is whatever
    // this browser happened to write before it had anywhere to send it.
    const cloudWins = mode === MODES.TAKE || mode === MODES.MERGE;
    const plan = applyPlan(rows, localSnapshot(state), { cloudWins });
    await applyToDb(plan);

    const repaired = await repairIfShort(config, fromScratch || undecided);

    // Everything the cloud already holds, from the download that has just finished — so a merge can
    // push what is missing without asking the project a second time.
    const cloudSeen = mode === MODES.MERGE ? new Set(rows.map((row) => row.key)) : null;
    const exclude = cloudSeen ? new Set([...plan.keys, ...cloudSeen]) : plan.keys;

    // Read again rather than reused: what goes up is what is on disk *after* the download was
    // applied and the repair re-flagged whatever the cloud turned out to be missing.
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
  // bookkeeping rows are not the user's data, so they are left out of the count.
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
