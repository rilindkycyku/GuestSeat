import { describe, expect, it } from 'vitest';
import { FIND_SEAT_LIMIT, findSeatMatches, foldName } from './findSeat';
import type { EventState, Guest, Table, TableTag } from '../types';

function guest(id: string, name: string, extra: Partial<Guest> = {}): Guest {
  return { id, name, tableId: null, ...extra };
}
function table(id: string, name: string, extra: Partial<Table> = {}): Table {
  return { id, name, capacity: 8, ...extra };
}

const tags: TableTag[] = [
  { id: 'tag1', label: "Bride's family", color: 'rose' },
  { id: 'tag2', label: 'Work friends', color: 'sky' },
];

/** Two guests called Butrinti — the case that sent the guest screen back to the drawing board. */
const state: EventState = {
  eventName: 'Test',
  guests: [
    guest('g1', 'Butrinti', { surname: 'Kyçyku', tableId: 't1', tagIds: ['tag1'], linkedGuestIds: ['g2'] }),
    guest('g2', 'Erza', { surname: 'Kyçyku', tableId: 't1', linkedGuestIds: ['g1'], meal: 'Fish' }),
    guest('g3', 'Butrinti', { surname: 'Kyçyku', tableId: 't2', tagIds: ['tag2'] }),
    guest('g4', 'Kyçyku', { surname: 'Behar' }),
  ],
  tables: [table('t1', 'Tavolina 16'), table('t2', 'Tavolina 3', { side: 'bride' })],
  tags,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

describe('foldName', () => {
  it('strips Albanian accents and case', () => {
    expect(foldName('Kyçyku')).toBe('kycyku');
    expect(foldName('  Bësa   Hoxha ')).toBe('besa hoxha');
  });
});

describe('findSeatMatches', () => {
  it('lists nothing until the minimum query length is reached', () => {
    expect(findSeatMatches(state, '')).toEqual({ matches: [], total: 0 });
    expect(findSeatMatches(state, 'b')).toEqual({ matches: [], total: 0 });
    expect(findSeatMatches(state, '  ')).toEqual({ matches: [], total: 0 });
  });

  it('matches without the accents a phone keyboard may not offer', () => {
    const ids = findSeatMatches(state, 'kycyku').matches.map((m) => m.guest.id);
    expect(ids).toContain('g1');
    expect(ids).toContain('g2');
  });

  it('matches a name and surname typed in either order', () => {
    expect(findSeatMatches(state, 'butrinti kycyku').matches.map((m) => m.guest.id)).toEqual(['g1', 'g3']);
    expect(findSeatMatches(state, 'kycyku butrinti').matches.map((m) => m.guest.id)).toEqual(['g1', 'g3']);
  });

  it('still matches mid-word, as the plain substring search did', () => {
    expect(findSeatMatches(state, 'utrint').matches.map((m) => m.guest.id)).toEqual(['g1', 'g3']);
  });

  it('ranks a fully typed name above someone whose other names contain it', () => {
    // "Kyçyku Behar" carries the query as a surname; the guest actually called that comes first.
    expect(findSeatMatches(state, 'kycyku').matches[0].guest.id).toBe('g4');
  });

  it("doesn't let one word satisfy two query words", () => {
    expect(findSeatMatches(state, 'butr butr').matches).toEqual([]);
  });

  it('carries the table, group tags and linked companions of each match', () => {
    const [match] = findSeatMatches(state, 'butrinti kycyku').matches;
    expect(match.table?.name).toBe('Tavolina 16');
    expect(match.tags.map((tag) => tag.label)).toEqual(["Bride's family"]);
    expect(match.companions).toEqual(['Erza Kyçyku']);
  });

  it('flags cards that share a name, and whether they sit apart', () => {
    const both = findSeatMatches(state, 'butrinti').matches;
    expect(both).toHaveLength(2);
    expect(both[0].sameName).toEqual({ index: 1, count: 2, oneTable: false });
    expect(both[1].sameName).toEqual({ index: 2, count: 2, oneTable: false });
  });

  it('says so when the namesakes all sit at the same table', () => {
    const together: EventState = {
      ...state,
      guests: [guest('a', 'Butrinti', { tableId: 't1' }), guest('b', 'Butrinti', { tableId: 't1' })],
    };
    const matches = findSeatMatches(together, 'butrinti').matches;
    expect(matches.map((m) => m.sameName?.oneTable)).toEqual([true, true]);
  });

  it('leaves a unique name unflagged', () => {
    expect(findSeatMatches(state, 'erza').matches[0].sameName).toBeUndefined();
  });

  it('treats two unseated namesakes as still ambiguous', () => {
    const unseated: EventState = {
      ...state,
      guests: [guest('a', 'Butrinti'), guest('b', 'Butrinti')],
    };
    expect(findSeatMatches(unseated, 'butrinti').matches.map((m) => m.sameName?.oneTable)).toEqual([false, false]);
  });

  it('caps the cards shown but reports the true total', () => {
    const many: EventState = {
      ...state,
      guests: Array.from({ length: FIND_SEAT_LIMIT + 5 }, (_, i) => guest(`g${i}`, `Besa ${i}`)),
    };
    const result = findSeatMatches(many, 'besa');
    expect(result.matches).toHaveLength(FIND_SEAT_LIMIT);
    expect(result.total).toBe(FIND_SEAT_LIMIT + 5);
  });

  it('leaves the table null for a guest with no seat yet', () => {
    const [match] = findSeatMatches(state, 'kycyku behar').matches;
    expect(match.table).toBeNull();
  });

  it('drops links pointing at guests who are no longer in the list', () => {
    const dangling: EventState = {
      ...state,
      guests: [guest('g1', 'Butrinti', { linkedGuestIds: ['gone'] })],
    };
    expect(findSeatMatches(dangling, 'butrinti').matches[0].companions).toEqual([]);
  });
});
