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
