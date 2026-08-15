import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import type { ConfirmOptions } from './ConfirmModal';
import type { SyncState } from '../hooks/useSync';
import { SyncPanel } from './sync/SyncPanel';
import { BackupError, exportBackup, importBackup, readBackupFile } from '../lib/backup';
import type { EventSummary } from '../lib/db';

export type DataTab = 'backup' | 'sync';

/**
 * "Where does this guest list exist besides this browser?", asked twice.
 *
 * A file you keep, and a cloud copy that keeps itself — they are the same question, which is why
 * they share a dialog rather than sitting in two places in Settings. Syncing is, after all, an
 * export and an import that happen by themselves.
 */
export function DataModal({
  events,
  sync,
  initialTab = 'backup',
  askConfirm,
  onToast,
  onImported,
  onClose,
}: {
  events: EventSummary[];
  sync: SyncState;
  initialTab?: DataTab;
  askConfirm: (opts: ConfirmOptions) => void;
  onToast: (msg: string) => void;
  /** Re-read what is on disk — an import rewrites events behind the app's back. */
  onImported: () => void | Promise<void>;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<DataTab>(initialTab);
  const [busy, setBusy] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const modeRef = useRef<'replace' | 'merge'>('replace');

  const guests = events.reduce((sum, ev) => sum + ev.guestCount, 0);
  const tables = events.reduce((sum, ev) => sum + ev.tableCount, 0);

  // Browsers throw a site's data away when the device runs short of space, and Safari clears a site
  // not visited for seven browsing days — guest lists included, not just preferences. Persistent
  // storage exempts the app from that, and it is worth asking for on the one screen about keeping
  // data.
  useEffect(() => {
    navigator.storage
      ?.persisted?.()
      .then(setPersisted)
      .catch(() => undefined);
  }, []);

  const askPersist = async () => {
    const granted = await navigator.storage?.persist?.().catch(() => false);
    setPersisted(Boolean(granted));
    onToast(granted ? t('backup.storage.granted') : t('backup.storage.refused'));
  };

  const doExport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const count = await exportBackup();
      onToast(t('backup.exported', { count }));
    } catch {
      onToast(t('backup.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const pickFile = (mode: 'replace' | 'merge') => {
    modeRef.current = mode;
    fileRef.current?.click();
  };

  const handleFile = async (file: File) => {
    let backup;
    try {
      backup = await readBackupFile(file, t('header.defaultEventName'));
    } catch (err) {
      if (err instanceof BackupError) {
        onToast(err.code === 'otherApp' ? t('backup.errors.otherApp', { app: err.app ?? '' }) : t(`backup.errors.${err.code}`));
      } else {
        onToast(t('backup.errors.notJson'));
      }
      return;
    }

    const mode = modeRef.current;
    askConfirm({
      title: mode === 'merge' ? t('backup.mergeTitle') : t('backup.replaceTitle'),
      message:
        mode === 'merge'
          ? t('backup.mergeConfirm', { count: backup.events.length })
          : t('backup.replaceConfirm', { count: backup.events.length, existing: events.length }),
      confirmLabel: mode === 'merge' ? t('backup.merge') : t('backup.replace'),
      danger: mode === 'replace',
      ...(mode === 'replace' && events.length > 0
        ? { confirmAgain: { message: t('backup.replaceConfirmFinal', { existing: events.length }) } }
        : {}),
      onConfirm: () => {
        void (async () => {
          setBusy(true);
          try {
            const summary = await importBackup(backup, { mode });
            await onImported();
            onToast(
              mode === 'merge'
                ? t('backup.merged', { added: summary.added, existing: summary.existing })
                : t('backup.restored', { added: summary.added })
            );
          } catch {
            onToast(t('backup.importFailed'));
          } finally {
            setBusy(false);
          }
        })();
      },
    });
  };

  const card = 'rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4';
  const primaryBtn = 'px-3.5 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50';
  const plainBtn =
    'px-3.5 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50';

  return (
    <ModalShell
      onClose={onClose}
      label={t('backup.title')}
      panelClassName="w-full sm:max-w-2xl bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="🗄️" title={t('backup.title')} onClose={onClose} />

      <div className="px-4 sm:px-5 pt-3">
        <div className="grid grid-flow-col auto-cols-fr rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1">
          {(['backup', 'sync'] as DataTab[]).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === key
                  ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              }`}
            >
              {key === 'backup' ? `💾 ${t('backup.tab')}` : `☁️ ${t('sync.tab')}`}
              {key === 'sync' && sync.configured && (
                <span
                  className={`ms-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle ${
                    sync.connected && !sync.error ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-y-auto p-4 sm:p-5 space-y-3">
        {tab === 'backup' ? (
          <>
            <section className={card}>
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{t('backup.fileTitle')}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t('backup.fileDesc')}</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void doExport()} className={primaryBtn} disabled={busy || events.length === 0}>
                  {t('backup.export')}
                </button>
                <button onClick={() => pickFile('replace')} className={plainBtn} disabled={busy}>
                  {t('backup.importReplace')}
                </button>
                <button onClick={() => pickFile('merge')} className={plainBtn} disabled={busy}>
                  {t('backup.importMerge')}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void handleFile(file);
                  }}
                />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{t('backup.modesHint')}</p>
            </section>

            <section className={card}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                {t('backup.storedTitle')}
              </h3>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  [events.length, t('backup.eventsLabel')],
                  [guests, t('backup.guestsLabel')],
                  [tables, t('backup.tablesLabel')],
                ].map(([value, label]) => (
                  <div key={String(label)} className="rounded-2xl bg-white dark:bg-slate-900 p-3">
                    <div className="text-xl font-bold text-slate-800 dark:text-white">{value}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">{t('backup.storedNote')}</p>
            </section>

            <section className={card}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {t('backup.storage.title')}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                {t('backup.storage.desc')}
                {persisted === true && <strong> {t('backup.storage.on')}</strong>}
              </p>
              <button onClick={() => void askPersist()} className={persisted ? plainBtn : primaryBtn}>
                {persisted ? t('backup.storage.recheck') : t('backup.storage.request')}
              </button>
            </section>
          </>
        ) : (
          <SyncPanel sync={sync} askConfirm={askConfirm} onToast={onToast} />
        )}
      </div>
    </ModalShell>
  );
}
