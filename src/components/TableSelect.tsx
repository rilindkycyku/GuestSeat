import { useEffect, useMemo, useRef, useState } from 'react';
import type { Table, TableTag } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { tagColorClasses } from '../lib/tagColors';

interface TableSelectProps {
  tables: Table[];
  /** All tags defined for the event; used to render each table's tag chips. */
  tags: TableTag[];
  seatedCount: Map<string, number>;
  /** Currently selected table id, or '' for unseated. */
  value: string;
  onChange: (tableId: string) => void;
}

/**
 * Custom-styled replacement for a native table `<select>`. Shows each table's
 * seated/capacity count and any tags applied to it as color chips.
 */
export function TableSelect({ tables, tags, seatedCount, value, onChange }: TableSelectProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const tagById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const tagsFor = (tb: Table) => (tb.tagIds ?? []).map((id) => tagById.get(id)).filter((x): x is TableTag => x != null);

  const selected = value ? tables.find((tb) => tb.id === value) : undefined;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (id: string) => {
    onChange(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected ? (
            <>
              <span className="truncate">
                {tableDisplayName(selected, t)} ({seatedCount.get(selected.id) ?? 0}/{selected.capacity})
              </span>
              {tagsFor(selected).map((tag) => (
                <span key={tag.id} className={`shrink-0 w-2 h-2 rounded-full ${tagColorClasses(tag.color).dot}`} />
              ))}
            </>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">{t('guestEditor.unseatedOption')}</span>
          )}
        </span>
        <span className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
        >
          <Option label={t('guestEditor.unseatedOption')} selected={value === ''} onClick={() => choose('')} />
          {tables.map((tb) => (
            <Option
              key={tb.id}
              label={`${tableDisplayName(tb, t)} (${seatedCount.get(tb.id) ?? 0}/${tb.capacity})`}
              selected={value === tb.id}
              tags={tagsFor(tb)}
              onClick={() => choose(tb.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  label,
  selected,
  tags = [],
  onClick,
}: {
  label: string;
  selected: boolean;
  tags?: TableTag[];
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${
        selected ? 'bg-indigo-50/60 dark:bg-indigo-950/30' : ''
      }`}
    >
      <span className={`truncate ${selected ? 'font-medium text-indigo-700 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'}`}>
        {label}
      </span>
      {tags.length > 0 && (
        <span className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1">
          {tags.map((tag) => (
            <span key={tag.id} className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tagColorClasses(tag.color).chip}`}>
              {tag.label}
            </span>
          ))}
        </span>
      )}
      {selected && tags.length === 0 && <span className="ml-auto shrink-0 text-indigo-500">✓</span>}
    </button>
  );
}
