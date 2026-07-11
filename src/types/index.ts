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

export interface Table {
  id: string;
  /** Stored name — used verbatim once the user manually renames the table. */
  name: string;
  capacity: number;
  /** Which side of the wedding this table belongs to, if categorized. */
  side?: TableSide;
  /**
   * If set, this table's display name is auto-generated as `${namePrefix} ${autoSuffix}`
   * in the active language (e.g. "Table A" / "Tavolina A"), overriding `name`. Cleared as
   * soon as the user manually renames the table.
   */
  autoSuffix?: string;
}

export type TableNamingMode = 'letters' | 'numbers';

export interface EventState {
  eventName: string;
  guests: Guest[];
  tables: Table[];
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
