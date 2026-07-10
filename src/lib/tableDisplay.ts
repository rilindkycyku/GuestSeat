import type { Table } from '../types';

export type Translator = (key: string, vars?: Record<string, string | number>) => string;

/** Resolves a table's display name, live-translating auto-generated names ("Table A") into the active language. */
export function tableDisplayName(table: Table, t: Translator): string {
  return table.autoSuffix != null ? `${t('tables.namePrefix')} ${table.autoSuffix}` : table.name;
}
