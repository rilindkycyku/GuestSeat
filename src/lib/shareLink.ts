import type { EventState } from '../types';

/**
 * Share links carry a full EventState snapshot in the URL hash, so a guest list can be
 * shared just by sending a link — the recipient's app decodes it and offers to load it,
 * with no manual JSON import. The payload lives in the hash (`#s=...`) so it never reaches
 * a server. When the browser supports gzip streams the JSON is compressed first, which
 * keeps links short enough for typical wedding lists.
 */

const HASH_KEY = 's';

const hasCompression =
  typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Build a shareable URL for the current page that encodes the given state in its hash. */
export async function encodeStateToLink(state: EventState): Promise<string> {
  const json = JSON.stringify(state);
  // First char is a marker: 'c' = gzip-compressed, 'u' = uncompressed (older browsers).
  const payload = hasCompression
    ? 'c' + toBase64Url(await gzip(json))
    : 'u' + toBase64Url(new TextEncoder().encode(json));
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${payload}`;
  return url.toString();
}

/** Decode a share payload (the value of `#s=...`) back into an EventState, or null if invalid. */
export async function decodeSharedState(payload: string): Promise<EventState | null> {
  try {
    const marker = payload[0];
    const bytes = fromBase64Url(payload.slice(1));
    const json = marker === 'c' ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json) as EventState;
    if (!parsed || !Array.isArray(parsed.guests) || !Array.isArray(parsed.tables)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Read the share payload from the current URL hash, if one is present. */
export function readShareParam(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  return new URLSearchParams(hash).get(HASH_KEY);
}

/** Strip the share payload from the URL so a refresh doesn't re-trigger the import prompt. */
export function clearShareParam(): void {
  const url = new URL(window.location.href);
  window.history.replaceState(null, '', url.pathname + url.search);
}
