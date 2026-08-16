/**
 * A very small Supabase client, hand-rolled on `fetch`.
 *
 * GuestSeat has no backend and no account of its own: whoever wants their events on more than one
 * device brings **their own** Supabase project, pastes its URL and public key here, and signs in
 * with an account that exists only inside that project. Nothing in this file talks to any server
 * belonging to GuestSeat, because there is none.
 *
 * `@supabase/supabase-js` would do the same job, but it is ~120 kB for what turns out to be four
 * HTTP calls — a password grant, a token refresh, a PostgREST select and a PostgREST upsert — and
 * this is a PWA that people install on a phone and open at a venue on hotel wifi.
 *
 * ---- what is stored on this device ----
 *
 * The project URL, the public key, the signed-in email and the session tokens live in
 * `localStorage`. None of it is more sensitive than what is already in IndexedDB: the *guest lists
 * themselves* sit in this browser in plain form, so a device someone else can unlock was already
 * showing them every name. What matters is that the key saved here is the **public** one — see
 * {@link checkKey}, which refuses a service-role key outright, since that one bypasses row-level
 * security and would turn a stolen backup of localStorage into full access to the database.
 *
 * ---- errors ----
 *
 * Every failure carries a `code`, and the UI turns the code into a sentence in the user's language
 * (`sync.errors.*`). The `message` is the English fallback, or the project's own words when it said
 * something this file has no better phrasing for.
 */

import {
  META_KIND,
  MIGRATIONS,
  SCHEMA_ID,
  SCHEMA_VERSION,
  SQL_INSTALL,
  TABLE,
  VERSION_BEFORE_COUNTING,
  pendingMigrations,
  type Migration,
} from './schema';

const STORAGE_KEY = 'guestseat.sync';

export { TABLE, SCHEMA_VERSION, SQL_INSTALL } from './schema';

/** A summary of the last sync, kept so the UI can still describe it after a reload. */
export interface SyncSummary {
  at: string;
  error: string | null;
  pulled: number;
  pushed: number;
  /** The device is connected but has not yet been told what to do with the cloud copy. */
  needsDecision?: boolean;
}

export interface SyncConfig {
  url: string;
  anonKey: string;
  email: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** When the access token stops being accepted (ms epoch). Refreshed a minute before. */
  expiresAt: number;
  auto: boolean;
  /** The newest `updated_at` already pulled, as an ISO string. */
  pulledAt: string;
  /** Local clock reading of the last successful push. */
  pushedAt: number;
  /** Which migration this device last saw the project reach. A hint for the UI, never a substitute
   * for asking the project itself. */
  schemaVersion: number;
  /**
   * Whether the user has looked at what is in the cloud and said what should happen to it. Until
   * they have, this device pulls and never pushes — see `runSync` in sync.ts. `false` rather than
   * absent is what a *newly connected* device carries.
   */
  decided: boolean | null;
  /** Whether the project has the columns that record which device wrote a row. Null until a push
   * finds out, so a project missing them is asked once rather than once per push. */
  deviceColumns: boolean | null;
  /** "Send everything again on the next sync", after the cloud copy was emptied on purpose. */
  fullPushNext: boolean;
  /** Whether the project stamps rows with its own clock (the trigger). Null until a push says. */
  serverClock: boolean | null;
  /** ms epoch of the last two-sided count, so the daily repair check runs daily. */
  checkedAt: number;
  /** ms epoch of the last time this device signed its own row, so a quiet app is not chatty. */
  deviceNotedAt: number;
  last: SyncSummary | null;
}

const EMPTY: SyncConfig = {
  url: '',
  anonKey: '',
  email: '',
  userId: '',
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  auto: true,
  pulledAt: '',
  pushedAt: 0,
  schemaVersion: 0,
  decided: null,
  deviceColumns: null,
  fullPushNext: false,
  serverClock: null,
  checkedAt: 0,
  deviceNotedAt: 0,
  last: null,
};

const listeners = new Set<(config: SyncConfig) => void>();

/** Subscribe to "the saved sync configuration changed". Returns an unsubscribe. */
export function onConfig(fn: (config: SyncConfig) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function readConfig(): SyncConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<SyncConfig>) } : { ...EMPTY };
  } catch {
    // Private-browsing modes and a corrupted entry look the same from here: no configuration.
    return { ...EMPTY };
  }
}

export function saveConfig(patch: Partial<SyncConfig>): SyncConfig {
  const next = { ...readConfig(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Nothing to do: sync still works for this session, it just will not be remembered.
  }
  listeners.forEach((fn) => fn(next));
  return next;
}

/** Forgets the project, the key and the session — everything this device knew about the cloud
 * copy. The cloud copy itself is untouched, and so are the events in IndexedDB. */
export function clearConfig(): SyncConfig {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // See above.
  }
  const empty = { ...EMPTY };
  listeners.forEach((fn) => fn(empty));
  return empty;
}

/** Connected means: a project, a key, and a session that can be refreshed without asking for the
 * password again. */
export function isConnected(config: SyncConfig = readConfig()): boolean {
  return Boolean(config.url && config.anonKey && config.refreshToken);
}

/**
 * A project has been set up on this device, whether or not the session still works.
 *
 * The difference matters to anything that reports state: a refresh the project refuses drops the
 * tokens, so {@link isConnected} turns false — and a device that judged itself by that alone would
 * go completely quiet at the exact moment its user most needs telling that nothing is syncing.
 */
export function isConfigured(config: SyncConfig = readConfig()): boolean {
  return Boolean(config.url && config.anonKey);
}

// ---- errors ----

export type SyncErrorCode =
  | 'network'
  | 'credentials'
  | 'emailNotConfirmed'
  | 'userExists'
  | 'weakPassword'
  | 'signupDisabled'
  | 'key'
  | 'table'
  | 'permission'
  | 'session'
  | 'notConfigured'
  | 'notMigrated'
  | 'auth'
  | 'server';

export class SyncError extends Error {
  code: SyncErrorCode;
  /** PostgREST's own error code, when it sent one — the caller that can act on a specific failure
   * (a column a migration has not added yet) should not have to read English prose to spot it. */
  pgCode?: string;

  constructor(message: string, code: SyncErrorCode = 'server', pgCode?: string) {
    super(message);
    this.name = 'SyncError';
    this.code = code;
    this.pgCode = pgCode;
  }
}

// ---- validation of what the user pastes in ----

/** Accepts `abcdefg.supabase.co`, the full URL, and either with a trailing slash — the three shapes
 * people actually copy out of the Supabase dashboard. Returns '' for anything else. */
export function normalizeUrl(input: string): string {
  const text = String(input || '')
    .trim()
    .replace(/\/+$/, '');
  if (!text) return '';
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return '';
  }
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !local) return '';
  // A project address is a domain. Refusing a bare word here turns a typo into "that is not an
  // address" while the field is still on screen, instead of a request that fails a second later
  // with "the project could not be reached" — which reads like the project's fault, not the typo's.
  if (!local && !parsed.hostname.includes('.')) return '';
  return parsed.origin;
}

/** The payload of a Supabase key that is a JWT, or null for anything else (the newer
 * `sb_publishable_…` / `sb_secret_…` keys, or nonsense). Only the `role` claim is read, and it is
 * read to *refuse* a key, never to trust one — the project itself is what validates it. */
function jwtPayload(key: string): { role?: string; iss?: string; sub?: string; email?: string } | null {
  const parts = String(key).split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch {
    return null;
  }
}

export type KeyCheck = { ok: true; key: string } | { ok: false; reason: 'empty' | 'secret' | 'serviceRole' | 'role' | 'shape'; role?: string };

/**
 * Refuses a service-role key before it is ever written to disk or sent anywhere.
 *
 * That key ignores row-level security by design, which makes it the one credential that must never
 * sit in a browser: with it, anything that can read this device's localStorage can read and rewrite
 * the whole database. The dashboard prints it two lines under the public key, so pasting the wrong
 * one is an ordinary mistake — worth catching loudly rather than "working" and quietly leaving the
 * database wide open.
 */
export function checkKey(key: string): KeyCheck {
  const text = String(key || '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (/^sb_secret_/i.test(text)) return { ok: false, reason: 'secret' };
  const payload = jwtPayload(text);
  if (payload?.role === 'service_role') return { ok: false, reason: 'serviceRole' };
  if (payload && payload.role && payload.role !== 'anon') return { ok: false, reason: 'role', role: payload.role };
  if (!payload && !/^sb_publishable_/i.test(text)) return { ok: false, reason: 'shape' };
  return { ok: true, key: text };
}

// ---- HTTP ----

async function bodyOf(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

/** Turns whatever GoTrue said into a code the UI can phrase, falling through with the server's own
 * message — usually English, but at least true. */
function authError(res: Response, data: Record<string, unknown> | null): SyncError {
  const code = String(data?.error_code ?? data?.code ?? '');
  const text = String(data?.msg ?? data?.message ?? data?.error_description ?? data?.error ?? '');
  if (/invalid login credentials/i.test(text) || code === 'invalid_credentials') {
    return new SyncError('Email or password does not match this project.', 'credentials');
  }
  if (/email not confirmed/i.test(text) || code === 'email_not_confirmed') {
    return new SyncError('That email has not been confirmed yet.', 'emailNotConfirmed');
  }
  if (/user already registered/i.test(text) || code === 'user_already_exists') {
    return new SyncError('That account already exists in the project.', 'userExists');
  }
  if (/weak password|password should be/i.test(text) || code === 'weak_password') {
    return new SyncError('That password is too short for this project.', 'weakPassword');
  }
  if (/signups not allowed|signup is disabled/i.test(text) || code === 'signup_disabled') {
    return new SyncError('The project has new sign-ups turned off.', 'signupDisabled');
  }
  if (res.status === 401 && !text) return new SyncError('The project did not accept the public key.', 'key');
  if (/Invalid API key|No API key found/i.test(text)) {
    return new SyncError('That public key does not belong to this project.', 'key');
  }
  return new SyncError(text || `The project answered with error ${res.status}.`, 'auth');
}

async function fetchAuth(
  config: Pick<SyncConfig, 'url' | 'anonKey'>,
  path: string,
  body: unknown
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${config.url}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new SyncError('The project could not be reached.', 'network');
  }
  const data = await bodyOf(res);
  if (!res.ok) throw authError(res, data);
  return data ?? {};
}

interface GrantResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: { id?: string; email?: string };
}

function saveSession(data: GrantResponse, extra: Partial<SyncConfig> = {}): SyncConfig {
  return saveConfig({
    accessToken: data.access_token || '',
    refreshToken: data.refresh_token || '',
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    userId: data.user?.id || '',
    email: data.user?.email || '',
    ...extra,
  });
}

/**
 * Whether the device still owes the user a decision about what to do with the cloud copy.
 *
 * A *new* connection does: this browser is about to meet a table it has never seen, and until
 * somebody says which side is the real one, pushing would be a guess with somebody's evening. A
 * re-login on the same project that this device has already synced with does not — the two sides
 * are known to each other, and asking again every time a session expires would teach the user to
 * tap through the one dialog that matters.
 */
function decisionFor(config: SyncConfig, url: string): boolean | null {
  if (config.url === url && config.last) return config.decided;
  return false;
}

/** Signs in against the user's own project. `url`/`anonKey` are passed in the first time (nothing
 * is saved until the project has actually answered), and read from storage afterwards. */
export async function signIn({
  email,
  password,
  url,
  anonKey,
}: {
  email: string;
  password: string;
  url?: string;
  anonKey?: string;
}): Promise<SyncConfig> {
  const config = { ...readConfig(), ...(url ? { url } : {}), ...(anonKey ? { anonKey } : {}) };
  const data = (await fetchAuth(config, 'token?grant_type=password', {
    email: email.trim(),
    password,
  })) as GrantResponse;
  if (!data.access_token) throw new SyncError('The project returned no session.', 'auth');
  return saveSession(data, {
    url: config.url,
    anonKey: config.anonKey,
    decided: decisionFor(readConfig(), config.url),
  });
}

/**
 * Where the confirmation email should send the reader back to: this app, said explicitly.
 *
 * A project has exactly one **Site URL**, and that is where GoTrue sends a confirmation link when
 * nobody says otherwise. That is fine for a project this app has to itself, and wrong the moment the
 * project is shared with another app of the user's — say a ledger already using it — because then
 * the Site URL is that app's address and the link lands there instead of here.
 *
 * Naming the address closes that: Supabase honours `redirect_to` when the address is in the
 * project's **Redirect URLs** allow-list, and quietly falls back to the Site URL when it is not. So
 * this is safe to send always — at worst it changes nothing, and at best it makes one project serve
 * two apps.
 */
export function signupPath(origin: string): string {
  const address = String(origin || '').trim();
  return address ? `signup?redirect_to=${encodeURIComponent(address)}` : 'signup';
}

/**
 * Creates the account inside the user's own project. With email confirmation on (the Supabase
 * default) there is no session in the answer — the account exists but has to be confirmed first,
 * which is reported rather than treated as a failure.
 */
export async function signUp({
  email,
  password,
  url,
  anonKey,
}: {
  email: string;
  password: string;
  url?: string;
  anonKey?: string;
}): Promise<{ needsConfirmation: boolean; config: SyncConfig | null }> {
  const config = { ...readConfig(), ...(url ? { url } : {}), ...(anonKey ? { anonKey } : {}) };
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const data = (await fetchAuth(config, signupPath(origin), {
    email: email.trim(),
    password,
  })) as GrantResponse;
  if (!data.access_token) return { needsConfirmation: true, config: null };
  return {
    needsConfirmation: false,
    config: saveSession(data, {
      url: config.url,
      anonKey: config.anonKey,
      decided: decisionFor(readConfig(), config.url),
    }),
  };
}

/**
 * A usable access token, refreshed when it is about to expire. Every request goes through this, so
 * a session left alone for a week keeps working without asking for the password again.
 *
 * A refresh the project rejects (password changed elsewhere, user deleted, project paused) drops
 * the tokens but keeps the URL and the key — the user has to type the password again, not set the
 * whole thing up again.
 */
export async function ensureSession(): Promise<SyncConfig> {
  const config = readConfig();
  if (!config.url || !config.anonKey) throw new SyncError('Sync is not set up on this device.', 'notConfigured');
  if (!config.refreshToken) throw new SyncError('No session — sign in again.', 'session');
  if (config.accessToken && Date.now() < config.expiresAt - 60_000) return config;

  let data: GrantResponse;
  try {
    data = (await fetchAuth(config, 'token?grant_type=refresh_token', {
      refresh_token: config.refreshToken,
    })) as GrantResponse;
  } catch (err) {
    if (err instanceof SyncError && err.code === 'network') throw err;
    saveConfig({ accessToken: '', refreshToken: '', expiresAt: 0 });
    throw new SyncError('The session expired — sign in again.', 'session');
  }
  return saveSession(data);
}

/**
 * Adopts a session handed over in the URL, as the confirmation email does.
 *
 * Supabase sends the confirm/recovery link back to the project's *Site URL* with the session in the
 * fragment (`#access_token=…&refresh_token=…`). If that URL is this app, the person has effectively
 * just signed in — and without this they would land on the board, see nothing happen, and be asked
 * for the password they have this second finished proving they know.
 *
 * Two guards. The tokens are only taken on a device that already has this project configured,
 * because a session is useless without the key to send it with; and the token's own `iss` must be
 * that project, so a link from somewhere else cannot quietly repoint this device. Nothing is
 * trusted beyond that: a forged token fails at the first request, where the project checks it.
 *
 * The caller is expected to strip the fragment afterwards — a token has no business sitting in the
 * address bar, in the back-button history, or in whatever the browser syncs elsewhere.
 */
export function adoptSessionFromLink(hash = typeof window === 'undefined' ? '' : window.location.hash): SyncConfig | null {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  if (!access || !refresh) return null;

  const config = readConfig();
  if (!isConfigured(config)) return null;

  const payload = jwtPayload(access);
  if (!String(payload?.iss || '').startsWith(config.url)) return null;

  return saveConfig({
    accessToken: access,
    refreshToken: refresh,
    expiresAt: Date.now() + (Number(params.get('expires_in')) || 3600) * 1000,
    userId: payload?.sub || config.userId,
    email: payload?.email || config.email,
    // Arriving here from the confirmation link is a connection like any other, and it is very often
    // the *first* one — so the same question is owed before anything is pushed.
    decided: decisionFor(config, config.url),
  });
}

export async function signOut(): Promise<SyncConfig> {
  const config = readConfig();
  try {
    if (config.accessToken) {
      await fetch(`${config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: { apikey: config.anonKey, Authorization: `Bearer ${config.accessToken}` },
      });
    }
  } catch {
    // Signing out is a local matter first: the tokens below go either way.
  }
  return saveConfig({ accessToken: '', refreshToken: '', expiresAt: 0 });
}

interface RestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Return the raw `Response` — for the one caller that needs a header (the row count, which
   * PostgREST reports in `Content-Range` rather than in the body). */
  raw?: boolean;
}

/**
 * A PostgREST call against the user's project, authenticated as the signed-in user so row-level
 * security applies to it.
 */
export async function rest(path: string, options: RestOptions & { raw: true }): Promise<Response>;
export async function rest<T = unknown>(path: string, options?: RestOptions): Promise<T>;
export async function rest<T = unknown>(path: string, options: RestOptions = {}): Promise<T | Response> {
  const { method = 'GET', body, headers = {}, raw = false } = options;
  const config = await ensureSession();
  let res: Response;
  try {
    res = await fetch(`${config.url}/rest/v1/${path}`, {
      method,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new SyncError('The project could not be reached.', 'network');
  }
  if (res.ok) return raw ? res : ((await bodyOf(res)) as T);

  const data = await bodyOf(res);
  // PGRST205 is "that table is not in the schema cache", i.e. the setup SQL was never run. It is
  // the single most likely first-run failure, so it gets its own code and its own instruction.
  if (data?.code === 'PGRST205' || res.status === 404) {
    throw new SyncError(`The project has no "${TABLE}" table yet — run the setup script.`, 'table');
  }
  if (res.status === 401 || res.status === 403) {
    throw new SyncError('The project refused this operation — check the security rule was created.', 'permission');
  }
  throw new SyncError(
    String(data?.message ?? `The project answered with error ${res.status}.`),
    'server',
    typeof data?.code === 'string' ? data.code : undefined
  );
}

/**
 * ---- setting the project up ----
 *
 * The limit here is not a missing feature but the design of the API: the key saved on this device
 * reaches **PostgREST** only, and PostgREST serves rows. It cannot create a table, a policy or a
 * trigger, and no setting on the project makes it able to — which is also what stops a stolen copy
 * of this browser's localStorage from rewriting the database.
 *
 * Supabase does expose a second API — the Management API — which *can* run SQL, but `api.supabase.com`
 * answers no cross-origin request from a page, so a browser cannot use it at all. Offering it would
 * mean either shipping a server of this app's own to relay a credential covering the user's whole
 * Supabase account, or shipping a button that cannot work.
 *
 * So the setup is the script, and {@link sqlEditorLink} opens the user's own SQL editor with it
 * already in the query box: one tap, then Run. {@link verifySchema} is the way back — what ran is
 * asked of the project, not of the person who pressed the button.
 */

/**
 * The project reference — the `abcdefghijklmnopqrst` in `https://abcdefghijklmnopqrst.supabase.co`,
 * which is how the dashboard addresses a project. Empty for anything that is not a Supabase project
 * address (a custom domain, a self-hosted instance), because for those there is no ref to guess and
 * the caller has to say so rather than build a link that lands nowhere.
 */
export function projectRef(url: string): string {
  try {
    const { hostname } = new URL(normalizeUrl(url) || String(url));
    const parts = hostname.split('.');
    if (parts.length < 3) return '';
    if (!/^supabase\.(co|in|net)$/i.test(parts.slice(1).join('.'))) return '';
    return /^[a-z0-9]{16,32}$/i.test(parts[0]) ? parts[0].toLowerCase() : '';
  } catch {
    return '';
  }
}

/**
 * That project's SQL editor, opened on a new query with the script **already in it** — so setup is
 * a tap and then Run, with nothing to copy and no project to find.
 *
 * The `content` parameter is the dashboard's own way of being linked to with a query prefilled. If
 * a future dashboard ignores it, the link still lands on an empty editor of the right project,
 * which is where the copy button was aiming anyway.
 */
export function sqlEditorLink(url: string, script: string = SQL_INSTALL): string {
  const ref = projectRef(url);
  if (!ref) return 'https://supabase.com/dashboard';
  return `https://supabase.com/dashboard/project/${ref}/sql/new?content=${encodeURIComponent(script)}`;
}

/** Failures that say nothing about the schema: the question was never put to the project, so the
 * answer is "ask again", not "the script has not run". */
const NO_ANSWER = new Set<SyncErrorCode>(['network', 'session', 'notConfigured']);

/**
 * Checks how far the project actually got, and records it.
 *
 * The script runs in a SQL editor, in another tab, outside anything this app can watch — so the
 * only trustworthy report is the database's own. Each pending migration carries a query that
 * succeeds only once it has run; they are tried in order and the first one that fails is where the
 * project stands. A half-run script is therefore remembered as half run, not as done.
 */
export async function verifySchema(from = 0): Promise<number> {
  const pending = pendingMigrations(from);
  if (pending.length === 0) return from;

  let reached = 0;
  for (const migration of pending) {
    if (!migration.verify) break;
    try {
      await rest(migration.verify);
    } catch (err) {
      if (err instanceof SyncError && NO_ANSWER.has(err.code)) throw err;
      break;
    }
    reached = migration.version;
  }

  if (reached <= from) {
    throw new SyncError(`The project still has no working "${TABLE}" table.`, 'notMigrated');
  }

  // The project itself is told where it got to, so every other device reads the answer rather than
  // guessing from what its own copy of the app happens to ship. Best effort: the migration has run,
  // and failing to write a marker must not report a finished migration as unfinished.
  await markSchemaVersion(reached).catch(() => undefined);
  saveConfig({ schemaVersion: reached, deviceColumns: true });
  return reached;
}

/**
 * Which migration the connected project has reached.
 *
 * Read from the project rather than from this device, because the project is the thing that was
 * migrated — a laptop that has never run one would otherwise report the phone's work as missing.
 */
export async function readSchemaVersion(): Promise<number> {
  const rows = await rest<{ data?: { version?: number } }[]>(
    `${TABLE}?kind=eq.${META_KIND}&record_id=eq.${SCHEMA_ID}&select=data&limit=1`
  );
  const version = Number(rows?.[0]?.data?.version);
  return Number.isFinite(version) && version > 0 ? version : VERSION_BEFORE_COUNTING;
}

/** Records that reading in the project's own table. */
export async function markSchemaVersion(version: number): Promise<number> {
  const config = await ensureSession();
  await rest(`${TABLE}?on_conflict=user_id,kind,record_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [
      {
        user_id: config.userId,
        kind: META_KIND,
        record_id: SCHEMA_ID,
        deleted: false,
        data: { version, updatedAt: new Date().toISOString() },
      },
    ],
  });
  return version;
}

export interface SchemaState {
  version: number;
  latest: number;
  update: boolean;
  pending: Migration[];
  /** The table does not exist at all — "never set up" rather than "out of date". */
  missing: boolean;
}

/** What the sync panel needs to decide between "up to date", "needs an update" and "never set up". */
export async function schemaState(): Promise<SchemaState> {
  try {
    const version = await readSchemaVersion();
    return {
      version,
      latest: SCHEMA_VERSION,
      update: version < SCHEMA_VERSION,
      pending: pendingMigrations(version),
      missing: false,
    };
  } catch (err) {
    if (!(err instanceof SyncError) || err.code !== 'table') throw err;
    return { version: 0, latest: SCHEMA_VERSION, update: true, pending: MIGRATIONS, missing: true };
  }
}

/**
 * Swaps the saved public key for a new one — the day the user rotates it in Supabase.
 *
 * The new key is tried before it is kept, because it is being typed into the very device that would
 * need it to talk to the project: saving a mistyped key first and discovering it afterwards would
 * leave the device unable to sync until it was disconnected and set up from scratch. The check runs
 * while the *old* key still works, so the session it needs is refreshed with the key on its way out.
 *
 * Only the key. A different project URL means a different database, with its own users and its own
 * rows, so nothing about the current session would carry over — that is a reconnection, not an edit.
 */
export async function changeKey(newKey: string): Promise<SyncConfig> {
  const check = checkKey(newKey);
  if (!check.ok) throw new SyncError('That key was refused.', 'key');

  const config = await ensureSession();
  let res: Response;
  try {
    res = await fetch(`${config.url}/rest/v1/${TABLE}?select=record_id&limit=1`, {
      headers: { apikey: check.key, Authorization: `Bearer ${config.accessToken}` },
    });
  } catch {
    throw new SyncError('The project could not be reached.', 'network');
  }
  if (!res.ok) {
    const data = await bodyOf(res);
    if (res.status === 401 || res.status === 403) {
      throw new SyncError('The project did not accept the new key.', 'key');
    }
    throw new SyncError(String(data?.message ?? `The project answered with error ${res.status}.`), 'server');
  }
  return saveConfig({ anonKey: check.key });
}
