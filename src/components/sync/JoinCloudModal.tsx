import { useEffect, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { ModalHeader } from '../ModalHeader';
import { ModalShell } from '../ModalShell';
import { MODES, connectSummary, type ConnectSummary, type SyncMode } from '../../lib/sync/sync';
import { syncErrorText } from '../../lib/sync/messages';
import { SideBySide } from './SideBySide';

/**
 * The question a device is asked the first time it meets a cloud copy, before it is allowed to push
 * anything at all.
 *
 * It exists because of the obvious accident: install the app on a second phone, connect it to the
 * same project, and — without this — its empty, freshly created state is a perfectly valid thing to
 * upload over the seating plan somebody spent an evening on. Nothing in the app would have any
 * reason to think the phone was wrong.
 *
 * The numbers come first and the choices second, on purpose. "Merge / take / send" means nothing
 * without knowing that one side holds three events and the other holds none.
 */
export function JoinCloudModal({
  busy,
  onChoose,
  onClose,
}: {
  busy: boolean;
  onChoose: (mode: SyncMode, summary: ConnectSummary) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [summary, setSummary] = useState<ConnectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SyncMode | null>(null);

  useEffect(() => {
    let cancelled = false;
    connectSummary()
      .then((next) => {
        if (cancelled) return;
        setSummary(next);
        // Pre-selected, never pre-applied: the recommendation is the app's reading of the two
        // counts, and the button underneath is still the user's.
        setMode(next.recommended);
      })
      .catch((err) => !cancelled && setError(syncErrorText(err, t)));
    return () => {
      cancelled = true;
    };
    // Read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cloudEmpty = summary?.cloud === 0;

  const Choice = ({
    value,
    icon,
    title,
    hint,
    danger,
  }: {
    value: SyncMode;
    icon: string;
    title: string;
    hint: string;
    danger?: boolean;
  }) => (
    <button
      onClick={() => setMode(value)}
      className={`w-full flex items-start gap-3 p-3 rounded-2xl border text-left transition-colors ${
        mode === value
          ? danger
            ? 'border-red-400 bg-red-50/60 dark:bg-red-950/20 dark:border-red-800'
            : 'border-indigo-400 bg-indigo-50/60 dark:bg-indigo-950/20 dark:border-indigo-700'
          : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
      }`}
    >
      <span className="shrink-0 w-9 h-9 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-base">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
          {summary?.recommended === value && (
            <span className="ms-2 text-[10px] font-medium uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
              {t('sync.join.recommended')}
            </span>
          )}
        </span>
        <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</span>
      </span>
    </button>
  );

  return (
    <ModalShell
      onClose={busy ? () => undefined : onClose}
      closeOnBackdrop={false}
      label={t('sync.join.title')}
      zClassName="z-[55]"
      panelClassName="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="🔗" title={t('sync.join.title')} onClose={onClose} />

      <div className="overflow-y-auto p-4 sm:p-5 space-y-3">
        {error ? (
          <p className="rounded-xl bg-red-50 dark:bg-red-950/30 px-3 py-2 text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : !summary ? (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">{t('sync.join.reading')}</p>
        ) : (
          <>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('sync.join.readOnly')}</p>

            {/* Kind by kind rather than one total each. The decision below applies to everything at
                once, so the honest thing is to show what "everything" is: 34 against 0 says nothing
                about *which* side holds the guests. */}
            <SideBySide cloud={summary.cloudByKind} local={summary.localByKind} totals={[summary.cloud, summary.local]} />

            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('sync.join.split', { onlyLocal: summary.onlyLocal, onlyCloud: summary.onlyCloud })}
              {summary.deviceEmpty && !cloudEmpty ? ` ${t('sync.join.deviceEmpty')}` : ''}
            </p>

            {cloudEmpty && (
              <p className="rounded-xl bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
                {t('sync.join.cloudEmpty')}
              </p>
            )}

            <div className="space-y-2 pt-1">
              <Choice
                value={MODES.MERGE}
                icon="🤝"
                title={t('sync.join.mergeTitle')}
                hint={t('sync.join.mergeHint', { count: summary.onlyLocal })}
              />
              <Choice
                value={MODES.TAKE}
                icon="⬇️"
                title={t('sync.join.takeTitle')}
                hint={t('sync.join.takeHint', { count: summary.onlyLocal })}
              />
              <Choice
                value={MODES.PUSH}
                icon="⬆️"
                danger={!cloudEmpty}
                title={t('sync.join.pushTitle')}
                hint={cloudEmpty ? t('sync.join.pushHintEmpty') : t('sync.join.pushHint', { count: summary.both })}
              />
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800">
        <button
          onClick={onClose}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
        >
          {t('sync.join.later')}
        </button>
        <button
          onClick={() => mode && summary && onChoose(mode, summary)}
          disabled={!mode || !summary || busy || Boolean(error)}
          className="px-3.5 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? t('sync.working') : t('sync.join.continue')}
        </button>
      </div>
    </ModalShell>
  );
}
