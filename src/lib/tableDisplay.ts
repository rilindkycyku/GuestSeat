import type { Table } from '../types';

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Resolves a table's display name, live-translating auto-generated names ("Table A") into the active language. */
export function tableDisplayName(table: Table, t: Translator): string {
  return table.autoSuffix != null ? `${t('tables.namePrefix')} ${table.autoSuffix}` : table.name;
}

/**
 * Compact name for tight spots like the floor-plan center circle. Collapses the common
 * "single word + short suffix" table naming to an initial ("Tavolina 12" → "T. 12", "Table A" →
 * "T. A") regardless of language; anything else (real multi-word custom names) is left unchanged.
 */
export function tableShortName(table: Table, t: Translator): string {
  const full = tableDisplayName(table, t);
  const match = full.match(/^(\p{L})\p{L}*\s+(.{1,3})$/u);
  return match ? `${match[1].toUpperCase()}. ${match[2]}` : full;
}
