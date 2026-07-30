import { useMemo } from 'react';
import type { EventState } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';

/**
 * A read-only overview of the event: headcount, RSVP split, table utilisation, groom/bride side
 * balance and a caterer-facing meal breakdown. Everything is derived from state on the fly, so it
 * always reflects the current arrangement.
 */
export function StatsModal({ state, onClose }: { state: EventState; onClose: () => void }) {
  const { t } = useLanguage();

  const s = useMemo(() => {
    const guests = state.guests;
    const total = guests.length;
    const seated = guests.filter((g) => g.tableId).length;
    const coming = guests.filter((g) => g.rsvp === 'confirmed').length;
    const declined = guests.filter((g) => g.rsvp === 'declined').length;
    const pending = total - coming - declined;

    // Day-of check-in ("Regjistrimi"): everyone who hasn't declined can arrive, so measure
    // arrivals against that pool to mirror the check-in screen's "X of Y arrived" counter.
    const expected = total - declined;
    const arrived = guests.filter((g) => g.arrived).length;

    const seatedByTable = new Map<string, number>();
    for (const g of guests) if (g.tableId) seatedByTable.set(g.tableId, (seatedByTable.get(g.tableId) ?? 0) + 1);

    let totalSeats = 0;
    let full = 0;
    let over = 0;
    const sideSeats = { groom: 0, bride: 0, unassigned: 0 };
    for (const tb of state.tables) {
      totalSeats += tb.capacity;
      const n = seatedByTable.get(tb.id) ?? 0;
      if (n >= tb.capacity && tb.capacity > 0) full++;
      if (n > tb.capacity) over++;
      const bucket = tb.side ?? 'unassigned';
      sideSeats[bucket] += n;
    }
    const freeSeats = Math.max(0, totalSeats - seated);

    // Caterer summary: everyone who hasn't declined, grouped by meal choice.
    const mealCounts = new Map<string, number>();
    for (const g of guests) {
      if (g.rsvp === 'declined') continue;
      const key = g.meal?.trim() || '__unset__';
      mealCounts.set(key, (mealCounts.get(key) ?? 0) + 1);
    }
    const meals = [...mealCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        label: key === '__unset__' ? t('stats.mealUnset') : key,
        count,
        unset: key === '__unset__',
      }));
    const hasMealChoices = meals.some((m) => !m.unset);

    return {
      total,
      seated,
      unseated: total - seated,
      coming,
      declined,
      pending,
      expected,
      arrived,
      tables: state.tables.length,
      full,
      over,
      totalSeats,
      freeSeats,
      sideSeats,
      meals,
      hasMealChoices,
    };
  }, [state, t]);

  const sideTotal = s.sideSeats.groom + s.sideSeats.bride + s.sideSeats.unassigned;
  const maxMeal = Math.max(1, ...s.meals.map((m) => m.count));

  return (
    <ModalShell
      onClose={onClose}
      label={t('stats.title')}
      panelClassName="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="📊" title={t('stats.title')} onClose={onClose} />

      <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Headline tiles */}
        <div className="grid grid-cols-3 gap-2">
          <Tile value={s.total} label={t('stats.guests')} tone="slate" />
          <Tile value={s.seated} label={t('stats.seated')} tone="indigo" />
          <Tile value={s.unseated} label={t('stats.unseated')} tone={s.unseated ? 'amber' : 'slate'} />
        </div>

        {/* RSVP */}
        <div className="grid grid-cols-3 gap-2">
          <Tile value={s.coming} label={t('stats.coming')} tone="emerald" />
          <Tile value={s.declined} label={t('stats.declined')} tone="red" />
          <Tile value={s.pending} label={t('stats.pending')} tone="slate" />
        </div>

        {/* Check-in (Regjistrimi): who has arrived on the day */}
        <Section title={t('stats.checkin')}>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {t('checkin.subtitle', { arrived: s.arrived, total: s.expected })}
            </span>
            <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {s.expected ? Math.round((s.arrived / s.expected) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${s.expected ? (s.arrived / s.expected) * 100 : 0}%` }}
            />
          </div>
        </Section>

        {/* Tables */}
        <Section title={t('stats.tables')}>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
            <Row label={t('stats.tables')} value={s.tables} />
            <Row label={t('stats.totalSeats')} value={s.totalSeats} />
            <Row label={t('stats.full')} value={s.full} />
            <Row label={t('stats.freeSeats')} value={s.freeSeats} />
            {s.over > 0 && <Row label={t('stats.overCapacity')} value={s.over} danger />}
          </div>
        </Section>

        {/* Side balance */}
        {sideTotal > 0 && (
          <Section title={t('stats.sideBalance')}>
            <div className="flex h-6 rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-white">
              {s.sideSeats.groom > 0 && (
                <div
                  className="bg-sky-500 flex items-center justify-center"
                  style={{ width: `${(s.sideSeats.groom / sideTotal) * 100}%` }}
                >
                  {s.sideSeats.groom}
                </div>
              )}
              {s.sideSeats.bride > 0 && (
                <div
                  className="bg-rose-500 flex items-center justify-center"
                  style={{ width: `${(s.sideSeats.bride / sideTotal) * 100}%` }}
                >
                  {s.sideSeats.bride}
                </div>
              )}
              {s.sideSeats.unassigned > 0 && (
                <div
                  className="bg-slate-400 flex items-center justify-center"
                  style={{ width: `${(s.sideSeats.unassigned / sideTotal) * 100}%` }}
                >
                  {s.sideSeats.unassigned}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500 dark:text-slate-400">
              <LegendDot className="bg-sky-500" label={`${t('stats.groomSide')} · ${s.sideSeats.groom}`} />
              <LegendDot className="bg-rose-500" label={`${t('stats.brideSide')} · ${s.sideSeats.bride}`} />
              {s.sideSeats.unassigned > 0 && (
                <LegendDot
                  className="bg-slate-400"
                  label={`${t('stats.unassignedSide')} · ${s.sideSeats.unassigned}`}
                />
              )}
            </div>
          </Section>
        )}

        {/* Meals (caterer) */}
        <Section title={t('stats.meals')}>
          {s.hasMealChoices ? (
            <div className="space-y-1.5">
              {s.meals.map((m) => (
                <div key={m.label} className="flex items-center gap-2">
                  <span
                    className={`text-xs w-24 shrink-0 truncate ${m.unset ? 'text-slate-400 italic' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {m.label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${m.unset ? 'bg-slate-300 dark:bg-slate-600' : 'bg-indigo-500'}`}
                      style={{ width: `${(m.count / maxMeal) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 w-6 text-right tabular-nums">
                    {m.count}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">{t('stats.noMeals')}</p>
          )}
        </Section>
      </div>
    </ModalShell>
  );
}

const TONES: Record<string, string> = {
  slate: 'bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100',
  indigo: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300',
  emerald: 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300',
  amber: 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300',
  red: 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400',
};

function Tile({ value, label, tone }: { value: number; label: string; tone: keyof typeof TONES }) {
  return (
    <div className={`rounded-xl px-2 py-3 text-center ${TONES[tone]}`}>
      <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[11px] font-medium mt-1 opacity-80">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`font-semibold tabular-nums ${danger ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </span>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
