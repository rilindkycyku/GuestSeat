import type { Guest, ImportResult, RsvpStatus, Table, TableSide, TableTag } from '../types';
import { translations } from './i18n';
import { ImportError, makeId } from './importGuests';
import { TAG_COLOR_ORDER } from './tagColors';

/** Parses RFC4180-ish CSV text (quoted fields, doubled-quote escaping) into rows of cells. */
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += char;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Recognize "Unseated"/"Groom"/"Bride"/RSVP labels regardless of which language they were exported in.
const UNSEATED_VALUES = new Set(Object.values(translations).map((d) => d.export.fields.unseated));
const SIDE_VALUES: Record<string, TableSide> = {};
const RSVP_VALUES: Record<string, RsvpStatus> = {};
for (const dict of Object.values(translations)) {
  SIDE_VALUES[dict.tables.side.groom] = 'groom';
  SIDE_VALUES[dict.tables.side.bride] = 'bride';
  RSVP_VALUES[dict.rsvp.confirmed] = 'confirmed';
  RSVP_VALUES[dict.rsvp.declined] = 'declined';
}

type ColumnField = 'name' | 'surname' | 'table' | 'capacity' | 'side' | 'rsvp' | 'meal' | 'tags' | 'linked' | 'notes';

// Map every localized export-column header back to a field key, so import is order-independent
// and tolerates older exports that lack newer columns (e.g. RSVP).
const HEADER_TO_FIELD = new Map<string, ColumnField>();
for (const dict of Object.values(translations)) {
  const f = dict.export.fields;
  const pairs: [string, ColumnField][] = [
    [f.name, 'name'],
    [f.surname, 'surname'],
    [f.table, 'table'],
    [f.capacity, 'capacity'],
    [f.side, 'side'],
    [f.rsvp, 'rsvp'],
    [f.meal, 'meal'],
    [f.tags, 'tags'],
    [f.linkedWith, 'linked'],
    [f.notes, 'notes'],
  ];
  for (const [label, field] of pairs) HEADER_TO_FIELD.set(label.trim().toLowerCase(), field);
}

/** Resolves column indices from a header row; falls back to the historical fixed order if unrecognized. */
function resolveColumns(header: string[]): Record<ColumnField, number> {
  const cols: Record<ColumnField, number> = {
    name: -1,
    surname: -1,
    table: -1,
    capacity: -1,
    side: -1,
    rsvp: -1,
    meal: -1,
    tags: -1,
    linked: -1,
    notes: -1,
  };
  let matched = 0;
  header.forEach((cell, i) => {
    const field = HEADER_TO_FIELD.get(cell.trim().toLowerCase());
    if (field && cols[field] === -1) {
      cols[field] = i;
      matched += 1;
    }
  });
  if (matched < 2) {
    // Unrecognized header — assume the legacy fixed layout (no RSVP, meal or tag columns).
    return { name: 0, surname: 1, table: 2, capacity: 3, side: 4, rsvp: -1, meal: -1, tags: -1, linked: 5, notes: 6 };
  }
  return cols;
}

interface ParsedRow {
  name: string;
  surname: string;
  tableName: string | null;
  capacity?: number;
  side?: TableSide;
  rsvp?: RsvpStatus;
  meal: string;
  tagLabels: string[];
  linkedNames: string[];
  notes: string;
}

/**
 * Imports a CSV previously produced by this app's own CSV export. Columns are located by their
 * (localized) header names, so column order and newer/older column sets are both tolerated; an
 * unrecognized header falls back to the historical fixed layout. Tables are reconstructed from
 * the Table/Table capacity/Side columns, attendance from the Attendance column, and mutual links
 * are resolved by matching full names across rows.
 */
export function parseImportedCsv(text: string): ImportResult {
  const rows = parseCsvRows(text);
  const col = resolveColumns(rows[0] ?? []);
  const dataRows = rows.slice(1);
  const cell = (cols: string[], idx: number) => (idx >= 0 ? (cols[idx] ?? '').trim() : '');

  const tableOrder: string[] = [];
  const tableInfoByName = new Map<string, { capacity?: number; side?: TableSide }>();
  const parsedRows: ParsedRow[] = [];

  for (const cols of dataRows) {
    const name = cell(cols, col.name);
    if (!name) continue;

    const tableCellTrim = cell(cols, col.table);
    const tableName = !tableCellTrim || UNSEATED_VALUES.has(tableCellTrim) ? null : tableCellTrim;

    if (tableName && !tableInfoByName.has(tableName)) {
      tableOrder.push(tableName);
      const capacityNum = Number.parseInt(cell(cols, col.capacity), 10);
      tableInfoByName.set(tableName, {
        capacity: Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : undefined,
        side: SIDE_VALUES[cell(cols, col.side)],
      });
    }

    parsedRows.push({
      name,
      surname: cell(cols, col.surname),
      tableName,
      rsvp: RSVP_VALUES[cell(cols, col.rsvp)],
      meal: cell(cols, col.meal),
      // Tag labels are exported joined by ", "; accept ";" too, since spreadsheets get edited by hand.
      tagLabels: cell(cols, col.tags)
        .split(/[,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
      linkedNames: cell(cols, col.linked)
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      notes: cell(cols, col.notes),
    });
  }

  if (parsedRows.length === 0) {
    throw new ImportError('CSV_EMPTY');
  }

  const countByTable = new Map<string, number>();
  for (const r of parsedRows) {
    if (r.tableName) countByTable.set(r.tableName, (countByTable.get(r.tableName) ?? 0) + 1);
  }

  const tables: Table[] = tableOrder.map((name) => {
    const info = tableInfoByName.get(name);
    return {
      id: makeId('t'),
      name,
      capacity: info?.capacity ?? countByTable.get(name) ?? 1,
      side: info?.side,
    };
  });
  const tableIdByName = new Map(tables.map((tb) => [tb.name, tb.id]));

  // Rebuild the tag palette from the labels seen in the Tags column, in first-seen order, cycling
  // the preset colors — a CSV carries labels only, so the colors can't be the exported ones.
  const tagIdByLabel = new Map<string, string>();
  const tags: TableTag[] = [];
  for (const r of parsedRows) {
    for (const label of r.tagLabels) {
      if (tagIdByLabel.has(label)) continue;
      const tag: TableTag = {
        id: makeId('tag'),
        label,
        color: TAG_COLOR_ORDER[tags.length % TAG_COLOR_ORDER.length],
      };
      tagIdByLabel.set(label, tag.id);
      tags.push(tag);
    }
  }

  const guests: Guest[] = parsedRows.map((r) => {
    const guest: Guest = {
      id: makeId('g'),
      name: r.name,
      surname: r.surname || undefined,
      notes: r.notes || undefined,
      tableId: r.tableName ? (tableIdByName.get(r.tableName) ?? null) : null,
      rsvp: r.rsvp,
    };
    if (r.meal) guest.meal = r.meal;
    const tagIds = r.tagLabels.map((label) => tagIdByLabel.get(label)).filter((id): id is string => !!id);
    if (tagIds.length) guest.tagIds = tagIds;
    return guest;
  });

  // Resolve "Linked with" names to guest ids, skipping ambiguous (duplicate full-name) matches.
  const idsByFullName = new Map<string, string[]>();
  for (const g of guests) {
    const full = g.surname ? `${g.name} ${g.surname}` : g.name;
    const list = idsByFullName.get(full) ?? [];
    list.push(g.id);
    idsByFullName.set(full, list);
  }
  guests.forEach((g, i) => {
    const linkedNames = parsedRows[i].linkedNames;
    if (!linkedNames.length) return;
    const linked = linkedNames
      .map((name) => idsByFullName.get(name))
      .filter((ids): ids is string[] => !!ids && ids.length === 1)
      .map((ids) => ids[0])
      .filter((id) => id !== g.id);
    if (linked.length) g.linkedGuestIds = linked;
  });

  return { guests, tables, ...(tags.length ? { tags } : {}) };
}
