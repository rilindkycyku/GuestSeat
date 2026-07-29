import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearShareParam,
  decodeSharedState,
  encodeStateToLink,
  readShareParam,
  toQrPayloadUrl,
} from './shareLink';
import { fullFixture } from './testFixtures';
import type { EventState, Guest } from '../types';

// shareLink reads `window.location` when it builds or reads a link. The codec itself is pure, so a
// two-field stub is all these tests need — no DOM implementation involved.
const BASE_URL = 'https://guestseat.example/plan';

function stubWindow(href = BASE_URL) {
  const url = new URL(href);
  (globalThis as any).window = {
    location: {
      get href() {
        return url.toString();
      },
      get hash() {
        return url.hash;
      },
      get pathname() {
        return url.pathname;
      },
      get search() {
        return url.search;
      },
    },
    history: {
      replaceState(_state: unknown, _title: string, next: string) {
        url.hash = '';
        url.pathname = next.split('?')[0];
      },
    },
  };
  return {
    setHash(hash: string) {
      url.hash = hash;
    },
  };
}

/** The payload out of a link, i.e. the part after `#s=`. */
function payloadOf(link: string): string {
  return new URLSearchParams(new URL(link).hash.slice(1)).get('s')!;
}

/**
 * base42, reimplemented here on purpose. The tests below encode payloads the way *older* published
 * versions of the app did, to prove their links still open; borrowing the app's own (unexported)
 * encoder would only prove it agrees with itself.
 */
const B42_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-:/*$';
function toBase42(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let v = bytes[i] * 256 + bytes[i + 1];
      out += B42_ALPHABET[v % 42];
      v = Math.floor(v / 42);
      out += B42_ALPHABET[v % 42];
      out += B42_ALPHABET[Math.floor(v / 42)];
    } else {
      const v = bytes[i];
      out += B42_ALPHABET[v % 42];
      out += B42_ALPHABET[Math.floor(v / 42)];
    }
  }
  return out;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function byName(guests: Guest[], name: string): Guest {
  const found = guests.find((g) => g.name === name);
  if (!found) throw new Error(`no guest named ${name}`);
  return found;
}

/** Encode, then decode, the way a sender and a recipient actually do it. */
async function roundTrip(state: EventState): Promise<EventState> {
  const decoded = await decodeSharedState(payloadOf(await encodeStateToLink(state)));
  if (!decoded) throw new Error('payload did not decode');
  return decoded;
}

beforeEach(() => {
  stubWindow();
});

describe('share link round-trip', () => {
  it('carries every guest field, not just names and seats', async () => {
    const original = fullFixture();
    const decoded = await roundTrip(original);

    const elira = byName(decoded.guests, 'Elira');
    expect(elira.surname).toBe('Hoxha');
    expect(elira.notes).toBe('Vegetarian, no nuts');
    expect(elira.rsvp).toBe('confirmed');
    expect(elira.meal).toBe('Vegetarian');
    expect(elira.arrived).toBe(true);
    // Ids are regenerated on decode, so references are compared by who they point at.
    expect(elira.tagIds?.map((id) => decoded.tags!.find((t) => t.id === id)!.label)).toEqual(["Bride's family"]);
    expect(elira.linkedGuestIds?.map((id) => decoded.guests.find((g) => g.id === id)!.name)).toEqual(['Arben']);
    expect(elira.apartGuestIds?.map((id) => decoded.guests.find((g) => g.id === id)!.name)).toEqual(['Dritan']);
  });

  it('keeps seating, table shape, sides and table tags', async () => {
    const decoded = await roundTrip(fullFixture());
    const long = decoded.tables.find((t) => t.name === 'Long table')!;
    expect(long.shape).toBe('long');
    expect(long.side).toBe('groom');
    expect(long.capacity).toBe(10);
    expect(long.tagIds).toHaveLength(2);
    expect(byName(decoded.guests, 'Besa').tableId).toBe(long.id);
    expect(byName(decoded.guests, 'Dritan').tableId).toBeNull();
  });

  it('keeps the event name and the invitation details', async () => {
    const original = fullFixture();
    const decoded = await roundTrip(original);
    expect(decoded.eventName).toBe(original.eventName);
    expect(decoded.details).toEqual(original.details);
  });

  it('survives an empty event and a guest with nothing but a name', async () => {
    const bare: EventState = {
      eventName: 'Bare',
      guests: [{ id: 'g1', name: 'Ana', tableId: null }],
      tables: [],
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const decoded = await roundTrip(bare);
    expect(decoded.guests).toEqual([{ id: decoded.guests[0].id, name: 'Ana', tableId: null }]);
    expect(decoded.tables).toEqual([]);
  });

  it('spends no payload on the fields a plain list does not use', async () => {
    // The appended tuple entries are trimmed when empty, so a list with no tags, meals, feuds or
    // long tables must encode to exactly what it did before those fields existed.
    const plain: EventState = {
      eventName: 'Plain',
      guests: [
        { id: 'g1', name: 'Ana', surname: 'A', tableId: 't1', rsvp: 'confirmed' },
        { id: 'g2', name: 'Beni', tableId: null },
      ],
      tables: [{ id: 't1', name: 'Table A', capacity: 4 }],
      updatedAt: '2026-07-01T00:00:00.000Z',
    };
    const expected = [
      1,
      'Plain',
      [['Table A', 4, 0, '', []]],
      [],
      [
        ['Ana', 'A', 0, 1, '', []],
        ['Beni', '', -1, 0, '', []],
      ],
      null,
      '2026-07-01T00:00:00.000Z',
    ];
    const gzipped = await gzip(JSON.stringify(expected));
    expect(payloadOf(await encodeStateToLink(plain))).toBe('A' + toBase42(gzipped));
  });

  it('stays inside the QR alphanumeric character set', async () => {
    const payload = payloadOf(await encodeStateToLink(fullFixture()));
    // QR alphanumeric mode: digits, A-Z, space, $%*+-./:  — the payload uses a subset with no space.
    expect(payload).toMatch(/^[0-9A-Z.\-:/*$]+$/);
  });
});

describe('decoding links from older versions', () => {
  it('reads a compact payload written before guest tags and meals existed', async () => {
    const v1 = [
      1,
      'Old Wedding',
      [['Table A', 4, 2, 'A', [0]]],
      [['Cousins', 'rose']],
      [
        ['Ana', 'Alia', 0, 1, 'Window seat', [1]],
        ['Beni', '', 0, 0, '', [0]],
      ],
      { venue: 'Old Hall' },
      '2026-01-01T00:00:00.000Z',
    ];
    const decoded = await decodeSharedState('A' + toBase42(await gzip(JSON.stringify(v1))));
    expect(decoded).not.toBeNull();
    expect(decoded!.eventName).toBe('Old Wedding');
    expect(decoded!.tables[0].side).toBe('bride');
    expect(decoded!.tables[0].shape).toBeUndefined();
    expect(decoded!.tables[0].tagIds).toHaveLength(1);
    expect(byName(decoded!.guests, 'Ana').notes).toBe('Window seat');
    expect(byName(decoded!.guests, 'Ana').linkedGuestIds).toEqual([byName(decoded!.guests, 'Beni').id]);
    expect(byName(decoded!.guests, 'Ana').meal).toBeUndefined();
    expect(decoded!.details).toEqual({ venue: 'Old Hall' });
  });

  it('reads a legacy uncompressed base64 payload', async () => {
    const state = {
      eventName: 'Legacy',
      guests: [{ id: 'g1', name: 'Ana', tableId: 't1', rsvp: 'confirmed', meal: 'Fish' }],
      tables: [{ id: 't1', name: 'Table A', capacity: 2 }],
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const b64 = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    const decoded = await decodeSharedState('u' + b64);
    expect(decoded!.guests[0].meal).toBe('Fish');
    expect(decoded!.guests[0].tableId).toBe('t1');
  });

  it('refuses a payload from a future format version', async () => {
    const future = [99, 'Future', [], [], [['Ana', '', -1, 0, '', []]], null, ''];
    expect(await decodeSharedState('A' + toBase42(await gzip(JSON.stringify(future))))).toBeNull();
  });
});

describe('malformed payloads', () => {
  it('returns null rather than throwing', async () => {
    for (const payload of ['', 'A', 'Anonsense!!', 'zzzz', 'B', 'u' + Buffer.from('{').toString('base64url')]) {
      expect(await decodeSharedState(payload)).toBeNull();
    }
  });

  it('rejects a hand-edited full-JSON payload with junk fields', async () => {
    const tampered = {
      eventName: 'Tampered',
      guests: [{ id: 'g1', name: 'Ana', tableId: 'nowhere', rsvp: 'maybe', arrived: 'sure', tagIds: 7 }],
      tables: [{ id: 't1', name: 'A', capacity: 'lots' }],
      tags: 'not a list',
      updatedAt: 5,
    };
    const decoded = await decodeSharedState('u' + Buffer.from(JSON.stringify(tampered)).toString('base64url'));
    expect(decoded).not.toBeNull();
    expect(decoded!.guests[0]).toEqual({ id: 'g1', name: 'Ana', tableId: null });
    expect(decoded!.tables[0].capacity).toBe(8);
    expect(decoded!.tags).toBeUndefined();
    expect(typeof decoded!.updatedAt).toBe('string');
  });

  it('drops a guest whose name is missing entirely', async () => {
    const state = { guests: [{ surname: 'Nameless' }, { name: 'Ana' }], tables: [] };
    const decoded = await decodeSharedState('u' + Buffer.from(JSON.stringify(state)).toString('base64url'));
    expect(decoded!.guests.map((g) => g.name)).toEqual(['Ana']);
  });
});

describe('link plumbing', () => {
  it('reads the payload back out of the URL hash', async () => {
    const win = stubWindow();
    const link = await encodeStateToLink(fullFixture());
    win.setHash(new URL(link).hash);
    expect(readShareParam()).toBe(payloadOf(link));
  });

  it('has nothing to read on a plain URL', () => {
    stubWindow();
    expect(readShareParam()).toBeNull();
  });

  it('clears the payload so a refresh does not re-prompt', async () => {
    const win = stubWindow();
    win.setHash('#s=AABBCC');
    clearShareParam();
    expect(readShareParam()).toBeNull();
  });

  it('upper-cases only the origin of a QR payload URL', () => {
    expect(toQrPayloadUrl('https://guestseat.example/plan?x=1#s=ABC')).toBe('HTTPS://GUESTSEAT.EXAMPLE/plan?x=1#s=ABC');
    expect(toQrPayloadUrl('not a url')).toBe('not a url');
  });
});
