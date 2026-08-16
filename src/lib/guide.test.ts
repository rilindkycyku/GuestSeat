import { describe, expect, it } from 'vitest';
import {
  GUIDE_ENTRIES,
  GUIDE_GROUPS,
  GUIDE_START,
  guideById,
  guideForScreen,
  guideGroup,
  guideNeighbours,
  searchGuide,
  type GuideEntry,
} from './guide';
import { en } from './i18n/en';
import { sq } from './i18n/sq';

type Dict = typeof en;
type Entry = { label: string; title: string; summary: string; steps: { title: string; text: string }[]; tips?: string[] };

const entriesOf = (dict: Dict) => dict.guide.entries as unknown as Record<string, Entry>;

/** Everything an entry says, the way the screen feeds the search. */
const textOf = (dict: Dict) => (entry: GuideEntry) => {
  const copy = entriesOf(dict)[entry.id];
  return [copy.label, copy.title, copy.summary, ...copy.steps.flatMap((s) => [s.title, s.text]), ...(copy.tips ?? [])].join(' ');
};

describe('the guide as data', () => {
  it('covers every entry in both languages', () => {
    for (const entry of GUIDE_ENTRIES) {
      for (const [name, dict] of [
        ['en', en],
        ['sq', sq as unknown as Dict],
      ] as const) {
        const copy = entriesOf(dict)[entry.id];
        expect(copy, `${entry.id} missing from ${name}`).toBeTruthy();
        expect(copy.label.length, `${entry.id}.label empty in ${name}`).toBeGreaterThan(0);
        expect(copy.summary.length, `${entry.id}.summary empty in ${name}`).toBeGreaterThan(20);
        expect(copy.steps.length, `${entry.id}.steps empty in ${name}`).toBeGreaterThan(0);
        for (const step of copy.steps) {
          expect(step.title.length, `a step of ${entry.id} has no title in ${name}`).toBeGreaterThan(0);
          expect(step.text.length, `a step of ${entry.id} has no text in ${name}`).toBeGreaterThan(20);
        }
      }
    }
  });

  it('translates every group it uses', () => {
    for (const group of GUIDE_GROUPS) {
      if (!group) continue;
      expect(en.guide.groups[group]).toBeTruthy();
      expect((sq as unknown as Dict).guide.groups[group]).toBeTruthy();
    }
    // Every entry belongs to a group the list actually renders, or it would never be reachable.
    for (const entry of GUIDE_ENTRIES) expect(GUIDE_GROUPS).toContain(entry.group);
  });

  it('never points "see also" at an entry that does not exist', () => {
    for (const entry of GUIDE_ENTRIES) {
      for (const id of entry.seeAlso ?? []) {
        expect(guideById(id), `${entry.id} points at ${id}`).toBeTruthy();
        expect(id, `${entry.id} points at itself`).not.toBe(entry.id);
      }
    }
  });

  it('gives every screen at most one entry', () => {
    const screens = GUIDE_ENTRIES.map((e) => e.screen).filter(Boolean);
    expect(new Set(screens).size).toBe(screens.length);
    expect(guideForScreen('sync')?.id).toBe('sync');
    expect(guideForScreen(null)).toBeNull();
  });

  it('starts on an entry that exists', () => {
    expect(guideById(GUIDE_START)).toBeTruthy();
    expect(guideById('nonsense')).toBeNull();
    expect(guideById(null)).toBeNull();
  });

  it('reads straight through, first to last', () => {
    expect(guideNeighbours(GUIDE_START).previous).toBeNull();
    const last = GUIDE_ENTRIES[GUIDE_ENTRIES.length - 1];
    expect(guideNeighbours(last.id).next).toBeNull();
    expect(guideNeighbours(GUIDE_START).next?.id).toBe(GUIDE_ENTRIES[1].id);
    expect(guideNeighbours('nonsense')).toEqual({ previous: null, next: null });
  });

  it('groups entries in the order they are listed', () => {
    expect(guideGroup('planning').map((e) => e.id)).toEqual(['import', 'board', 'guests', 'tables', 'autoSeat', 'tags']);
  });
});

describe('searching the guide', () => {
  const inEnglish = textOf(en);
  const inAlbanian = textOf(sq as unknown as Dict);

  it('returns everything for an empty search — the full list is the resting state', () => {
    expect(searchGuide('', inEnglish)).toHaveLength(GUIDE_ENTRIES.length);
    expect(searchGuide('   ', inEnglish)).toHaveLength(GUIDE_ENTRIES.length);
  });

  it('reads the steps and tips, not only the titles', () => {
    // "Ctrl-K" appears in a step of the board entry and nowhere in any title.
    const found = searchGuide('⌘K', inEnglish).map((e) => e.id);
    expect(found).toContain('board');
  });

  it('finds the entry that answers a word the reader knows', () => {
    expect(searchGuide('QR', inEnglish).map((e) => e.id)).toContain('share');
    expect(searchGuide('Supabase', inEnglish).map((e) => e.id)).toContain('sync');
    expect(searchGuide('Excel', inEnglish).map((e) => e.id)).toContain('exports');
  });

  it('ignores accents and case, so Albanian searches work as typed', () => {
    expect(searchGuide('kopje', inAlbanian).map((e) => e.id)).toContain('backup');
    // Typed without the ë, as anybody in a hurry would.
    expect(searchGuide('mysafiret', inAlbanian).map((e) => e.id).length).toBeGreaterThan(0);
    expect(searchGuide('TAVOLINA', inAlbanian).map((e) => e.id)).toContain('tables');
  });

  it('returns nothing for a word no entry contains', () => {
    expect(searchGuide('zxcvbnm', inEnglish)).toEqual([]);
  });
});
