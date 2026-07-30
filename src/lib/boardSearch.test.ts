import { describe, expect, it } from 'vitest';
import {
  countSeated,
  groupGuestsByTable,
  matchGuests,
  tablesToRender,
  tablesWithMatches,
  unseatedFor,
} from './boardSearch';
import type { EventState, Guest, Table } from '../types';

/** A translator good enough for table display names ("Table A" / "Tavolina A"). */
const t = ((key: string) => (key === 'tables.namePrefix' ? 'Table' : key)) as never;

function guest(id: string, name: string, extra: Partial<Guest> = {}): Guest {
  return { id, name, tableId: null, ...extra };
}
function table(id: string, name: string, extra: Partial<Table> = {}): Table {
  return { id, name, capacity: 8, ...extra };
}

const state: EventState = {
  eventName: 'Test',
  guests: [
    guest('g1', 'Elira', { surname: 'Hoxha', tableId: 't1', linkedGuestIds: ['g2'] }),
    guest('g2', 'Arben', { surname: 'Hoxha', tableId: 't2', linkedGuestIds: ['g1'] }),
    guest('g3', 'Besa', { surname: 'Krasniqi', tableId: 't1' }),
    guest('g4', 'Dritan'),
  ],
  tables: [table('t1', 'Table A'), table('t2', 'Table B')],
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const allVisible = new Set(['t1', 't2']);

describe('matchGuests', () => {
  it('returns null when nothing is being searched', () => {
    expect(matchGuests(state, '', allVisible, t)).toBeNull();
    expect(matchGuests(state, '   ', allVisible, t)).toBeNull();
  });

  it('matches on first name, surname and case-insensitively', () => {
    expect(matchGuests(state, 'besa', allVisible, t)).toEqual(new Set(['g3']));
    expect(matchGuests(state, 'KRASNIQI', allVisible, t)).toEqual(new Set(['g3']));
  });

  it('matches the table name, which is how someone jumps to a table', () => {
    expect(matchGuests(state, 'Table B', allVisible, t)).toEqual(new Set(['g2', 'g1']));
  });

  it('pulls in linked partners so a couple never shows up half-filtered', () => {
    // Elira matches by name; Arben comes along even though he sits at another table.
    expect(matchGuests(state, 'elira', allVisible, t)).toEqual(new Set(['g1', 'g2']));
  });

  it('ignores guests at tables the tag filter has hidden', () => {
    const onlyT2 = new Set(['t2']);
    expect(matchGuests(state, 'hoxha', onlyT2, t)).toEqual(new Set(['g2']));
    // An unseated guest is never hidden by a table filter.
    expect(matchGuests(state, 'dritan', new Set<string>(), t)).toEqual(new Set(['g4']));
  });
});

describe('tablesWithMatches', () => {
  it('is null while not searching, and lists the matched guests’ tables otherwise', () => {
    expect(tablesWithMatches(state.guests, null)).toBeNull();
    expect(tablesWithMatches(state.guests, new Set(['g3']))).toEqual(new Set(['t1']));
    expect(tablesWithMatches(state.guests, new Set(['g4']))).toEqual(new Set()); // unseated
  });
});

describe('tablesToRender', () => {
  it('shows every filtered table when not searching', () => {
    expect(tablesToRender(state.tables, null, false)).toEqual(state.tables);
    expect(tablesToRender(state.tables, new Set(['t1']), false)).toEqual(state.tables);
  });

  it('narrows to the matched tables while searching', () => {
    expect(tablesToRender(state.tables, new Set(['t2']), true).map((tb) => tb.id)).toEqual(['t2']);
  });
});

describe('unseatedFor', () => {
  it('lists unseated guests alphabetically', () => {
    const guests = [guest('g1', 'Zana'), guest('g2', 'Ana'), guest('g3', 'Seated', { tableId: 't1' })];
    expect(unseatedFor(guests, null).map((g) => g.name)).toEqual(['Ana', 'Zana']);
  });

  it('narrows to the search when one is active', () => {
    expect(unseatedFor(state.guests, new Set(['g1'])).map((g) => g.name)).toEqual([]);
    expect(unseatedFor(state.guests, new Set(['g4'])).map((g) => g.name)).toEqual(['Dritan']);
  });
});

describe('countSeated / groupGuestsByTable', () => {
  it('counts only seated guests, per table', () => {
    expect(countSeated(state.guests)).toEqual(
      new Map([
        ['t1', 2],
        ['t2', 1],
      ])
    );
  });

  it('buckets guests by table, each bucket sorted by name', () => {
    const groups = groupGuestsByTable(state.guests);
    expect(groups.get('t1')?.map((g) => g.name)).toEqual(['Besa', 'Elira']);
    expect(groups.has('t2')).toBe(true);
    expect([...groups.keys()]).not.toContain(null);
  });
});
