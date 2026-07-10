import type { Guest, Table, TableSide } from '../types';
import { translations } from './i18n';
import { ImportError, makeId } from './importGuests';

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

// Recognize "Unseated"/"Groom"/"Bride" labels regardless of which language they were exported in.
const UNSEATED_VALUES = new Set(Object.values(translations).map((d) => d.export.fields.unseated));
const SIDE_VALUES: Record<string, TableSide> = {};
for (const dict of Object.values(translations)) {
  SIDE_VALUES[dict.tables.side.groom] = 'groom';
  SIDE_VALUES[dict.tables.side.bride] = 'bride';
}

interface ParsedRow {
  name: string;
  surname: string;
  tableName: string | null;
  capacity?: number;
  side?: TableSide;
  linkedNames: string[];
  notes: string;
}

/**
 * Imports a CSV previously produced by this app's own CSV export (Name, Surname, Table,
 * Table capacity, Side, Linked with, Notes columns — in that order). The first row is always
 * treated as a header and skipped. Tables are reconstructed from the Table/Table capacity/Side
 * columns, and mutual links are resolved by matching full names across rows.
 */
export function parseImportedCsv(text: string): { guests: Guest[]; tables: Table[]; eventName?: string } {
  const rows = parseCsvRows(text);
  const dataRows = rows.slice(1);

  const tableOrder: string[] = [];
  const tableInfoByName = new Map<string, { capacity?: number; side?: TableSide }>();
  const parsedRows: ParsedRow[] = [];

  for (const cols of dataRows) {
    const [nameCell, surnameCell, tableCell, capacityCell, sideCell, linkedCell, notesCell] = cols;
    const name = (nameCell ?? '').trim();
    if (!name) continue;

    const tableCellTrim = (tableCell ?? '').trim();
    const tableName = !tableCellTrim || UNSEATED_VALUES.has(tableCellTrim) ? null : tableCellTrim;

    if (tableName && !tableInfoByName.has(tableName)) {
      tableOrder.push(tableName);
      const capacityNum = Number.parseInt((capacityCell ?? '').trim(), 10);
      tableInfoByName.set(tableName, {
        capacity: Number.isFinite(capacityNum) && capacityNum > 0 ? capacityNum : undefined,
        side: SIDE_VALUES[(sideCell ?? '').trim()],
      });
    }

    parsedRows.push({
      name,
      surname: (surnameCell ?? '').trim(),
      tableName,
      linkedNames: (linkedCell ?? '')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      notes: (notesCell ?? '').trim(),
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

  const guests: Guest[] = parsedRows.map((r) => ({
    id: makeId('g'),
    name: r.name,
    surname: r.surname || undefined,
    notes: r.notes || undefined,
    tableId: r.tableName ? (tableIdByName.get(r.tableName) ?? null) : null,
  }));

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

  return { guests, tables };
}
