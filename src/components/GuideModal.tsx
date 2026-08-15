import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';

/**
 * The whole app explained, in the app.
 *
 * A README is where a developer looks; a wedding planner opening this on a phone the week before the
 * event never sees one. So the guide lives here, in both languages, reachable from Settings, from
 * the drawer, and from the very first screen — and it opens *at* the part you asked about: the sync
 * panel's own "how do I set this up?" lands on the sync section rather than at the top of a wall of
 * text.
 *
 * Everything is closed except the section you came for. A guide that unfolds all at once is a manual,
 * and manuals do not get read.
 */

/** The order they appear in, with the icon each one is known by elsewhere in the app. */
const SECTIONS = [
  { id: 'start', icon: '🚀' },
  { id: 'importing', icon: '📥' },
  { id: 'board', icon: '🪑' },
  { id: 'guests', icon: '🧑' },
  { id: 'tables', icon: '⭕' },
  { id: 'autoSeat', icon: '✨' },
  { id: 'invitation', icon: '💌' },
  { id: 'sharing', icon: '📱' },
  { id: 'checkin', icon: '🎉' },
  { id: 'exports', icon: '🖨️' },
  { id: 'backup', icon: '💾' },
  { id: 'sync', icon: '☁️' },
  { id: 'privacy', icon: '🔒' },
] as const;

export type GuideSection = (typeof SECTIONS)[number]['id'];

/**
 * Bold the way the copy writes it — `**like this**` — because a step that says *which* button to
 * press should let the button stand out. Deliberately nothing else: this is one guide's copy, not a
 * Markdown renderer, and a half-built one would be a bug waiting for the first stray asterisk.
 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-slate-800 dark:text-slate-100">
            {part}
          </strong>
        ) : (
          part
        )
      )}
    </>
  );
}

export function GuideModal({ initialSection, onClose }: { initialSection?: GuideSection; onClose: () => void }) {
  const { t, tList } = useLanguage();
  const [open, setOpen] = useState<GuideSection | null>(initialSection ?? 'start');
  const bodyRef = useRef<HTMLDivElement>(null);
  const openRef = useRef<HTMLDivElement>(null);

  // Arriving from "how do I set this up?" should land on that section, not leave the reader to find
  // it. Only on the way in — scrolling afterwards is the reader's business.
  useEffect(() => {
    if (!initialSection || !openRef.current || !bodyRef.current) return;
    bodyRef.current.scrollTop = openRef.current.offsetTop - 8;
  }, [initialSection]);

  return (
    <ModalShell
      onClose={onClose}
      label={t('guide.title')}
      zClassName="z-[55]"
      panelClassName="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="📖" title={t('guide.title')} onClose={onClose} />

      <div ref={bodyRef} className="overflow-y-auto p-4 sm:p-5 space-y-2">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t('guide.intro')}</p>

        {SECTIONS.map(({ id, icon }) => {
          const isOpen = open === id;
          const body = tList(`guide.sections.${id}.body`);
          const steps = tList(`guide.sections.${id}.steps`);
          const tips = tList(`guide.sections.${id}.tips`);

          return (
            <div
              key={id}
              ref={isOpen && id === initialSection ? openRef : undefined}
              className={`rounded-2xl border transition-colors ${
                isOpen
                  ? 'border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20'
                  : 'border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30'
              }`}
            >
              <button
                onClick={() => setOpen(isOpen ? null : id)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span className="shrink-0 w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base">
                  {icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {t(`guide.sections.${id}.title`)}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {t(`guide.sections.${id}.summary`)}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  aria-hidden
                >
                  ›
                </span>
              </button>

              {isOpen && (
                <div className="px-3 pb-4 pt-0 ps-[3.75rem] space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  {body.map((paragraph, i) => (
                    <p key={i}>
                      <Rich text={paragraph} />
                    </p>
                  ))}

                  {steps.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                        {t('guide.stepsTitle')}
                      </p>
                      <ol className="list-decimal ps-5 space-y-1.5 marker:text-indigo-400 marker:font-semibold">
                        {steps.map((step, i) => (
                          <li key={i}>
                            <Rich text={step} />
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {tips.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1.5">
                        {t('guide.tipsTitle')}
                      </p>
                      <ul className="list-disc ps-5 space-y-1.5 marker:text-slate-300 dark:marker:text-slate-600">
                        {tips.map((tip, i) => (
                          <li key={i}>
                            <Rich text={tip} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ModalShell>
  );
}
