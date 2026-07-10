import type { EventState } from '../types';
import raw from '../data/defaultGuestList.json';

/**
 * The guest list bundled with the app. It's in this app's own full-export shape
 * ({ eventName, guests, tables, updatedAt }), so it can be used directly as an
 * EventState. Returns a fresh deep copy each call so callers never mutate the
 * imported module object.
 */
export function getDefaultEventState(): EventState {
  const clone = structuredClone(raw) as EventState;
  return { ...clone, updatedAt: new Date().toISOString() };
}
