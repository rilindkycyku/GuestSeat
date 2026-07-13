import type { EventState } from '../types';

const STORAGE_KEY = 'guestseat.state.v1';

export function loadState(): EventState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EventState;
    if (!parsed || !Array.isArray(parsed.guests) || !Array.isArray(parsed.tables)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: EventState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable — silently skip persistence
  }
}

export function clearState(): void {
  localStorage.removeItem(STORAGE_KEY);
}

const COLLAPSED_KEY = 'guestseat.collapsedTables.v1';

export function loadCollapsedTableIds(): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((id) => typeof id === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

export function saveCollapsedTableIds(ids: Set<string>): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...ids]));
  } catch {
    // storage full or unavailable — silently skip persistence
  }
}

export type ViewMode = 'list' | 'floor';

const VIEW_MODE_KEY = 'guestseat.viewMode.v1';

export function loadViewMode(): ViewMode {
  const raw = localStorage.getItem(VIEW_MODE_KEY);
  return raw === 'floor' ? 'floor' : 'list';
}

export function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // storage full or unavailable — silently skip persistence
  }
}

/** How many table columns to show on narrow (phone) screens. Wider screens always add more. */
export type TableColumns = 1 | 2;

const COLUMNS_KEY = 'guestseat.tableColumns.v1';

export function loadTableColumns(): TableColumns {
  return localStorage.getItem(COLUMNS_KEY) === '1' ? 1 : 2;
}

export function saveTableColumns(cols: TableColumns): void {
  try {
    localStorage.setItem(COLUMNS_KEY, String(cols));
  } catch {
    // storage full or unavailable — silently skip persistence
  }
}

/**
 * Whether a fresh invitation should pre-fill the traditional Albanian program (bride's send-off,
 * çifteli, sofra…) instead of the plain default. An app-level preference, off by default, so it
 * carries across every new event rather than living inside one event's saved state.
 */
const SEED_TRADITIONS_KEY = 'guestseat.seedTraditions.v1';

export function loadSeedTraditions(): boolean {
  return localStorage.getItem(SEED_TRADITIONS_KEY) === '1';
}

export function saveSeedTraditions(on: boolean): void {
  try {
    localStorage.setItem(SEED_TRADITIONS_KEY, on ? '1' : '0');
  } catch {
    // storage full or unavailable — silently skip persistence
  }
}
