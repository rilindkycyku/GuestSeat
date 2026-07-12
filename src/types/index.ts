/** Whether a guest has responded that they are attending. Absent = no response yet (pending). */
export type RsvpStatus = 'confirmed' | 'declined';

export interface Guest {
  id: string;
  /** Primary, required identifier for a guest. */
  name: string;
  /** Optional — a guest can exist with only a first name. */
  surname?: string;
  /** Free-form notes, e.g. dietary needs, "+1", relation. */
  notes?: string;
  /** Original grouping key from an imported file (e.g. alphabetical bucket). */
  group?: string;
  /** Table the guest is currently seated at, if any. */
  tableId: string | null;
  /** IDs of other guests this guest is linked to (couples, families, plus-ones). Always mutual. */
  linkedGuestIds?: string[];
  /** RSVP / attendance response. Absent means no response yet (pending). */
  rsvp?: RsvpStatus;
}

export type TableSide = 'groom' | 'bride';

/** Preset color a custom tag can use. Maps to Tailwind classes in lib/tagColors.ts. */
export type TagColor = 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'orange' | 'teal' | 'slate';

/** A user-defined, event-level label that can be applied to any number of tables. */
export interface TableTag {
  id: string;
  label: string;
  color: TagColor;
}

export interface Table {
  id: string;
  /** Stored name — used verbatim once the user manually renames the table. */
  name: string;
  capacity: number;
  /** Which side of the wedding this table belongs to, if categorized. */
  side?: TableSide;
  /** IDs of custom tags (see EventState.tags) applied to this table. */
  tagIds?: string[];
  /**
   * If set, this table's display name is auto-generated as `${namePrefix} ${autoSuffix}`
   * in the active language (e.g. "Table A" / "Tavolina A"), overriding `name`. Cleared as
   * soon as the user manually renames the table.
   */
  autoSuffix?: string;
}

export type TableNamingMode = 'letters' | 'numbers';

/** Visual style chosen for the printable guest invitation. */
export type InvitationTemplate = 'classic' | 'modern' | 'romantic';

/** A single line on the invitation's schedule (e.g. "16:00 — Ceremony"). */
export interface AgendaItem {
  id: string;
  /** Free-form time label, e.g. "16:00" or "4 PM". Optional. */
  time?: string;
  /** What happens then, e.g. "Ceremony", "Dinner", "First dance". */
  title: string;
}

/**
 * Human-facing details about the event itself, used to render a printable
 * invitation for guests. All fields are optional — the invitation simply omits
 * whatever isn't filled in.
 */
export interface EventDetails {
  brideName?: string;
  groomName?: string;
  /** Venue name, e.g. "Emerald Hall". */
  venue?: string;
  /** Street address / location line under the venue. */
  address?: string;
  /** Event date as an ISO `YYYY-MM-DD` string (from an <input type="date">). */
  date?: string;
  /** Start time as an `HH:mm` string (from an <input type="time">). */
  time?: string;
  /** Ordered schedule shown on the invitation. */
  agenda?: AgendaItem[];
  /** Free-form message to guests, e.g. "We would be honored by your presence." */
  invitationNote?: string;
  /** Which visual design the printable invitation uses. Defaults to 'classic'. */
  invitationTemplate?: InvitationTemplate;
}

export interface EventState {
  eventName: string;
  guests: Guest[];
  tables: Table[];
  /** User-defined tags available to apply to tables. */
  tags?: TableTag[];
  /** Optional wedding/event details used to build a guest invitation. */
  details?: EventDetails;
  updatedAt: string;
}

/** Raw shapes we accept on import, before normalization. */
export type ImportGuestEntry =
  | string
  | {
      id?: string;
      name?: string;
      firstName?: string;
      first_name?: string;
      surname?: string;
      lastName?: string;
      last_name?: string;
      table?: string;
      tableName?: string;
      notes?: string;
      group?: string;
      linkedGuestIds?: string[];
    };

export type ImportShape =
  | ImportGuestEntry[]
  | { [group: string]: ImportGuestEntry[] }
  | { guests: ImportGuestEntry[]; tables?: Partial<Table>[]; eventName?: string };
