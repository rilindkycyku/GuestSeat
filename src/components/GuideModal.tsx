import { useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useDialog } from '../hooks/useDialog';
import {
  GUIDE_GROUPS,
  GUIDE_START,
  guideById,
  guideNeighbours,
  searchGuide,
  type GuideEntry,
  type GuideScreen,
} from '../lib/guide';

/**
 * The guide: one entry per screen of the app, on a screen of its own.
 *
 * A README is where a developer looks; a planner opening this on a phone the week before the wedding
 * never sees one. So the whole thing lives in the app, in both languages — searchable, because
 * somebody typing "QR" or "kopje" does not know which screen answers, which is exactly why they are
 * typing.
 *
 * Three things make it a guide rather than a wall of text. It opens **where you got stuck** (the sync
 * panel's own help lands on the sync entry). It offers to **open the screen** it is describing, since
 * "show me" beats "go and find it". And it reads **straight through** — the foot of each entry leads
 * to the next, so nobody has to return to the list to carry on.
 */
export function GuideModal({
  initialEntry,
  screenActions = {},
  onClose,
}: {
  initialEntry?: string;
  /** What the app can open from here. An entry whose screen is missing simply shows no button. */
  screenActions?: Partial<Record<GuideScreen, () => void>>;
  onClose: () => void;
}) {
  const { t, tList, tSteps } = useLanguage();
  const panelRef = useDialog<HTMLDivElement>(onClose);
  const [activeId, setActiveId] = useState(() => (guideById(initialEntry) ? initialEntry! : GUIDE_START));
  const [query, setQuery] = useState('');
  // On a phone the list of entries would push the text off the screen, so it stays folded until
  // asked for. From `lg` up it is always open and this button is not rendered at all.
  const [listOpen, setListOpen] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const firstRender = useRef(true);

  const active = guideById(activeId) ?? guideById(GUIDE_START)!;
  const { previous, next } = guideNeighbours(active.id);

  // Everything an entry says, for the search to read — the steps and the tips too, not just titles.
  const textOf = useMemo(
    () => (entry: GuideEntry) =>
      [
        t(`guide.entries.${entry.id}.title`),
        t(`guide.entries.${entry.id}.label`),
        t(`guide.entries.${entry.id}.summary`),
        ...tSteps(`guide.entries.${entry.id}.steps`).flatMap((step) => [step.title, step.text]),
        ...tList(`guide.entries.${entry.id}.tips`),
      ].join(' '),
    [t, tList, tSteps]
  );

  const results = useMemo(() => searchGuide(query, textOf), [query, textOf]);
  // Searching opens the list by itself: results hidden behind a toggle are a box that does not answer.
  const listVisible = listOpen || query.trim().length > 0;

  // Changing entry on a phone happens up at the list, and the text starts below it — without this a
  // tap looks like it did nothing. The first paint stays where it is.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setListOpen(false);
    articleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [active.id]);

  const steps = tSteps(`guide.entries.${active.id}.steps`);
  const tips = tList(`guide.entries.${active.id}.tips`);
  const openScreen = active.screen ? screenActions[active.screen] : undefined;

  const tabClass = (on: boolean) =>
    `w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left transition-colors ${
      on
        ? 'bg-indigo-600 text-white font-medium'
        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
    }`;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label={t('guide.title')}
      tabIndex={-1}
      data-print="hide"
      className="fixed inset-0 z-[55] flex flex-col bg-slate-50 dark:bg-slate-950 outline-none"
    >
      <header className="shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
        <div className="flex items-center gap-3 max-w-5xl mx-auto w-full">
          <span className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center text-lg shrink-0">
            📖
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">{t('guide.title')}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{t('guide.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full p-4 grid gap-4 lg:grid-cols-[260px_1fr] items-start">
          <aside className="lg:sticky lg:top-4 space-y-2">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('guide.searchPlaceholder')}
                aria-label={t('guide.searchPlaceholder')}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ps-8 pe-8 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
              />
              <span className="absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden>
                🔍
              </span>
              {query && (
                <button
                  onClick={() => setQuery('')}
                  aria-label={t('guide.searchClear')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            {/* On a phone: which entry is open, and the way to see the others. */}
            <button
              onClick={() => setListOpen((open) => !open)}
              aria-expanded={listVisible}
              className="lg:hidden w-full flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200"
            >
              <span aria-hidden>{active.icon}</span>
              <span className="flex-1 text-start truncate">{t(`guide.entries.${active.id}.label`)}</span>
              <span className={`text-slate-400 transition-transform ${listVisible ? 'rotate-90' : ''}`} aria-hidden>
                ›
              </span>
            </button>

            <nav className={`${listVisible ? 'block' : 'hidden'} lg:block space-y-3`} aria-label={t('guide.title')}>
              {results.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 px-1">{t('guide.searchEmpty')}</p>
              ) : (
                GUIDE_GROUPS.map((group) => {
                  const inGroup = results.filter((entry) => entry.group === group);
                  if (inGroup.length === 0) return null;
                  return (
                    <div key={group ?? 'lead'} className="space-y-1">
                      {group && (
                        <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          {t(`guide.groups.${group}`)}
                        </div>
                      )}
                      {inGroup.map((entry) => (
                        <button
                          key={entry.id}
                          onClick={() => setActiveId(entry.id)}
                          aria-current={entry.id === active.id ? 'page' : undefined}
                          className={tabClass(entry.id === active.id)}
                        >
                          <span aria-hidden>{entry.icon}</span>
                          <span className="truncate">{t(`guide.entries.${entry.id}.label`)}</span>
                        </button>
                      ))}
                    </div>
                  );
                })
              )}
            </nav>
          </aside>

          <article
            ref={articleRef}
            className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 scroll-mt-4"
          >
            <header className="flex items-start gap-3 mb-3">
              <span className="shrink-0 w-11 h-11 rounded-2xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-xl">
                {active.icon}
              </span>
              <div className="min-w-0 flex-1">
                {active.group && (
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t(`guide.groups.${active.group}`)}
                  </div>
                )}
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {t(`guide.entries.${active.id}.title`)}
                </h2>
              </div>
              {openScreen && (
                <button
                  onClick={() => {
                    onClose();
                    openScreen();
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
                >
                  {t('guide.openScreen')} ↗
                </button>
              )}
            </header>

            <p className="text-sm text-slate-600 dark:text-slate-300">{t(`guide.entries.${active.id}.summary`)}</p>

            {steps.length > 0 && (
              <>
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-5 mb-2">
                  ✅ {t('guide.stepsTitle')}
                </h3>
                <ol className="space-y-3">
                  {steps.map((step, index) => (
                    <li key={step.title} className="flex gap-3">
                      <span
                        className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center"
                        aria-hidden
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.title}</div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">{step.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </>
            )}

            {tips.length > 0 && (
              <>
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-5 mb-2">
                  💡 {t('guide.tipsTitle')}
                </h3>
                <ul className="list-disc ps-5 space-y-1.5 text-sm text-slate-600 dark:text-slate-300 marker:text-indigo-300 dark:marker:text-indigo-700">
                  {tips.map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              </>
            )}

            {active.seeAlso && active.seeAlso.length > 0 && (
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{t('guide.seeAlso')}</span>
                {active.seeAlso.map((id) => {
                  const other = guideById(id);
                  if (!other) return null;
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveId(other.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-700"
                    >
                      <span aria-hidden>{other.icon}</span>
                      {t(`guide.entries.${other.id}.label`)}
                    </button>
                  );
                })}
              </div>
            )}

            {/* The guide is also read straight through, not only searched — so the foot of one entry
                leads to the next instead of asking for a trip back to the list. */}
            <nav className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              {previous ? (
                <button
                  onClick={() => setActiveId(previous.id)}
                  className="flex items-center gap-2 text-start text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <span aria-hidden>‹</span>
                  <span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">{t('guide.previous')}</span>
                    {t(`guide.entries.${previous.id}.label`)}
                  </span>
                </button>
              ) : (
                <span />
              )}
              {next && (
                <button
                  onClick={() => setActiveId(next.id)}
                  className="flex items-center gap-2 text-end text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
                >
                  <span>
                    <span className="block text-[11px] text-slate-400 dark:text-slate-500">{t('guide.next')}</span>
                    {t(`guide.entries.${next.id}.label`)}
                  </span>
                  <span aria-hidden>›</span>
                </button>
              )}
            </nav>
          </article>
        </div>
      </div>
    </div>
  );
}
