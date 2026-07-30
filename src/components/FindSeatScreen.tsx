import { useMemo, useState } from 'react';
import type { EventState } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { tagColorClasses } from '../lib/tagColors';
import { findSeatMatches, FIND_SEAT_MIN_QUERY, type SeatMatch } from '../lib/findSeat';
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
 *
 * A name and a table number aren't always enough to recognise yourself: two cousins called Butrinti
 * produced two identical cards. So each card also shows what the planner recorded about who a guest
 * belongs to — their group tags, the people they're linked to, the table's side, their meal — and
 * cards that still share a name say so, including the common case where both namesakes sit at the
 * same table and the ambiguity doesn't matter. Notes stay off this screen: they hold dietary needs
 * and other things a guest wrote for the host, not for a phone held up at the door.
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

  const { matches, total } = useMemo(() => findSeatMatches(state, query), [state, query]);

  const details = state.details ?? {};
  const when = [details.date ? formatEventDate(details.date, lang) : '', details.time?.trim()]
    .filter(Boolean)
    .join(' · ');
  const searching = query.trim().length >= FIND_SEAT_MIN_QUERY;

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
          {searching && matches.length === 0 && (
            <p className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
              {t('findSeat.noMatch')}
            </p>
          )}
          {matches.map((match) => (
            <MatchCard key={match.guest.id} match={match} />
          ))}
          {total > matches.length && (
            <p className="px-1 pt-1 text-xs text-slate-400 dark:text-slate-500">
              {t('findSeat.tooMany', { count: total })}
            </p>
          )}
        </div>

        {!searching && <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{t('findSeat.hint')}</p>}

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

/** One result: the table, plus every signal that says "this row is you". */
function MatchCard({ match }: { match: SeatMatch }) {
  const { t } = useLanguage();
  const { guest, table, tags, companions, sameName } = match;

  return (
    <>
      {/* Namesakes always sort next to each other, so the warning rides above the first of them. */}
      {sameName?.index === 1 && (
        <p className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
          {t(sameName.oneTable ? 'findSeat.sameNameOneTable' : 'findSeat.sameName', { count: sameName.count })}
        </p>
      )}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-4 py-3">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
            {guest.surname ? `${guest.name} ${guest.surname}` : guest.name}
          </p>
          {sameName && (
            <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-950/50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300 tabular-nums">
              {t('findSeat.sameNameCounter', { index: sameName.index, count: sameName.count })}
            </span>
          )}
        </div>

        {table ? (
          <p className="mt-1 text-lg font-bold text-indigo-600 dark:text-indigo-400">{tableDisplayName(table, t)}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{t('findSeat.noTableYet')}</p>
        )}

        {table?.side && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{t(`tables.filter.${table.side}`)}</p>
        )}

        {(tags.length > 0 || guest.meal) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tagColorClasses(tag.color).chip}`}
              >
                {tag.label}
              </span>
            ))}
            {guest.meal && (
              <span
                title={t('guestEditor.meal')}
                className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300"
              >
                🍽 {guest.meal}
              </span>
            )}
          </div>
        )}

        {companions.length > 0 && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span aria-hidden="true">🔗</span>
            <span>{t('findSeat.withCompanions', { names: companions.join(', ') })}</span>
          </p>
        )}
      </div>
    </>
  );
}
