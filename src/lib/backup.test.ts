import { describe, expect, it } from 'vitest';
import type { EventState } from '../types';
import type { StoredEvent } from './db';
import { BACKUP_APP, BackupError, backupFilename, buildBackup, parseBackup } from './backup';

const state = (name: string): EventState => ({
  eventName: name,
  guests: [{ id: 'g1', name: 'Ana', tableId: 't1' }],
  tables: [{ id: 't1', name: 'Table 1', capacity: 8 }],
  updatedAt: '2026-08-15T10:00:00.000Z',
});

const record = (id: string, name = id): StoredEvent => ({ id, state: state(name) });

describe('buildBackup', () => {
  it('writes every saved event, id and all', () => {
    const backup = buildBackup([record('ev1', 'Wedding'), record('ev2', 'Engagement')]);
    expect(backup.app).toBe(BACKUP_APP);
    expect(backup.events.map((e) => e.id)).toEqual(['ev1', 'ev2']);
    expect(backup.events[0].state.eventName).toBe('Wedding');
  });

  it('writes nothing but the id and the event itself', () => {
    // What a device knows about its own cloud copy lives in the record rows, not here; carried into
    // another browser it would claim rows had been sent that never were.
    const backup = buildBackup([{ ...record('ev1'), updatedAt: 500, pending: true } as StoredEvent]);
    expect(Object.keys(backup.events[0]).sort()).toEqual(['id', 'state']);
  });

  it('skips a record whose state is not an event', () => {
    const broken = { id: 'x', state: { eventName: 'x' } } as unknown as StoredEvent;
    expect(buildBackup([broken, record('ev1')]).events.map((e) => e.id)).toEqual(['ev1']);
  });

  it('dates the filename so a folder of backups sorts itself', () => {
    expect(backupFilename(new Date('2026-08-15T22:00:00Z'))).toBe('guestseat-backup-2026-08-15.json');
  });
});

describe('parseBackup', () => {
  it('reads back what buildBackup wrote', () => {
    const file = JSON.parse(JSON.stringify(buildBackup([record('ev1', 'Wedding')])));
    const parsed = parseBackup(file);
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0]).toMatchObject({ id: 'ev1' });
    expect(parsed.events[0].state.guests).toHaveLength(1);
  });

  it('accepts a single event, which is what the board\'s own JSON export writes', () => {
    const parsed = parseBackup(state('Just one'));
    expect(parsed.events).toHaveLength(1);
    expect(parsed.events[0].state.eventName).toBe('Just one');
    // It has no id of its own, so it gets a fresh one rather than colliding with something here.
    expect(parsed.events[0].id).toBeTruthy();
  });

  it('accepts a bare array of events', () => {
    const parsed = parseBackup([state('A'), state('B')]);
    expect(parsed.events.map((e) => e.state.eventName)).toEqual(['A', 'B']);
  });

  it('refuses a backup of another app by name', () => {
    try {
      parseBackup({ app: 'FinanCarePersonal', events: [] });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BackupError);
      expect((err as BackupError).code).toBe('otherApp');
      expect((err as BackupError).app).toBe('FinanCarePersonal');
    }
  });

  it('refuses what is not a backup at all', () => {
    expect(() => parseBackup('nonsense')).toThrow(BackupError);
    expect(() => parseBackup({ hello: 'world' })).toThrow(BackupError);
    expect(() => parseBackup({ app: 'GuestSeat', events: [] })).toThrow(BackupError);
  });

  it('names an event whose own name did not survive', () => {
    const parsed = parseBackup({ events: [{ id: 'ev1', state: { ...state('x'), eventName: '  ' } }] }, 'Untitled');
    expect(parsed.events[0].state.eventName).toBe('Untitled');
  });

  it('carries through fields a newer release added', () => {
    const withExtra = { ...state('X'), somethingNew: 42 };
    const parsed = parseBackup({ events: [{ id: 'ev1', state: withExtra }] });
    expect((parsed.events[0].state as unknown as { somethingNew: number }).somethingNew).toBe(42);
  });

  it('drops entries that are not events instead of failing the whole file', () => {
    const parsed = parseBackup({ events: [{ id: 'a', state: { nope: true } }, { id: 'b', state: state('B') }] });
    expect(parsed.events.map((e) => e.id)).toEqual(['b']);
  });
});
