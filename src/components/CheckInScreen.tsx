import { useMemo, useState } from 'react';
import type { EventState } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { useDialog } from '../hooks/useDialog';
import { tableDisplayName } from '../lib/tableDisplay';
import { tagColorClasses } from '../lib/tagColors';

/**
 * A focused, big-touch-target screen for the wedding day: search a guest, tap to mark them arrived,
 * and watch the "X of Y arrived" counter climb. Declined guests are hidden — they aren't coming.
 * Arrived guests sink to the bottom and dim so the people still waiting stay at the top.
 */
export function CheckInScreen({
  state,
  onToggleArrived,
  onReset,
  onClose,
}: {
  state: EventState;
  onToggleArrived: (guestId: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  // A full-screen takeover rather than a panel on a backdrop, so it lays itself out — but it is
  // still a dialog: it traps focus, closes on Escape and hands focus back when it does.
  const panelRef = useDialog(onClose);

  const tableById = useMemo(() => new Map(state.tables.map((tb) => [tb.id, tb])), [state.tables]);
  const guestById = useMemo(() => new Map(state.guests.map((g) => [g.id, g])), [state.guests]);
  const tagById = useMemo(() => new Map((state.tags ?? []).map((tag) => [tag.id, tag])), [state.tags]);

  const attendees = useMemo(() => state.guests.filter((g) => g.rsvp !== 'declined'), [state.guests]);
  const arrivedCount = attendees.filter((g) => g.arrived).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? attendees.filter((g) => `${g.name} ${g.surname ?? ''}`.toLowerCase().includes(q))
      : attendees;
    // Not-yet-arrived first, then arrived; alphabetical within each group.
    return [...list].sort((a, b) => {
      if (!!a.arrived !== !!b.arrived) return a.arrived ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [attendees, query]);

  const pct = attendees.length ? Math.round((arrivedCount / attendees.length) * 100) : 0;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('checkin.title')}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-slate-50 dark:bg-slate-950 outline-none"
    >
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-lg shrink-0">
            🎉
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{t('checkin.title')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {t('checkin.subtitle', { arrived: arrivedCount, total: attendees.length })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-500"
          >
            {t('checkin.exit')}
          </button>
        </div>

        <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>

        <div className="relative mt-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('checkin.searchPlaceholder')}
            autoFocus
            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-9 py-2.5 text-base text-slate-900 dark:text-white outline-none focus:border-indigo-400"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          {query && (
            <button
              onClick={() => setQuery('')}
              aria-label={t('checkin.undo')}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 max-w-2xl w-full mx-auto">
        {attendees.length === 0 && <p className="text-center text-slate-400 py-16">{t('checkin.empty')}</p>}
        {attendees.length > 0 && visible.length === 0 && (
          <p className="text-center text-slate-400 py-16">{t('checkin.noMatches')}</p>
        )}
        {visible.map((g) => {
          const table = g.tableId ? tableById.get(g.tableId) : undefined;
          // Extra signals to tell same-named guests apart: their group tags and who they're
          // linked to (partner, family). Only rendered when present.
          const tags = (g.tagIds ?? []).map((id) => tagById.get(id)).filter((tag): tag is NonNullable<typeof tag> => !!tag);
          const linkedNames = (g.linkedGuestIds ?? [])
            .map((id) => guestById.get(id))
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => (p.surname ? `${p.name} ${p.surname}` : p.name));
          return (
            <button
              key={g.id}
              onClick={() => onToggleArrived(g.id)}
              className={`w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors ${
                g.arrived
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 dark:hover:border-indigo-700'
              }`}
            >
              <span
                className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  g.arrived
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-transparent border border-slate-300 dark:border-slate-600'
                }`}
              >
                ✓
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-base font-medium truncate ${g.arrived ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-800 dark:text-slate-100'}`}>
                  {g.surname ? `${g.name} ${g.surname}` : g.name}
                </span>
                <span className="block text-xs text-slate-400 dark:text-slate-500 truncate">
                  {table ? tableDisplayName(table, t) : t('checkin.noTable')}
                </span>
                {(tags.length > 0 || linkedNames.length > 0) && (
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag.id}
                        className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${tagColorClasses(tag.color).chip}`}
                      >
                        {tag.label}
                      </span>
                    ))}
                    {linkedNames.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 min-w-0">
                        <span className="shrink-0">🔗</span>
                        <span className="truncate">{linkedNames.join(', ')}</span>
                      </span>
                    )}
                  </span>
                )}
              </span>
              {g.arrived && <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400">{t('checkin.arrived')}</span>}
            </button>
          );
        })}

        {arrivedCount > 0 && (
          <div className="pt-4 text-center">
            <button onClick={onReset} className="text-xs font-medium text-slate-400 hover:text-red-500">
              {t('checkin.reset')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
