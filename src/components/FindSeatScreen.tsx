import { useMemo, useState } from 'react';
import type { EventState, Guest } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { SettingsControls } from './SettingsControls';
import { Credits } from './Credits';
import { formatEventDate } from '../lib/exportData';

/**
 * What a *guest* gets when they scan the QR on the way in: type your name, see your table.
 *
 * The plan already travels inside a share link, but until now every link opened the planner's view
 * and offered to import the whole list — useful for a helper, wrong for the 200 people arriving at
 * the door. A guest link (`&f=1`) opens this instead: read-only, nothing saved, no editing, and no
 * list of everyone shown until a name is typed, so the screen can't be casually browsed for the
 * whole guest list.
 */
export function FindSeatScreen({
  state,
  onOpenFullPlan,
}: {
  state: EventState;
  /** Escape hatch for a co-planner who followed a guest link: import the plan for real. */
  onOpenFullPlan: () => void;
}) {
  const { t, lang } = useLanguage();
  const [query, setQuery] = useState('');

  const tableById = useMemo(() => new Map(state.tables.map((tb) => [tb.id, tb])), [state.tables]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Nothing is listed until at least two characters are typed — this is a public screen.
    if (q.length < 2) return [] as Guest[];
    return state.guests
      .filter((g) => `${g.name} ${g.surname ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [query, state.guests]);

  const details = state.details ?? {};
  const when = [details.date ? formatEventDate(details.date, lang) : '', details.time?.trim()]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10 sm:py-14 relative">
      <SettingsControls className="absolute top-4 right-4" />

      <div className="mx-auto w-full max-w-md">
        <div className="text-center">
          <span className="text-4xl">🪑</span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900 dark:text-white">{t('findSeat.title')}</h1>
          <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">{state.eventName}</p>
          {(details.venue || when) && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              {[details.venue?.trim(), when].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <label className="mt-8 block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
          {t('findSeat.yourName')}
        </label>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('findSeat.placeholder')}
          aria-label={t('findSeat.yourName')}
          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-base text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        {/* Results are announced, since finding your table is the whole point of the screen. */}
        <div role="status" aria-live="polite" className="mt-4 space-y-2">
          {query.trim().length >= 2 && matches.length === 0 && (
            <p className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              {t('findSeat.noMatch')}
            </p>
          )}
          {matches.map((g) => {
            const table = g.tableId ? tableById.get(g.tableId) : undefined;
            return (
              <div
                key={g.id}
                className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3"
              >
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {g.surname ? `${g.name} ${g.surname}` : g.name}
                </p>
                {table ? (
                  <p className="mt-1 text-lg font-bold text-indigo-600 dark:text-indigo-400">
                    {tableDisplayName(table, t)}
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{t('findSeat.noTableYet')}</p>
                )}
              </div>
            );
          })}
        </div>

        {query.trim().length < 2 && (
          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{t('findSeat.hint')}</p>
        )}

        <button
          onClick={onOpenFullPlan}
          className="mt-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-medium px-4 py-2.5 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          {t('findSeat.openFullPlan')}
        </button>

        <Credits />
      </div>
    </div>
  );
}
