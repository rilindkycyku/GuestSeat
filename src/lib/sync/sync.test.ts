import { describe, expect, it } from 'vitest';
import type { EventState } from '../../types';
import type { StoredEvent, Tombstone } from '../db';
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
  rowKey,
  unstamped,
  type SyncRow,
} from './sync';
import { guessDeviceName } from './device';
import { checkKey, normalizeUrl, projectRef } from './supabase';
import { SCHEMA_VERSION, SQL_INSTALL, TABLE, pendingMigrations, sqlForMigration } from './schema';

const state = (name: string): EventState => ({
  eventName: name,
  guests: [],
  tables: [],
  updatedAt: '2026-08-15T10:00:00.000Z',
});

const event = (id: string, at: number, pending = false): StoredEvent => ({
  id,
  state: state(id),
  updatedAt: at,
  pending,
});

const stone = (id: string, at: number, pending = false): Tombstone => ({
  key: `events:${id}`,
  kind: 'events',
  id,
  updatedAt: at,
  pending,
});

const cloudRow = (id: string, at: number, extra: Partial<SyncRow> = {}): SyncRow => ({
  kind: 'events',
  id,
  updatedAt: at,
  deleted: false,
  data: state(id),
  ...extra,
});

describe('localChanges', () => {
  it('sends only what is still waiting, records and tombstones alike', () => {
    const rows = localChanges({
      records: [event('a', 10, true), event('b', 20)],
      deletions: [stone('c', 30, true), stone('d', 40)],
    });
    expect(rows.map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect(rows.find((r) => r.id === 'c')).toMatchObject({ deleted: true, data: null });
  });

  it('sends everything when asked, flags ignored', () => {
    const rows = localChanges({ records: [event('a', 10), event('b', 20)], all: true });
    expect(rows).toHaveLength(2);
  });

  it('never re-sends what this same sync has just applied', () => {
    const rows = localChanges({
      records: [event('a', 10, true)],
      exclude: new Set([rowKey('events', 'a')]),
    });
    expect(rows).toEqual([]);
  });
});

describe('localSnapshot', () => {
  it('keeps records that predate sync out of "unsent wins"', () => {
    // Dated TIME_BEFORE_SYNC: flagged so it reaches a cloud that never held it, but it must lose to
    // anything the cloud does hold under the same id.
    const { times, pending } = localSnapshot({ records: [event('old', 1, true), event('new', 500, true)] });
    expect(times.get('events:old')).toBe(1);
    expect(pending.has('events:old')).toBe(false);
    expect(pending.has('events:new')).toBe(true);
  });
});

describe('applyPlan', () => {
  it('writes what the cloud holds when the local copy is settled', () => {
    const plan = applyPlan([cloudRow('a', 200)], localSnapshot({ records: [event('a', 100)] }));
    expect(plan.write.map((r) => r.id)).toEqual(['a']);
    expect(plan.maxTs).toBe(200);
  });

  it('keeps an unsent local change and skips the cloud row', () => {
    const plan = applyPlan([cloudRow('a', 200)], localSnapshot({ records: [event('a', 100, true)] }));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(1);
    // Still counted towards the watermark: skipping it is a decision, not a reason to fetch it again.
    expect(plan.maxTs).toBe(200);
  });

  it('lets the cloud win over an unsent change when a device is joining a copy', () => {
    const plan = applyPlan([cloudRow('a', 200)], localSnapshot({ records: [event('a', 100, true)] }), {
      cloudWins: true,
    });
    expect(plan.write.map((r) => r.id)).toEqual(['a']);
  });

  it('skips a row whose timestamp matches exactly — this device pushed it', () => {
    const plan = applyPlan([cloudRow('a', 100)], localSnapshot({ records: [event('a', 100)] }));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(1);
  });

  it('applies a deletion only for something this device actually has', () => {
    const snapshot = localSnapshot({ records: [event('a', 100)] });
    const plan = applyPlan([cloudRow('a', 200, { deleted: true, data: null }), cloudRow('z', 200, { deleted: true, data: null })], snapshot);
    expect(plan.remove.map((r) => r.id)).toEqual(['a']);
    expect(plan.skipped).toBe(1);
  });

  it('ignores rows from a kind the app does not know, and payloads that are not events', () => {
    const rows: SyncRow[] = [
      { kind: 'nonsense', id: 'x', updatedAt: 10, deleted: false, data: state('x') },
      { kind: 'events', id: 'y', updatedAt: 10, deleted: false, data: { hello: 'world' } as unknown as EventState },
    ];
    const plan = applyPlan(rows, localSnapshot({}));
    expect(plan.write).toEqual([]);
    expect(plan.skipped).toBe(2);
  });

  it('reports every key it touched, so the push does not send them straight back', () => {
    const plan = applyPlan(
      [cloudRow('a', 200), cloudRow('b', 300, { deleted: true, data: null })],
      localSnapshot({ records: [event('a', 100), event('b', 100)] })
    );
    expect([...plan.keys].sort()).toEqual(['events:a', 'events:b']);
  });
});

describe('server rows', () => {
  it('round-trips through the table shape', () => {
    const row = rowForServer(cloudRow('a', 1_700_000_000_000), 'user-1', { id: 'dev_1', name: 'Laptop' });
    expect(row).toMatchObject({ user_id: 'user-1', kind: 'events', record_id: 'a', deleted: false, device_name: 'Laptop' });
    const back = rowFromServer({ ...row, updated_at: row.updated_at });
    expect(back.id).toBe('a');
    expect(back.updatedAt).toBe(1_700_000_000_000);
  });

  it('leaves the device columns off entirely when the project has none', () => {
    const row = rowForServer(cloudRow('a', 10), 'user-1', null);
    expect('device_id' in row).toBe(false);
  });

  it('sends no payload with a deletion', () => {
    const row = rowForServer({ kind: 'events', id: 'a', updatedAt: 10, deleted: true, data: state('a') }, 'u');
    expect(row.data).toBeNull();
    expect(row.deleted).toBe(true);
  });
});

describe('detectServerClock', () => {
  const rows = [cloudRow('a', 100), cloudRow('b', 200)];

  it('sees the trigger when the server stamped its own time', () => {
    expect(detectServerClock(rows, new Map([['events:a', 999]]))).toBe(true);
  });

  it('sees no trigger when every row came back unchanged', () => {
    expect(
      detectServerClock(
        rows,
        new Map([
          ['events:a', 100],
          ['events:b', 200],
        ])
      )
    ).toBe(false);
  });

  it('says nothing when the push had nothing to say', () => {
    expect(detectServerClock(rows, new Map())).toBeNull();
  });
});

describe('the two sides', () => {
  it('counts keys per kind', () => {
    expect(countByKind(['events:a', 'events:b', 'meta:x', 'nocolon'])).toEqual({ events: 2, meta: 1 });
  });

  it('counts records and tombstones the way the cloud counts rows', () => {
    expect(localCount({ records: [event('a', 1)], deletions: [stone('b', 2)] })).toBe(2);
    expect([...localKeys({ records: [event('a', 1)], deletions: [stone('b', 2)] })].sort()).toEqual([
      'events:a',
      'events:b',
    ]);
  });

  it('knows a device carrying nothing of its own from one that is not', () => {
    expect(deviceHasNothing({ records: [event('a', 1)] })).toBe(true);
    expect(deviceHasNothing({ records: [event('a', 500)] })).toBe(false);
    expect(deviceHasNothing({ records: [], deletions: [stone('b', 2)] })).toBe(false);
  });

  it('finds what the cloud has never heard of, whatever the flag says', () => {
    const missing = missingInCloud(
      { records: [event('a', 10), event('b', 20), event('c', 30, true)], deletions: [stone('d', 40)] },
      new Set(['events:a'])
    );
    // `b` is believed sent but is not there; `c` is already owed; `a` is present.
    expect(missing.records.map((r) => r.id)).toEqual(['b']);
    expect(missing.deletions.map((r) => r.id)).toEqual(['d']);
  });

  it('finds the records that predate sync, once', () => {
    const first = unstamped([event('a', 0), event('b', 1), event('c', 1, true), event('d', 500)]);
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
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
