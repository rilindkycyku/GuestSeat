import { foldName } from './findSeat';

/**
 * What the guide covers: one entry per screen of the app, kept here as data rather than as text
 * written inside a component.
 *
 * The reason is the same one that keeps the default tags out of the settings dialog: the copy has to
 * be **searchable** (the box reads the steps, not only the titles — somebody typing "QR" or "backup"
 * does not know which screen answers, which is exactly why they are typing), it has to be **grouped**
 * the way the app is, and each screen has to be able to find its own entry without knowing where it
 * sits in the list. Prose scattered through JSX can do none of that, and cannot be tested either.
 *
 * The copy itself lives in the dictionaries (`guide.entries.<id>`), because it exists twice — once
 * in Albanian and once in English. This file holds only the shape: what order, which group, which
 * icon, which screen it opens, and what it points at next.
 *
 * Pure functions; the screen only reads them.
 */

/** One numbered step: what to do, and what it means. */
export interface GuideStep {
  title: string;
  text: string;
}

/** An entry as the screen reads it — the shape from here, the words from the dictionary. */
export interface GuideEntry {
  id: string;
  /** Group key (translated as `guide.groups.<group>`), or null for the ones that lead the list. */
  group: GuideGroup;
  /** The emoji the same thing wears elsewhere in the app, so the guide looks like what it explains. */
  icon: string;
  /** The screen this entry is about, when the app can open it from here. */
  screen?: GuideScreen;
  /** Other entries worth reading next. */
  seeAlso?: string[];
}

export type GuideGroup = null | 'planning' | 'day' | 'data';

/** The screens the guide can open directly — "show me" beats "go and find it". */
export type GuideScreen =
  | 'import'
  | 'board'
  | 'autoSeat'
  | 'tags'
  | 'details'
  | 'invitation'
  | 'share'
  | 'checkin'
  | 'stats'
  | 'exports'
  | 'backup'
  | 'sync';

/** The groups in the order the app itself is arranged — whoever knows the app finds the entry where
 * they expect it. The first has no heading on purpose: the quick start leads the list and is not a
 * screen at all. */
export const GUIDE_GROUPS: GuideGroup[] = [null, 'planning', 'day', 'data'];

export const GUIDE_ENTRIES: GuideEntry[] = [
  { id: 'start', group: null, icon: '🚀', seeAlso: ['import', 'board', 'backup'] },

  { id: 'import', group: 'planning', icon: '📥', screen: 'import', seeAlso: ['board', 'guests'] },
  { id: 'board', group: 'planning', icon: '🪑', screen: 'board', seeAlso: ['autoSeat', 'tables', 'guests'] },
  { id: 'guests', group: 'planning', icon: '🧑', seeAlso: ['tags', 'autoSeat', 'checkin'] },
  { id: 'tables', group: 'planning', icon: '⭕', seeAlso: ['board', 'tags'] },
  { id: 'autoSeat', group: 'planning', icon: '✨', screen: 'autoSeat', seeAlso: ['guests', 'tags'] },
  { id: 'tags', group: 'planning', icon: '🏷️', screen: 'tags', seeAlso: ['guests', 'tables'] },

  { id: 'details', group: 'day', icon: '🗓️', screen: 'details', seeAlso: ['invitation', 'exports'] },
  { id: 'invitation', group: 'day', icon: '💌', screen: 'invitation', seeAlso: ['details', 'exports'] },
  { id: 'share', group: 'day', icon: '📱', screen: 'share', seeAlso: ['checkin', 'privacy'] },
  { id: 'checkin', group: 'day', icon: '🎉', screen: 'checkin', seeAlso: ['share', 'stats'] },
  { id: 'stats', group: 'day', icon: '📊', screen: 'stats', seeAlso: ['board', 'autoSeat'] },

  { id: 'exports', group: 'data', icon: '🖨️', screen: 'exports', seeAlso: ['invitation', 'backup'] },
  { id: 'backup', group: 'data', icon: '💾', screen: 'backup', seeAlso: ['sync', 'privacy'] },
  { id: 'sync', group: 'data', icon: '☁️', screen: 'sync', seeAlso: ['backup', 'privacy'] },
  { id: 'privacy', group: 'data', icon: '🔒', seeAlso: ['sync', 'backup'] },
];

export const GUIDE_START = GUIDE_ENTRIES[0].id;

/** The entry with this id, or null. */
export function guideById(id: string | null | undefined): GuideEntry | null {
  if (!id) return null;
  return GUIDE_ENTRIES.find((entry) => entry.id === id) ?? null;
}

/** The entry a screen is about, so a "how does this work?" button can find its own without naming
 * it — nothing to leave dangling when an entry is renamed. */
export function guideForScreen(screen: GuideScreen | null | undefined): GuideEntry | null {
  if (!screen) return null;
  return GUIDE_ENTRIES.find((entry) => entry.screen === screen) ?? null;
}

export function guideGroup(group: GuideGroup): GuideEntry[] {
  return GUIDE_ENTRIES.filter((entry) => entry.group === group);
}

/**
 * Search across every word of an entry — the title, the summary, the steps and the tips, not just
 * the names of screens. Somebody typing "QR", "Excel" or "kopje" does not know which screen answers;
 * that is the reason they are typing.
 *
 * The text comes from the caller because it lives in the dictionaries and this file stays free of
 * them — the same reason the icons here are emoji strings and not components.
 *
 * Accent- and case-insensitive through {@link foldName}: "kycyku" finds "Kyçyku", and "shperndaj"
 * finds "shpërndaj". An empty search returns everything, because the full list is the screen's
 * resting state.
 */
export function searchGuide(query: string, textOf: (entry: GuideEntry) => string): GuideEntry[] {
  const needle = foldName(query);
  if (!needle) return GUIDE_ENTRIES;
  return GUIDE_ENTRIES.filter((entry) => foldName(textOf(entry)).includes(needle));
}

/** The entries either side of this one, so the guide can be read straight through rather than by
 * returning to the list after every page. */
export function guideNeighbours(id: string): { previous: GuideEntry | null; next: GuideEntry | null } {
  const index = GUIDE_ENTRIES.findIndex((entry) => entry.id === id);
  if (index === -1) return { previous: null, next: null };
  return { previous: GUIDE_ENTRIES[index - 1] ?? null, next: GUIDE_ENTRIES[index + 1] ?? null };
}
