import { useCallback, useMemo } from 'react';
import type { EventState, Table, TableSide, TableTag } from '../types';
import type { Translator } from '../lib/tableDisplay';

/** A table-list filter: everything, or one tag (Groom/Bride are system tags too). */
export type TableFilter = { kind: 'all' } | { kind: 'tag'; tagId: string };

interface TagActions {
  updateTable: (tableId: string, patch: Partial<Table>) => void;
  toggleTableTag: (tableId: string, tagId: string) => void;
  toggleGuestTag: (guestId: string, tagId: string) => void;
  addTag: (label: string) => string;
}

/**
 * Tags, and the table filter built on them.
 *
 * Two things make this less obvious than it looks. Groom and Bride are *system* tags: they're backed
 * by a table's single `side` field, so they behave as one mutually-exclusive choice while custom tags
 * stack. And a tag applied only to *guests* — "Bride's family" on a shared long table — still has to
 * count that table as tagged, otherwise filtering by it would hide the very table those guests sit at.
 */
export function useTableTags(state: EventState | null, filter: TableFilter, t: Translator, actions: TagActions) {
  const { updateTable, toggleTableTag, toggleGuestTag, addTag } = actions;

  const customTags = useMemo(() => state?.tags ?? [], [state]);

  const systemTags: TableTag[] = useMemo(
    () => [
      { id: 'groom', label: t('tables.side.groom'), color: 'sky' },
      { id: 'bride', label: t('tables.side.bride'), color: 'rose' },
    ],
    [t]
  );

  const allTags = useMemo(() => [...systemTags, ...customTags], [systemTags, customTags]);

  /** The tag ids applied to a table, merging the wedding side with its custom tags. */
  const assignedIdsFor = useCallback((tb: Table) => [...(tb.side ? [tb.side] : []), ...(tb.tagIds ?? [])], []);

  /** Guest-level tag ids present at each table (see the note about long tables above). */
  const guestTagIdsByTable = useMemo(() => {
    const byTable = new Map<string, Set<string>>();
    for (const g of state?.guests ?? []) {
      if (!g.tableId || !g.tagIds?.length) continue;
      const set = byTable.get(g.tableId) ?? new Set<string>();
      for (const id of g.tagIds) set.add(id);
      byTable.set(g.tableId, set);
    }
    return byTable;
  }, [state]);

  const tableHasTag = useCallback(
    (tb: Table, id: string) => tb.side === id || tb.tagIds?.includes(id) || guestTagIdsByTable.get(tb.id)?.has(id),
    [guestTagIdsByTable]
  );

  const filteredTables = useMemo(() => {
    if (!state) return [];
    if (filter.kind === 'all') return state.tables;
    return state.tables.filter((tb) => tableHasTag(tb, filter.tagId));
  }, [state, filter, tableHasTag]);

  const visibleTableIds = useMemo(() => new Set(filteredTables.map((tb) => tb.id)), [filteredTables]);

  /** How many tables each tag covers, counting a table once per tag. */
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const tb of state?.tables ?? []) {
      if (tb.side) counts.set(tb.side, (counts.get(tb.side) ?? 0) + 1);
      const ids = new Set([...(tb.tagIds ?? []), ...(guestTagIdsByTable.get(tb.id) ?? [])]);
      for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [state, guestTagIdsByTable]);

  // Toggle a tag on a table. Groom/Bride map to the mutually-exclusive `side`; custom tags stack.
  const toggleTag = useCallback(
    (tableId: string, tagId: string) => {
      if (tagId === 'groom' || tagId === 'bride') {
        const current = state?.tables.find((tb) => tb.id === tableId)?.side;
        updateTable(tableId, { side: current === tagId ? undefined : (tagId as TableSide) });
      } else {
        toggleTableTag(tableId, tagId);
      }
    },
    [state, updateTable, toggleTableTag]
  );

  // Create a custom tag and immediately apply it to whatever the user was tagging.
  const createTagForTable = useCallback(
    (tableId: string, label: string) => toggleTableTag(tableId, addTag(label)),
    [addTag, toggleTableTag]
  );

  const createTagForGuest = useCallback(
    (guestId: string, label: string) => toggleGuestTag(guestId, addTag(label)),
    [addTag, toggleGuestTag]
  );

  return {
    customTags,
    systemTags,
    allTags,
    assignedIdsFor,
    filteredTables,
    visibleTableIds,
    tagCounts,
    toggleTag,
    createTagForTable,
    createTagForGuest,
  };
}
