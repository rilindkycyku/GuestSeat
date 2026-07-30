import { useLanguage } from '../hooks/useLanguage';

/**
 * "Developed by" credits block. Shown at the bottom of the Settings modal, as the page footer, and
 * on the guest seat-lookup screen. `compact` trims the vertical rhythm for the modal, where space is
 * tighter than the full-page footer.
 *
 * The version sits next to the name because this is a PWA: a stale service worker can leave someone
 * on an old build, and "what does your footer say?" is the quickest way to find that out. It comes
 * from package.json via a build-time define, so there's only ever one place to bump.
 */
export function Credits({ compact = false }: { compact?: boolean }) {
  const { t } = useLanguage();

  return (
    <footer className={`text-center ${compact ? 'pt-4 pb-1' : 'py-8'}`}>
      <div className="mx-auto mb-4 h-px w-16 bg-slate-200 dark:bg-slate-800" />
      <p className="text-sm font-bold uppercase tracking-[0.25em] text-slate-700 dark:text-slate-200">GuestSeat</p>
      <p
        title={t('settings.version', { version: __APP_VERSION__ })}
        className="mt-1 text-[10px] font-semibold tracking-wider tabular-nums text-slate-400 dark:text-slate-500"
      >
        v{__APP_VERSION__}
      </p>
      <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        {t('settings.developedBy')}
      </p>
      <p className="mt-0.5 text-base font-bold text-indigo-600 dark:text-indigo-400">Rilind Kyçyku</p>
      <a
        href="https://www.rilindkycyku.dev"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 inline-block text-[11px] font-medium uppercase tracking-wider text-slate-400 hover:text-indigo-500 dark:text-slate-500 dark:hover:text-indigo-400 underline underline-offset-2 transition-colors"
      >
        www.rilindkycyku.dev
      </a>
    </footer>
  );
}
