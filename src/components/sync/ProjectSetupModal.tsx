import { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { ModalHeader } from '../ModalHeader';
import { ModalShell } from '../ModalShell';
import { SQL_INSTALL, projectRef, sqlEditorLink, verifySchema } from '../../lib/sync/supabase';
import { pendingMigrations, sqlForMigration } from '../../lib/sync/schema';
import { syncErrorText } from '../../lib/sync/messages';
import { SyncError } from '../../lib/sync/supabase';

/**
 * Setting the project up, in a dialog.
 *
 * One route, because there is only one that works. The key this device holds reaches PostgREST, and
 * PostgREST serves rows — it cannot create a table, and no setting on the project makes it able to.
 * That is protection, not a gap: it is also what stops a stolen copy of this browser's storage from
 * rewriting the database.
 *
 * So: **Open SQL editor** opens the user's own editor with the script already in the query box, and
 * the whole setup is a tap and then Run. Coming back, **Check the project** asks the database what
 * it now has, rather than taking anyone's word for it.
 */
export function ProjectSetupModal({
  url,
  from = 0,
  onReady,
  onClose,
}: {
  url: string;
  /** Which migration the project has already reached, so a part-way project is shown only the rest. */
  from?: number;
  onReady: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const pending = pendingMigrations(from);
  const script = from > 0 && pending.length > 0 ? sqlForMigration(from) : SQL_INSTALL;
  const ref = projectRef(url);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(script);
      setCopyFailed(false);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard refused (an insecure context, or permission denied). The text is right there to be
      // selected by hand, which is worth saying rather than leaving a button that did nothing.
      setCopyFailed(true);
    }
  };

  const check = async () => {
    if (checking) return;
    setChecking(true);
    setResult(null);
    try {
      await verifySchema(from);
      setResult({ ok: true, text: from > 0 ? t('sync.setup.updated') : t('sync.setup.ready') });
      // The reason anyone opened this dialog is that syncing was failing, so the last step is not to
      // announce success and wait to be pressed again — it is to go and sync.
      onReady();
    } catch (err) {
      // Not being connected is not a failed setup: the check runs as the signed-in user, and on a
      // first-time device that account does not exist yet. The script may well have run fine.
      const noSession = err instanceof SyncError && (err.code === 'session' || err.code === 'notConfigured');
      setResult({ ok: false, text: noSession ? t('sync.setup.needAccount') : syncErrorText(err, t) });
    } finally {
      setChecking(false);
    }
  };

  const buttonBase = 'px-3.5 py-2 rounded-xl text-sm font-medium transition-colors';
  const secondary = `${buttonBase} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700`;

  return (
    <ModalShell
      onClose={onClose}
      label={t('sync.setup.title')}
      zClassName="z-[55]"
      panelClassName="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="🛠️" title={t('sync.setup.title')} onClose={onClose} />

      <div className="overflow-y-auto p-4 sm:p-5 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('sync.setup.intro')}</p>

        {pending.length > 0 && (
          <ul className="list-disc ps-5 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            {pending.map((m) => (
              <li key={m.version}>{m.name}</li>
            ))}
          </ul>
        )}

        {!ref && <p className="text-xs text-amber-600 dark:text-amber-400">{t('sync.setup.noRef')}</p>}

        <div className="flex justify-end">
          <button onClick={copy} className={secondary}>
            {copied ? `✓ ${t('sync.setup.copied')}` : t('sync.setup.copy')}
          </button>
        </div>

        <pre className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre">
          {script}
        </pre>

        {copyFailed && <p className="text-xs text-slate-500 dark:text-slate-400">{t('sync.setup.copyFailed')}</p>}

        <p className="text-xs text-slate-500 dark:text-slate-400">{t('sync.setup.thenCheck')}</p>

        {result && (
          <p
            className={`rounded-xl px-3 py-2 text-sm ${
              result.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                : 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300'
            }`}
          >
            {result.text}
          </p>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 px-4 sm:px-5 py-3 border-t border-slate-100 dark:border-slate-800">
        <button onClick={onClose} className={secondary}>
          {t('common.close')}
        </button>
        <a href={sqlEditorLink(url, script)} target="_blank" rel="noreferrer" className={secondary}>
          {t('sync.setup.openEditor')} ↗
        </a>
        <button
          onClick={check}
          disabled={checking}
          className={`${buttonBase} bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50`}
        >
          {checking ? t('sync.setup.checking') : t('sync.setup.check')}
        </button>
      </div>
    </ModalShell>
  );
}
