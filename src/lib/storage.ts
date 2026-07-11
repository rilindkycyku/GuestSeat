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
