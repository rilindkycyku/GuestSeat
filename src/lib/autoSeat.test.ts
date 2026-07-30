import { describe, expect, it } from 'vitest';
import { autoSeat, seatedFeuds } from './autoSeat';
import type { EventState, Guest, Table } from '../types';

function guest(id: string, extra: Partial<Guest> = {}): Guest {
  return { id, name: id.toUpperCase(), tableId: null, ...extra };
}
function table(id: string, capacity: number, extra: Partial<Table> = {}): Table {
  return { id, name: id, capacity, ...extra };
}
function event(guests: Guest[], tables: Table[], tags: EventState['tags'] = []): EventState {
  return { eventName: 'Test', guests, tables, tags, updatedAt: '2026-07-01T00:00:00.000Z' };
}

/** The seating the run would produce, as tableId → guest ids. */
function seatingOf(state: EventState) {
  const { assignments } = autoSeat(state);
  const map = new Map<string, string[]>();
  for (const a of assignments) map.set(a.tableId, [...(map.get(a.tableId) ?? []), a.guestId]);
  return map;
}

describe('autoSeat', () => {
  it('never seats more guests than a table holds', () => {
    const state = event([guest('a'), guest('b'), guest('c')], [table('t1', 2), table('t2', 2)]);
    const result = autoSeat(state);
    const perTable = new Map<string, number>();
    for (const a of result.assignments) perTable.set(a.tableId, (perTable.get(a.tableId) ?? 0) + 1);
    for (const [id, count] of perTable) {
      expect(count).toBeLessThanOrEqual(state.tables.find((tb) => tb.id === id)!.capacity);
    }
    expect(result.seated).toBe(3);
  });

  it('counts seats already taken', () => {
    const state = event([guest('seated', { tableId: 't1' }), guest('a'), guest('b')], [table('t1', 2)]);
    const result = autoSeat(state);
    expect(result.seated).toBe(1);
    expect(result.leftUnseated).toBe(1);
  });

  it('never moves a guest who is already seated', () => {
    const state = event([guest('a', { tableId: 't1' }), guest('b')], [table('t1', 4), table('t2', 4)]);
    const result = autoSeat(state);
    expect(result.assignments.some((x) => x.guestId === 'a')).toBe(false);
  });

  it('keeps linked guests at one table', () => {
    const state = event(
      [guest('a', { linkedGuestIds: ['b'] }), guest('b', { linkedGuestIds: ['a'] }), guest('c'), guest('d')],
      [table('t1', 2), table('t2', 2)]
    );
    const seating = seatingOf(state);
    const tableOf = (id: string) => [...seating].find(([, ids]) => ids.includes(id))![0];
    expect(tableOf('a')).toBe(tableOf('b'));
  });

  it('skips guests who declined', () => {
    const state = event([guest('a', { rsvp: 'declined' }), guest('b')], [table('t1', 4)]);
    const result = autoSeat(state);
    expect(result.assignments.map((a) => a.guestId)).toEqual(['b']);
    expect(result.leftUnseated).toBe(0);
  });

  it('prefers a table sharing the party’s tags', () => {
    const state = event(
      [guest('a', { tagIds: ['work'] })],
      [table('t1', 4), table('t2', 4, { tagIds: ['work'] })],
      [{ id: 'work', label: 'Work', color: 'sky' }]
    );
    expect(autoSeat(state).assignments[0].tableId).toBe('t2');
  });

  it('leaves big empty tables for big parties', () => {
    const state = event(
      [guest('a', { linkedGuestIds: ['b'] }), guest('b', { linkedGuestIds: ['a'] }), guest('c')],
      [table('small', 1), table('big', 2)]
    );
    const seating = seatingOf(state);
    expect(seating.get('big')?.sort()).toEqual(['a', 'b']);
    expect(seating.get('small')).toEqual(['c']);
  });
});

describe('autoSeat — keep apart', () => {
  it('does not seat a guest at a table holding someone they must avoid', () => {
    const state = event(
      [guest('foe', { tableId: 't1' }), guest('a', { apartGuestIds: ['foe'] })],
      [table('t1', 4), table('t2', 4)]
    );
    expect(autoSeat(state).assignments).toEqual([{ guestId: 'a', tableId: 't2' }]);
  });

  it('honours a keep-apart that only one side recorded', () => {
    // A hand-edited file can carry a one-sided reference; the app itself always writes both.
    const state = event(
      [guest('foe', { tableId: 't1', apartGuestIds: ['a'] }), guest('a')],
      [table('t1', 4), table('t2', 4)]
    );
    expect(autoSeat(state).assignments).toEqual([{ guestId: 'a', tableId: 't2' }]);
  });

  it('keeps two feuding unseated guests off the same table within one run', () => {
    const state = event(
      [guest('a', { apartGuestIds: ['b'] }), guest('b', { apartGuestIds: ['a'] })],
      [table('t1', 8), table('t2', 8)]
    );
    const seating = seatingOf(state);
    const tableOf = (id: string) => [...seating].find(([, ids]) => ids.includes(id))?.[0];
    expect(tableOf('a')).not.toBe(tableOf('b'));
    expect(autoSeat(state).seated).toBe(2);
  });

  it('reports who it could not place, and that a feud was the reason', () => {
    const state = event(
      [guest('foe', { tableId: 't1' }), guest('a', { surname: 'Krasniqi', apartGuestIds: ['foe'] })],
      [table('t1', 4)]
    );
    const result = autoSeat(state);
    expect(result.seated).toBe(0);
    expect(result.unplaced).toEqual([{ names: ['A Krasniqi'], reason: 'keepApart' }]);
  });

  it('reports a party that simply did not fit anywhere', () => {
    const state = event(
      [guest('a', { linkedGuestIds: ['b'] }), guest('b', { linkedGuestIds: ['a'] })],
      [table('t1', 1)]
    );
    const result = autoSeat(state);
    expect(result.unplaced).toEqual([{ names: ['A', 'B'], reason: 'noRoom' }]);
    expect(result.leftUnseated).toBe(2);
  });

  it('groups an unplaced family into one entry, not one per guest', () => {
    const state = event(
      [
        guest('a', { linkedGuestIds: ['b', 'c'] }),
        guest('b', { linkedGuestIds: ['a'] }),
        guest('c', { linkedGuestIds: ['a'] }),
        guest('d'),
      ],
      [table('t1', 1)]
    );
    const result = autoSeat(state);
    expect(result.unplaced).toHaveLength(1);
    expect(result.unplaced[0].names).toEqual(['A', 'B', 'C']);
    expect(result.assignments).toEqual([{ guestId: 'd', tableId: 't1' }]);
  });

  it('lets links win over a contradictory keep-apart instead of refusing to seat', () => {
    // Only reachable from an imported file — the guest editor won't offer such a pair.
    const state = event(
      [
        guest('a', { linkedGuestIds: ['b'], apartGuestIds: ['b'] }),
        guest('b', { linkedGuestIds: ['a'], apartGuestIds: ['a'] }),
      ],
      [table('t1', 4)]
    );
    const result = autoSeat(state);
    expect(result.seated).toBe(2);
    expect(new Set(result.assignments.map((x) => x.tableId))).toEqual(new Set(['t1']));
  });

  it('has nothing to do with no tables at all', () => {
    const result = autoSeat(event([guest('a')], []));
    expect(result).toEqual({
      assignments: [],
      seated: 0,
      leftUnseated: 1,
      unplaced: [{ names: ['A'], reason: 'noRoom' }],
    });
  });
});

describe('seatedFeuds', () => {
  it('finds keep-apart pairs sharing a table', () => {
    const guests = [
      guest('a', { tableId: 't1', apartGuestIds: ['b'] }),
      guest('b', { tableId: 't1', apartGuestIds: ['a'] }),
      guest('c', { tableId: 't2', apartGuestIds: ['a'] }),
    ];
    const feuds = seatedFeuds(guests);
    expect(feuds.get('a')?.map((g) => g.id)).toEqual(['b']);
    expect(feuds.get('b')?.map((g) => g.id)).toEqual(['a']);
    expect(feuds.has('c')).toBe(false); // seated elsewhere, so no clash
  });

  it('ignores unseated guests and stale references', () => {
    const guests = [
      guest('a', { apartGuestIds: ['b'] }),
      guest('b', { tableId: 't1' }),
      guest('c', { tableId: 't1', apartGuestIds: ['ghost'] }),
    ];
    expect(seatedFeuds(guests).size).toBe(0);
  });
});
