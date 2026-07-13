import { useEffect, useRef, useState } from 'react';
import type { TableTag } from '../types';
import { tagColorClasses } from '../lib/tagColors';
import { useLanguage } from '../hooks/useLanguage';

interface TableTagPickerProps {
  /** All tags defined for the event. */
  tags: TableTag[];
  /** Tag ids currently applied to this table. */
  tableTagIds: string[];
  onToggle: (tagId: string) => void;
  /** Create a brand-new tag (already assigned to this table by the caller). */
  onCreateTag: (label: string) => void;
}

/** A small 🏷 button that opens a popover to apply/remove tags on one table, or create a new tag. */
export function TableTagPicker({ tags, tableTagIds, onToggle, onCreateTag }: TableTagPickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const toggleOpen = () => {
    // Flip the popover toward the center so it never runs off a narrow screen edge.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left > window.innerWidth / 2);
    setOpen((v) => !v);
  };

  const createAndAssign = () => {
    const label = draft.trim();
    if (!label) return;
    onCreateTag(label);
    setDraft('');
  };

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        title={t('tags.manageTags')}
        aria-label={t('tags.manageTags')}
        className={`text-xs px-1 py-0.5 rounded-md transition-colors ${
          open
            ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
            : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'
        }`}
      >
        🏷
      </button>
      {open && (
        <div
          className={`absolute top-full mt-1 z-30 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg p-1.5 ${
            alignRight ? 'right-0' : 'left-0'
          }`}
        >
          <div className="max-h-52 overflow-y-auto space-y-0.5">
            {tags.length === 0 && <p className="text-[11px] text-slate-400 px-2 py-1.5">{t('tags.noneYet')}</p>}
            {tags.map((tag) => {
              const active = tableTagIds.includes(tag.id);
              return (
                <button
                  key={tag.id}
                  onClick={() => onToggle(tag.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${
                    active ? '' : 'opacity-70'
                  }`}
                >
                  <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${tagColorClasses(tag.color).dot}`} />
                  <span className="truncate flex-1 text-slate-700 dark:text-slate-200">{tag.label}</span>
                  {active && <span className="shrink-0 text-indigo-500">✓</span>}
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createAndAssign();
              }}
              placeholder={t('tags.newTagPlaceholder')}
              className="min-w-0 flex-1 rounded-md border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white outline-none focus:border-indigo-400"
            />
            <button
              onClick={createAndAssign}
              title={t('tags.createTag')}
              className="shrink-0 rounded-md bg-indigo-600 text-white text-xs w-6 h-6 flex items-center justify-center hover:bg-indigo-500"
            >
              ＋
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
