/**
 * Which device this is.
 *
 * Everything else about sync is deliberately anonymous: one account, one table, and rows that only
 * say *what* changed. That is fine right up until something goes wrong — a tablet that pushed an
 * empty event over an evening's seating, say — and then the first question is the one the data
 * cannot answer: **which of my devices did that?** The same email is signed in on all of them, so
 * the account says nothing, and `updated_at` says when but not who.
 *
 * So each browser gives itself a name and an id, once, and stamps them on every row it pushes. The
 * id is random and means nothing outside this account; the name is whatever the user calls it
 * ("The tablet", "Work laptop"), guessed from the browser the first time so it is useful before
 * anyone has typed anything.
 *
 * Kept in `localStorage` rather than in the events on purpose: it describes *this browser*, not the
 * user's guest list, so it must not travel in the sync — a device id that synced would make every
 * device claim to be the same one.
 */

const KEY = 'guestseat.device';

export interface DeviceIdentity {
  id: string;
  name: string;
  /** ms epoch of the moment this browser first introduced itself. */
  created: number;
}

/** A device that has not introduced itself yet — what every reader sees before the first write. */
const EMPTY: DeviceIdentity = { id: '', name: '', created: 0 };

/**
 * The browser and platform in a few words, for the name a device starts with.
 *
 * Pure and given the string rather than reading it, so it can be tested. Deliberately coarse: this
 * is a label in a list of three or four devices, not analytics, and "Chrome on Android" is enough
 * for someone to know which of their own things they are looking at. Order matters — every
 * Chromium browser also says "Chrome", and Edge also says "Chromium".
 */
export function guessDeviceName(ua = ''): string {
  const text = String(ua);
  const browser = /Edg\//i.test(text)
    ? 'Edge'
    : /OPR\/|Opera/i.test(text)
      ? 'Opera'
      : /SamsungBrowser/i.test(text)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/i.test(text)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(text)
            ? 'Chrome'
            : /Safari/i.test(text)
              ? 'Safari'
              : '';
  const system = /iPad/i.test(text)
    ? 'iPad'
    : /iPhone|iPod/i.test(text)
      ? 'iPhone'
      : /Android/i.test(text)
        ? 'Android'
        : /Windows/i.test(text)
          ? 'Windows'
          : /Mac OS X|Macintosh/i.test(text)
            ? 'Mac'
            : /Linux/i.test(text)
              ? 'Linux'
              : '';

  if (browser && system) return `${browser} · ${system}`;
  return browser || system || 'Device';
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return `dev_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    }
  } catch {
    // Falls through to the clock-and-random id below, which is just as unique for four devices.
  }
  return `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

function read(): DeviceIdentity {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<DeviceIdentity>) } : { ...EMPTY };
  } catch {
    // Private browsing, or a corrupted entry. Both mean "this browser has no name yet".
    return { ...EMPTY };
  }
}

function write(device: DeviceIdentity): DeviceIdentity {
  try {
    localStorage.setItem(KEY, JSON.stringify(device));
  } catch {
    // The identity is a convenience, not a credential: sync works without it, the rows simply
    // arrive unsigned. Nothing here is worth failing a sync over.
  }
  return device;
}

/**
 * This device, creating its identity the first time anybody asks.
 *
 * Created here rather than at startup so a browser that never connects a project never invents an
 * id it has no use for — and so the id is in place before the very first row is pushed, whichever
 * path gets there first.
 */
export function thisDevice(): DeviceIdentity {
  const saved = read();
  if (saved.id) return saved;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return write({ id: newId(), name: guessDeviceName(ua), created: Date.now() });
}

/** Renames this device. Empty falls back to the guess, so the list never shows a nameless row. */
export function renameDevice(name: string): DeviceIdentity {
  const device = thisDevice();
  const trimmed = String(name || '')
    .trim()
    .slice(0, 40);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  return write({ ...device, name: trimmed || guessDeviceName(ua) });
}

/** What a pushed row carries: who wrote it, in two short columns. Null when the browser refused
 * storage entirely, in which case rows go up unsigned rather than the push failing. */
export function deviceStamp(): { id: string; name: string } | null {
  const device = thisDevice();
  return device.id ? { id: device.id, name: device.name } : null;
}
