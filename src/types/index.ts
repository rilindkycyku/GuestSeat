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
  /**
   * IDs of custom tags (see EventState.tags) applied to this guest — e.g. "Bride's family",
   * "Groom's friends". Lets guests sharing one table (a long banquet table) be color-coded by group.
   */
  tagIds?: string[];
  /** RSVP / attendance response. Absent means no response yet (pending). */
  rsvp?: RsvpStatus;
  /**
   * Chosen meal, as a free label (e.g. "Chicken", "Fish", "Vegetarian"). Kept as a plain string
   * rather than an enum so every event can use its own menu; the caterer summary groups by value.
   */
  meal?: string;
  /** Day-of check-in flag — set true once the guest has arrived at the venue. */
  arrived?: boolean;
}

export type TableSide = 'groom' | 'bride';

/**
 * Physical shape of a table on the floor plan.
 * - `round`  — the default: seats arranged in a circle.
 * - `long`   — a long banquet / "imperial" table with guests seated down both
 *   long sides facing each other. Common at Albanian engagements and smaller
 *   weddings where everyone shares one long table.
 */
export type TableShape = 'round' | 'long';

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
  /** Table shape on the floor plan. Absent means `round` (the default). */
  shape?: TableShape;
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

/**
 * What kind of celebration this is. Drives the invitation's name labels (a couple vs. a single
 * honoree), the default schedule preset, and the framing throughout. Absent means `wedding`,
 * so events created before this existed keep working unchanged.
 */
export type EventType =
  | 'wedding'
  | 'engagement'
  | 'anniversary'
  | 'henna'
  | 'birthday'
  | 'bachelorette'
  | 'bachelor'
  | 'babyShower'
  | 'graduation'
  | 'party';

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
  /** What kind of event this is. Absent = wedding (backward compatible). */
  eventType?: EventType;
  /** First honoree name. For couples this is the bride / partner 1; for single-honoree events
   * (birthday, graduation…) it holds the celebrant's name and `groomName` is left empty. */
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
  /** Warm opening paragraph shown at the very top of the invitation, above the names. */
  introMessage?: string;
  /** Free-form message to guests, e.g. "We would be honored by your presence." */
  invitationNote?: string;
  /** Host/family sign-off, e.g. "Familja Kyçyku" — rendered as "With respect, …". */
  hostFamily?: string;
  /** Dress code line for guests, e.g. "Black tie", "Formal", "Garden party". */
  dressCode?: string;
  /** Phone number guests call to confirm attendance (RSVP). */
  rsvpPhone?: string;
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
