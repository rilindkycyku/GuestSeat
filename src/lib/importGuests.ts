import type {
  AgendaItem,
  EventDetails,
  EventState,
  EventType,
  Guest,
  ImportGuestEntry,
  ImportResult,
  ImportShape,
  InvitationTemplate,
  RsvpStatus,
  Table,
  TableNamingMode,
  TableShape,
  TableTag,
  TagColor,
} from '../types';
import { EVENT_TYPES } from './eventTypes';
import { TAG_COLOR_ORDER } from './tagColors';

// Ids only need to be unique within a single event (guests, tables, tags, agenda items) —
// they're opaque keys and cross-references, never parsed. We keep them short so exported
// JSON stays readable: a one-letter type prefix, a short per-session salt, and a running
// counter, giving ids like `gk3f`, `gk3f1`, `tk3f2` instead of `g_nkup0jehmrhxy20s`.
//
// The counter guarantees every id made in this session is distinct; the random salt keeps
// ids from separate sessions apart if two lists are ever combined. (Note: share links and
// QR codes don't carry ids at all — they're stripped and regenerated on load — so id length
// has no effect on link/QR size; this is purely to keep exports and data tidy.)
const idSalt = Math.random().toString(36).slice(2, 5);
let idSeq = 0;

function makeId(prefix: string): string {
  return `${prefix}${idSalt}${(idSeq++).toString(36)}`;
}

// ── Field validation ─────────────────────────────────────────────────────────────────────
// An imported file is untrusted input: it can be a GuestSeat export, a file someone edited by
// hand, or something a spreadsheet produced. Every optional field is therefore checked rather
// than copied — a bad `rsvp` string or a number where a name belongs must not reach the state.

const RSVP_VALUES = new Set<string>(['confirmed', 'declined'] satisfies RsvpStatus[]);
const SHAPE_VALUES = new Set<string>(['round', 'long'] satisfies TableShape[]);
const TEMPLATE_VALUES = new Set<string>(['classic', 'modern', 'romantic'] satisfies InvitationTemplate[]);
const TAG_COLORS = new Set<string>(TAG_COLOR_ORDER);
const EVENT_TYPE_IDS = new Set<string>(EVENT_TYPES.map((e) => e.id));

/** A non-empty trimmed string, or undefined for anything else (including numbers and null). */
function str(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** A list of non-empty id strings, or undefined if there are none. */
function idList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return out.length ? out : undefined;
}

/** A positive whole seat count, or undefined. */
function capacity(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined;
  return Math.floor(value);
}

function normalizeEntry(entry: ImportGuestEntry, group?: string): Guest | null {
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    if (!trimmed) return null;
    return { id: makeId('g'), name: trimmed, tableId: null, group };
  }
  if (entry && typeof entry === 'object') {
    const name = (entry.name ?? entry.firstName ?? entry.first_name ?? '').toString().trim();
    const surname = (entry.surname ?? entry.lastName ?? entry.last_name ?? '').toString().trim();
    if (!name) return null;
    // Everything the exporter writes is read back here. Anything missed silently disappears on a
    // round-trip (export → re-import), which is why the guest tests assert field-by-field equality.
    const guest: Guest = {
      id: entry.id || makeId('g'),
      name,
      surname: surname || undefined,
      notes: str(entry.notes),
      group: str(entry.group) ?? group,
      tableId: null,
    };
    const linked = idList(entry.linkedGuestIds);
    if (linked) guest.linkedGuestIds = linked;
    const apart = idList(entry.apartGuestIds);
    if (apart) guest.apartGuestIds = apart;
    const tagIds = idList(entry.tagIds);
    if (tagIds) guest.tagIds = tagIds;
    if (typeof entry.rsvp === 'string' && RSVP_VALUES.has(entry.rsvp)) guest.rsvp = entry.rsvp as RsvpStatus;
    const meal = str(entry.meal);
    if (meal) guest.meal = meal;
    if (entry.arrived === true) guest.arrived = true;
    return guest;
  }
  return null;
}

/**
 * The event's tag palette. Ids are kept when present because guest and table `tagIds` point at
 * them; a tag without a usable id gets a fresh one, and references to it simply won't resolve
 * (the caller drops unresolvable tag ids rather than leaving a dangling reference behind).
 */
function normalizeTags(raw: unknown): TableTag[] {
  if (!Array.isArray(raw)) return [];
  const out: TableTag[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const tag = item as Partial<TableTag>;
    const label = str(tag.label);
    if (!label) continue;
    const rawId = str(tag.id);
    const id = rawId && !seen.has(rawId) ? rawId : makeId('tag');
    seen.add(id);
    const color = typeof tag.color === 'string' && TAG_COLORS.has(tag.color) ? (tag.color as TagColor) : 'slate';
    out.push({ id, label, color });
  }
  return out;
}

/** The invitation details block: plain text fields, two enums, and the printed schedule. */
function normalizeDetails(raw: unknown): EventDetails | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  const details: EventDetails = {};

  const textFields = [
    'brideName',
    'groomName',
    'venue',
    'address',
    'date',
    'time',
    'introMessage',
    'invitationNote',
    'hostFamily',
    'dressCode',
    'rsvpPhone',
  ] as const;
  for (const field of textFields) {
    const value = str(data[field]);
    if (value) details[field] = value;
  }

  if (typeof data.eventType === 'string' && EVENT_TYPE_IDS.has(data.eventType)) {
    details.eventType = data.eventType as EventType;
  }
  if (typeof data.invitationTemplate === 'string' && TEMPLATE_VALUES.has(data.invitationTemplate)) {
    details.invitationTemplate = data.invitationTemplate as InvitationTemplate;
  }

  if (Array.isArray(data.agenda)) {
    const agenda: AgendaItem[] = [];
    for (const item of data.agenda) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const title = str(row.title);
      if (!title) continue;
      const entry: AgendaItem = { id: str(row.id) ?? makeId('a'), title };
      const time = str(row.time);
      if (time) entry.time = time;
      agenda.push(entry);
    }
    if (agenda.length) details.agenda = agenda;
  }

  return Object.keys(details).length ? details : undefined;
}

export type ImportErrorCode =
  | 'INVALID_JSON'
  | 'GUESTS_KEY_EMPTY'
  | 'FLAT_ARRAY_EMPTY'
  | 'GROUPED_EMPTY'
  | 'UNRECOGNIZED'
  | 'CSV_EMPTY';

export class ImportError extends Error {
  code: ImportErrorCode;
  constructor(code: ImportErrorCode) {
    super(code);
    this.code = code;
  }
}

/**
 * Accepts three shapes:
 *  1. { "A": ["Name1", "Name2"], "B": [...] } - letters/groups mapping to first-name arrays
 *     (the format produced by the user's own guest-list export)
 *  2. [ "Full guest entry", { name, surname, table }, ... ] - flat array
 *  3. { guests: [...], tables: [...], eventName } - a previously exported GuestSeat file (round-trip)
 *
 * `tableLabel` is used as the display prefix for tables generated from shape 1 (e.g. "Table A").
 * `namingMode` controls whether those tables are suffixed with their original key ("Table A") or
 * a sequential number ("Table 1").
 */
export function parseImportedJson(
  raw: unknown,
  tableLabel = 'Table',
  namingMode: TableNamingMode = 'letters'
): ImportResult {
  if (raw === null || typeof raw !== 'object') {
    throw new ImportError('INVALID_JSON');
  }

  const data = raw as ImportShape;

  // Shape 3: full GuestSeat export (round-trip import)
  if (!Array.isArray(data) && 'guests' in data && Array.isArray((data as any).guests)) {
    const full = data as {
      guests: ImportGuestEntry[];
      tables?: Partial<Table>[];
      eventName?: string;
      tags?: unknown;
      details?: unknown;
    };

    // Tags first: guests and tables reference them by id, and a reference to a tag that isn't in
    // the file is dropped rather than kept as a dangling id that no picker could ever resolve.
    const tags = normalizeTags(full.tags);
    const validTagIds = new Set(tags.map((tag) => tag.id));
    const keepTags = (ids: string[] | undefined) => {
      const kept = (ids ?? []).filter((id) => validTagIds.has(id));
      return kept.length ? kept : undefined;
    };

    const tables: Table[] = (full.tables ?? []).map((t) => {
      const table: Table = {
        id: str(t.id) ?? makeId('t'),
        name: str(t.name) ?? tableLabel,
        capacity: capacity(t.capacity) ?? 8,
      };
      if (t.side === 'groom' || t.side === 'bride') table.side = t.side;
      if (typeof t.shape === 'string' && SHAPE_VALUES.has(t.shape)) table.shape = t.shape as TableShape;
      const tableTagIds = keepTags(idList(t.tagIds));
      if (tableTagIds) table.tagIds = tableTagIds;
      const autoSuffix = str(t.autoSuffix);
      if (autoSuffix) table.autoSuffix = autoSuffix;
      return table;
    });

    const tableIds = new Set(tables.map((t) => t.id));
    const guests = full.guests
      .map((e) => normalizeEntry(e))
      .filter((g): g is Guest => g !== null)
      .map((g, i) => {
        const original = full.guests[i];
        const rawTable =
          typeof original === 'object' && original ? original.table ?? (original as any).tableId : undefined;
        const seated = typeof rawTable === 'string' && tableIds.has(rawTable) ? rawTable : null;
        const guestTagIds = keepTags(g.tagIds);
        if (guestTagIds) g.tagIds = guestTagIds;
        else delete g.tagIds;
        g.tableId = seated;
        return g;
      });
    if (guests.length === 0) throw new ImportError('GUESTS_KEY_EMPTY');
    // Drop any link references to guests that didn't survive normalization (e.g. blank names).
    const validGuestIds = new Set(guests.map((g) => g.id));
    const keepGuests = (ids: string[]) => ids.filter((id) => validGuestIds.has(id));
    for (const g of guests) {
      if (g.linkedGuestIds?.length) {
        const kept = keepGuests(g.linkedGuestIds);
        if (kept.length) g.linkedGuestIds = kept;
        else delete g.linkedGuestIds;
      }
      if (g.apartGuestIds?.length) {
        const kept = keepGuests(g.apartGuestIds);
        if (kept.length) g.apartGuestIds = kept;
        else delete g.apartGuestIds;
      }
    }

    return {
      guests,
      tables,
      eventName: str(full.eventName),
      tags: tags.length ? tags : undefined,
      details: normalizeDetails(full.details),
    };
  }

  // Shape 2: flat array
  if (Array.isArray(data)) {
    const guests = data.map((e) => normalizeEntry(e)).filter((g): g is Guest => g !== null);
    if (guests.length === 0) {
      throw new ImportError('FLAT_ARRAY_EMPTY');
    }
    return { guests: guests.map(withoutTags), tables: [] };
  }

  // Shape 1: grouped object of arrays (the format used by lista_e_dasmes.json).
  // Each key is treated as a table name, and its names are seated at that table.
  const groupKeys = Object.keys(data as Record<string, unknown>);
  const allArrays = groupKeys.every((k) => Array.isArray((data as Record<string, unknown>)[k]));
  if (groupKeys.length > 0 && allArrays) {
    const guests: Guest[] = [];
    const tables: Table[] = [];
    for (const key of groupKeys) {
      const entries = (data as Record<string, ImportGuestEntry[]>)[key];
      const suffix = namingMode === 'numbers' ? String(tables.length + 1) : key;
      const table: Table = {
        id: makeId('t'),
        name: `${tableLabel} ${suffix}`,
        capacity: entries.length,
        autoSuffix: suffix,
      };
      const tableGuests: Guest[] = [];
      for (const entry of entries) {
        const g = normalizeEntry(entry, key);
        if (g) tableGuests.push({ ...withoutTags(g), tableId: table.id });
      }
      if (tableGuests.length > 0) {
        tables.push(table);
        guests.push(...tableGuests);
      }
    }
    if (guests.length === 0) {
      throw new ImportError('GROUPED_EMPTY');
    }
    return { guests, tables };
  }

  throw new ImportError('UNRECOGNIZED');
}

export function makeEventState(partial: Partial<EventState> = {}): EventState {
  const state: EventState = {
    eventName: partial.eventName ?? 'Guest List',
    guests: partial.guests ?? [],
    tables: partial.tables ?? [],
    updatedAt: new Date().toISOString(),
  };
  if (partial.tags?.length) state.tags = partial.tags;
  if (partial.details) state.details = partial.details;
  return state;
}

/**
 * Fold an imported tag palette into the one already open, for "add to this event" imports.
 *
 * Two events can legitimately hold different tags under the same id — ids are only unique within
 * an event — so a colliding id is re-issued and every reference in the incoming guests and tables
 * is rewritten to match. An identical tag (same label and color) is reused instead of duplicated,
 * which is what happens when someone exports an event, adds names, and imports it back into
 * itself. Mutates nothing: returns the merged palette and rewritten copies.
 */
export function mergeTags(
  baseTags: TableTag[],
  incoming: TableTag[],
  guests: Guest[],
  tables: Table[]
): { tags: TableTag[]; guests: Guest[]; tables: Table[] } {
  const tags = [...baseTags];
  const byId = new Map(baseTags.map((tag) => [tag.id, tag]));
  const sameTag = (a: TableTag, b: TableTag) => a.label === b.label && a.color === b.color;
  const remap = new Map<string, string>();

  for (const tag of incoming) {
    const existing = byId.get(tag.id);
    if (existing && sameTag(existing, tag)) continue; // already there under the same id
    if (!existing) {
      tags.push(tag);
      byId.set(tag.id, tag);
      continue;
    }
    // Same id, different tag: look for an identical one to fold into, else mint a new id.
    const twin = tags.find((t) => sameTag(t, tag));
    const id = twin?.id ?? makeId('tag');
    if (!twin) {
      const renamed = { ...tag, id };
      tags.push(renamed);
      byId.set(id, renamed);
    }
    remap.set(tag.id, id);
  }

  if (remap.size === 0) return { tags, guests, tables };
  const rewrite = (ids: string[] | undefined) => ids?.map((id) => remap.get(id) ?? id);
  return {
    tags,
    guests: guests.map((g) => (g.tagIds?.length ? { ...g, tagIds: rewrite(g.tagIds) } : g)),
    tables: tables.map((t) => (t.tagIds?.length ? { ...t, tagIds: rewrite(t.tagIds) } : t)),
  };
}

/** Strip tag references from a guest parsed out of a file that carries no tag palette. */
function withoutTags(guest: Guest): Guest {
  if (!guest.tagIds) return guest;
  const { tagIds: _dropped, ...rest } = guest;
  return rest;
}

export { makeId };
