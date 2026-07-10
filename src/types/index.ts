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
}

export type TableSide = 'groom' | 'bride';

export interface Table {
  id: string;
  name: string;
  capacity: number;
  /** Which side of the wedding this table belongs to, if categorized. */
  side?: TableSide;
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
    };

export type ImportShape =
  | ImportGuestEntry[]
  | { [group: string]: ImportGuestEntry[] }
  | { guests: ImportGuestEntry[]; tables?: Partial<Table>[]; eventName?: string };
