import { describe, expect, it } from 'vitest';
import type { EventState, Guest, Table } from '../../types';
import type { Tombstone } from '../db';
import {
  MODES,
  applyPlan,
  countByKind,
  deviceHasNothing,
  detectServerClock,
  localChanges,
  localCount,
  localKeys,
  localSnapshot,
  missingInCloud,
  rowForServer,
  rowFromServer,
  type SyncRow,
} from './sync';
import {
  decompose,
  diffRecords,
  eventMeta,
  parseRecordKey,
  recompose,
  recordKey,
  sameData,
  validRecord,
  type SyncRecord,
} from './records';
import { guessDeviceName } from './device';
import { checkKey, normalizeUrl, projectRef, signupPath } from './supabase';
import { SCHEMA_VERSION, SQL_INSTALL, TABLE, pendingMigrations, sqlForMigration } from './schema';

const guest = (id: string, name: string, extra: Partial<Guest> = {}): Guest => ({ id, name, tableId: null, ...extra });
const table = (id: string, name: string, capacity = 8): Table => ({ id, name, capacity });

const event = (over: Partial<EventState> = {}): EventState => ({
  eventName: 'Elira & Arben',
  guests: [guest('g1', 'Ana'), guest('g2', 'Besnik')],
  tables: [table('t1', 'Tavolina 1')],
  updatedAt: '2026-08-15T10:00:00.000Z',
  ...over,
});

const stamp = (records: SyncRecord[], at: number, pending = false): SyncRecord[] =>
  records.map((r) => ({ ...r, updatedAt: at, pending }));

const stone = (key: string, at: number, pending = false): Tombstone => {
  const parsed = parseRecordKey(key)!;
  return { key, eventId: parsed.eventId, kind: parsed.kind, id: parsed.id, updatedAt: at, pending };
};

const cloudRow = (key: string, at: number, data: unknown, over: Partial<SyncRow> = {}): SyncRow => ({
  kind: parseRecordKey(key)!.kind,
  key,
  updatedAt: at,
  deleted: false,
  data,
  ...over,
});

describe('taking an event apart', () => {
  it('makes one row for the event and one for each guest and table', () => {
    const records = decompose('ev1', event());
    expect(records.map((r) => r.key)).toEqual([
      'ev1|event|ev1',
      'ev1|guest|g1',
      'ev1|guest|g2',
      'ev1|table|t1',
    ]);
  });

  it('keeps the order in the event record rather than on every guest', () => {
    // Inserting a guest at the top must not rewrite every row after it — only the order list.
    const meta = eventMeta(event());
    expect(meta.guestOrder).toEqual(['g1', 'g2']);
    expect(meta.tableOrder).toEqual(['t1']);
  });

  it('puts the event back together exactly as it was', () => {
    const state = event({
      tags: [{ id: 'tag1', label: 'Krushqit', color: 'rose' }],
      details: { venue: 'Emerald Hall', eventType: 'wedding' },
      guests: [guest('g1', 'Ana', { tableId: 't1', rsvp: 'confirmed' }), guest('g2', 'Besnik')],
    });
    expect(recompose(decompose('ev1', state))).toEqual(state);
  });

  it('appends a guest the order has not heard of yet', () => {
    // Another device added them a second ago: the row is here before the order is.
    const records = decompose('ev1', event());
    records.push({ key: recordKey('ev1', 'guest', 'g9'), eventId: 'ev1', kind: 'guest', id: 'g9', data: guest('g9', 'Zana') });
    expect(recompose(records)!.guests.map((g) => g.name)).toEqual(['Ana', 'Besnik', 'Zana']);
  });

  it('unseats a guest whose table this device does not have (yet)', () => {
    const records = decompose('ev1', event({ guests: [guest('g1', 'Ana', { tableId: 'gone' })] }));
    expect(recompose(records)!.guests[0].tableId).toBeNull();
  });

  it('is not an event without its event record', () => {
    const records = decompose('ev1', event()).filter((r) => r.kind !== 'event');
    expect(recompose(records)).toBeNull();
  });

  it('refuses payloads that are not what their row claims', () => {
    expect(validRecord('guest', { id: 'g1', name: 'Ana' })).toBe(true);
    expect(validRecord('guest', { hello: 'world' })).toBe(false);
    expect(validRecord('table', { id: 't1', name: 'T', capacity: 8 })).toBe(true);
    expect(validRecord('table', { id: 't1', name: 'T' })).toBe(false);
    expect(validRecord('event', { eventName: 'X' })).toBe(true);
  });

  it('reads a key back apart, and refuses one that is not ours', () => {
    expect(parseRecordKey('ev1|guest|g4')).toEqual({ eventId: 'ev1', kind: 'guest', id: 'g4' });
    expect(parseRecordKey('ev1|nonsense|g4')).toBeNull();
    expect(parseRecordKey('nocolons')).toBeNull();
  });
});

describe('diffing a save', () => {
  const before = stamp(decompose('ev1', event()), 100);

  it('marks only the guest that actually changed', () => {
    const after = decompose('ev1', event({ guests: [guest('g1', 'Ana', { tableId: 't1' }), guest('g2', 'Besnik')] }));
    const { write, removed } = diffRecords(before, after, 500);
    // Seating Ana rewrites the whole EventState in React; only her row is owed to the cloud.
    expect(write.map((r) => r.key)).toEqual(['ev1|guest|g1']);
    expect(write[0]).toMatchObject({ updatedAt: 500, pending: true });
    expect(removed).toEqual([]);
  });

  it('says nothing changed when nothing changed', () => {
    expect(diffRecords(before, decompose('ev1', event()), 500).write).toEqual([]);
  });

  it('notices a rename as a change to the event row alone', () => {
    const { write } = diffRecords(before, decompose('ev1', event({ eventName: 'Dasma' })), 500);
    expect(write.map((r) => r.key)).toEqual(['ev1|event|ev1']);
  });

  it('reports a removed guest, so a tombstone can be left', () => {
    const after = decompose('ev1', event({ guests: [guest('g1', 'Ana')] }));
    const { write, removed } = diffRecords(before, after, 500);
    expect(removed.map((r) => r.key)).toEqual(['ev1|guest|g2']);
    // The order changed too, so the event row goes with it.
    expect(write.map((r) => r.key)).toEqual(['ev1|event|ev1']);
  });

  it('does not mistake a reordered object for a changed one', () => {
    // The app rebuilds guests by spreading, which can move a key; only the values matter.
    expect(sameData({ id: 'g1', name: 'Ana', tableId: null }, { tableId: null, name: 'Ana', id: 'g1' })).toBe(true);
    expect(sameData({ id: 'g1', name: 'Ana' }, { id: 'g1', name: 'Anna' })).toBe(false);
  });
});

describe('localChanges', () => {
  it('sends only what is still waiting, records and tombstones alike', () => {
    const records = [...stamp(decompose('ev1', event()), 100), ...stamp(decompose('ev2', event()), 200, true)];
    const rows = localChanges({ records, deletions: [stone('ev1|guest|gone', 300, true), stone('ev1|table|old', 400)] });
    expect(rows.filter((r) => !r.deleted).every((r) => r.key.startsWith('ev2|'))).toBe(true);
    expect(rows.filter((r) => r.deleted).map((r) => r.key)).toEqual(['ev1|guest|gone']);
  });

  it('sends everything when asked, flags ignored', () => {
    const records = stamp(decompose('ev1', event()), 100);
    expect(localChanges({ records, all: true })).toHaveLength(records.length);
  });

  it('never re-sends what this same sync has just applied', () => {
    const records = stamp(decompose('ev1', event()), 100, true);
    expect(localChanges({ records, exclude: new Set(records.map((r) => r.key)) })).toEqual([]);
  });
});

describe('localSnapshot', () => {
  it('keeps records that predate sync out of "unsent wins"', () => {
    const records = [...stamp(decompose('ev1', event()), 1, true), ...stamp(decompose('ev2', event()), 500, true)];
    const { times, pending } = localSnapshot({ records });
    expect(times.get('ev1|guest|g1')).toBe(1);
    expect(pending.has('ev1|guest|g1')).toBe(false);
    expect(pending.has('ev2|guest|g1')).toBe(true);
  });
});

describe('applyPlan', () => {
  const local = stamp(decompose('ev1', event()), 100);

  it('writes what the cloud holds when the local copy is settled', () => {
    const plan = applyPlan([cloudRow('ev1|guest|g1', 200, guest('g1', 'Ana e re'))], localSnapshot({ records: local }));
    expect(plan.write.map((r) => r.key)).toEqual(['ev1|guest|g1']);
    expect([...plan.events]).toEqual(['ev1']);
    expect(plan.maxTs).toBe(200);
  });

  it('keeps an unsent local change and skips the cloud row', () => {
    const mine = local.map((r) => (r.key === 'ev1|guest|g1' ? { ...r, pending: true } : r));
    const plan = applyPlan([cloudRow('ev1|guest|g1', 200, guest('g1', 'Nga tjetra'))], localSnapshot({ records: mine }));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(1);
    // Still counted towards the watermark: skipping it is a decision, not a reason to fetch it again.
    expect(plan.maxTs).toBe(200);
  });

  it('lets two devices edit different guests of the same event', () => {
    // The whole point of rows: their edit lands, mine is kept and pushed a moment later.
    const mine = local.map((r) => (r.key === 'ev1|guest|g1' ? { ...r, pending: true, updatedAt: 150 } : r));
    const plan = applyPlan(
      [cloudRow('ev1|guest|g1', 200, guest('g1', 'Theirs')), cloudRow('ev1|guest|g2', 200, guest('g2', 'Besnik i ri'))],
      localSnapshot({ records: mine })
    );
    expect(plan.write.map((r) => r.key)).toEqual(['ev1|guest|g2']);
    expect(plan.skipped).toBe(1);
  });

  it('lets the cloud win over an unsent change when a device is joining a copy', () => {
    const mine = local.map((r) => ({ ...r, pending: true }));
    const plan = applyPlan([cloudRow('ev1|guest|g1', 200, guest('g1', 'Cloud'))], localSnapshot({ records: mine }), {
      cloudWins: true,
    });
    expect(plan.write.map((r) => r.key)).toEqual(['ev1|guest|g1']);
  });

  it('skips a row whose timestamp matches exactly — this device pushed it', () => {
    const plan = applyPlan([cloudRow('ev1|guest|g1', 100, guest('g1', 'Ana'))], localSnapshot({ records: local }));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(1);
  });

  it('applies a deletion only for something this device actually has', () => {
    const plan = applyPlan(
      [
        cloudRow('ev1|guest|g1', 200, null, { deleted: true }),
        cloudRow('ev1|guest|never', 200, null, { deleted: true }),
      ],
      localSnapshot({ records: local })
    );
    expect(plan.remove.map((r) => r.key)).toEqual(['ev1|guest|g1']);
    expect(plan.skipped).toBe(1);
  });

  it('ignores rows of an unknown kind, a mismatched key, or a payload that is not what it claims', () => {
    const rows: SyncRow[] = [
      { kind: 'guest', key: 'ev1|nonsense|x', updatedAt: 10, deleted: false, data: guest('x', 'X') },
      { kind: 'guest', key: 'ev1|table|t9', updatedAt: 10, deleted: false, data: guest('t9', 'X') },
      { kind: 'guest', key: 'ev1|guest|g7', updatedAt: 10, deleted: false, data: { hello: 'world' } },
    ];
    const plan = applyPlan(rows, localSnapshot({}));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(3);
  });

  it('names the events it touched, so only those are put back together', () => {
    const plan = applyPlan(
      [cloudRow('ev1|guest|g1', 200, guest('g1', 'A')), cloudRow('ev7|guest|g1', 200, guest('g1', 'B'))],
      localSnapshot({ records: local })
    );
    expect([...plan.events].sort()).toEqual(['ev1', 'ev7']);
  });
});

describe('server rows', () => {
  it('round-trips through the table shape', () => {
    const row = rowForServer(cloudRow('ev1|guest|g1', 1_700_000_000_000, guest('g1', 'Ana')), 'user-1', {
      id: 'dev_1',
      name: 'Laptop',
    });
    expect(row).toMatchObject({ user_id: 'user-1', kind: 'guest', record_id: 'ev1|guest|g1', deleted: false, device_name: 'Laptop' });
    const back = rowFromServer(row);
    expect(back.key).toBe('ev1|guest|g1');
    expect(back.updatedAt).toBe(1_700_000_000_000);
  });

  it('leaves the device columns off entirely when the project has none', () => {
    expect('device_id' in rowForServer(cloudRow('ev1|guest|g1', 10, guest('g1', 'A')), 'u', null)).toBe(false);
  });

  it('sends no payload with a deletion', () => {
    const row = rowForServer({ kind: 'guest', key: 'ev1|guest|g1', updatedAt: 10, deleted: true, data: guest('g1', 'A') }, 'u');
    expect(row.data).toBeNull();
    expect(row.deleted).toBe(true);
  });
});

describe('detectServerClock', () => {
  const rows = [cloudRow('ev1|guest|g1', 100, null), cloudRow('ev1|guest|g2', 200, null)];

  it('sees the trigger when the server stamped its own time', () => {
    expect(detectServerClock(rows, new Map([['ev1|guest|g1', 999]]))).toBe(true);
  });

  it('sees no trigger when every row came back unchanged', () => {
    expect(
      detectServerClock(
        rows,
        new Map([
          ['ev1|guest|g1', 100],
          ['ev1|guest|g2', 200],
        ])
      )
    ).toBe(false);
  });

  it('says nothing when the push had nothing to say', () => {
    expect(detectServerClock(rows, new Map())).toBeNull();
  });
});

describe('the two sides', () => {
  const local = stamp(decompose('ev1', event()), 500);

  it('counts what each side holds by kind, for a summary a person can read', () => {
    expect(countByKind(localKeys({ records: local }))).toEqual({ event: 1, guest: 2, table: 1 });
    expect(countByKind(['not a key'])).toEqual({});
  });

  it('counts records and tombstones the way the cloud counts rows', () => {
    expect(localCount({ records: local, deletions: [stone('ev1|guest|gone', 2)] })).toBe(5);
  });

  it('knows a device carrying nothing of its own from one that is not', () => {
    expect(deviceHasNothing({ records: stamp(decompose('ev1', event()), 1) })).toBe(true);
    expect(deviceHasNothing({ records: local })).toBe(false);
    expect(deviceHasNothing({ records: [], deletions: [stone('ev1|guest|g1', 2)] })).toBe(false);
  });

  it('finds what the cloud has never heard of, whatever the flag says', () => {
    const records = [...local, ...stamp(decompose('ev2', event()), 600, true)];
    const missing = missingInCloud(
      { records, deletions: [stone('ev1|guest|gone', 700)] },
      new Set(['ev1|event|ev1', 'ev1|guest|g1'])
    );
    // Believed sent but absent up there; the pending ones are already owed and left alone.
    expect(missing.records.map((r) => r.key)).toEqual(['ev1|guest|g2', 'ev1|table|t1']);
    expect(missing.deletions.map((r) => r.key)).toEqual(['ev1|guest|gone']);
  });
});

describe('project setup', () => {
  it('accepts the three shapes people paste as a project address', () => {
    expect(normalizeUrl('abcdefgh.supabase.co')).toBe('https://abcdefgh.supabase.co');
    expect(normalizeUrl('https://abcdefgh.supabase.co/')).toBe('https://abcdefgh.supabase.co');
    expect(normalizeUrl('  https://abcdefgh.supabase.co  ')).toBe('https://abcdefgh.supabase.co');
  });

  it('refuses a bare word and plain http', () => {
    expect(normalizeUrl('myproject')).toBe('');
    expect(normalizeUrl('http://abcdefgh.supabase.co')).toBe('');
    expect(normalizeUrl('')).toBe('');
  });

  it('refuses the keys that must never sit in a browser', () => {
    expect(checkKey('sb_secret_abc')).toMatchObject({ ok: false, reason: 'secret' });
    expect(checkKey('')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkKey('hello')).toMatchObject({ ok: false, reason: 'shape' });
    expect(checkKey('sb_publishable_abc')).toMatchObject({ ok: true });
  });

  it('refuses a service-role JWT by reading its role claim', () => {
    const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
    expect(checkKey(`aaa.${payload}.bbb`)).toMatchObject({ ok: false, reason: 'serviceRole' });
    const anon = Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url');
    expect(checkKey(`aaa.${anon}.bbb`)).toMatchObject({ ok: true });
  });

  it('asks the confirmation email to come back to this app', () => {
    // A project shared with another app of the user's has that app's Site URL, so the link would
    // land there instead of here unless this address is named.
    expect(signupPath('https://guestseat.rilindkycyku.dev')).toBe(
      'signup?redirect_to=https%3A%2F%2Fguestseat.rilindkycyku.dev'
    );
    // Nothing to name (server-side render, or an origin the browser withheld): plain signup, and
    // Supabase falls back to the Site URL as before.
    expect(signupPath('')).toBe('signup');
  });

  it('finds the project ref only for real Supabase addresses', () => {
    expect(projectRef('https://abcdefghijklmnop.supabase.co')).toBe('abcdefghijklmnop');
    expect(projectRef('https://seating.example.com')).toBe('');
  });

  it('ships one script that creates everything the app needs', () => {
    expect(pendingMigrations(0)).toHaveLength(SCHEMA_VERSION);
    expect(pendingMigrations(SCHEMA_VERSION)).toEqual([]);
    expect(sqlForMigration(SCHEMA_VERSION)).toBe('');
    for (const fragment of [`create table if not exists public.${TABLE}`, 'enable row level security', 'create policy', 'device_id']) {
      expect(SQL_INSTALL).toContain(fragment);
    }
  });
});

describe('device names', () => {
  it('reads the browser and the platform out of a user agent', () => {
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1')).toBe('Safari · iPhone');
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537')).toBe('Chrome · Windows');
    // Every Chromium browser also says "Chrome", so order matters.
    expect(guessDeviceName('Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537 Edg/120')).toBe('Edge · Windows');
    expect(guessDeviceName('')).toBe('Device');
  });
});

describe('modes', () => {
  it('names the three answers exactly once', () => {
    expect(new Set(Object.values(MODES)).size).toBe(3);
  });
});
