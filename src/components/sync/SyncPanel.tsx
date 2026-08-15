import { useEffect, useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import type { ConfirmOptions } from '../ConfirmModal';
import type { SyncState } from '../../hooks/useSync';
import { ProjectSetupModal } from './ProjectSetupModal';
import { JoinCloudModal } from './JoinCloudModal';
import {
  changeKey,
  checkKey,
  clearConfig,
  normalizeUrl,
  saveConfig,
  schemaState,
  signIn,
  signOut,
  signUp,
  type SchemaState,
} from '../../lib/sync/supabase';
import {
  MODES,
  connectSummary,
  deleteCloud,
  forgetDevice,
  readDevices,
  recentChanges,
  repairNow,
  resetWatermarks,
  type ChangeRow,
  type ConnectSummary,
  type DeviceRow,
  type SyncMode,
} from '../../lib/sync/sync';
import { SideBySide } from './SideBySide';
import { renameDevice, thisDevice } from '../../lib/sync/device';
import { keyErrorText, syncErrorText } from '../../lib/sync/messages';

/** ms epoch / ISO → "15/08/2026, 21:14", or a dash when it never happened. */
function whenText(value: string | number | null | undefined, lang: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(lang === 'sq' ? 'sq-AL' : 'en-GB');
}

/** "today 21:14", "yesterday 08:02", "3 days ago" — a device list is read for how recently, not when. */
function agoText(value: string | number | null | undefined, lang: string, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const locale = lang === 'sq' ? 'sq-AL' : 'en-GB';
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return t('sync.time.today', { time });
  if (days === 1) return t('sync.time.yesterday', { time });
  if (days < 7) return t('sync.time.daysAgo', { count: days });
  return date.toLocaleDateString(locale);
}

/** The project's subdomain, which is what people recognise — the full URL is mostly noise. */
function projectName(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * The address to hand Supabase as the Site URL, read from the browser rather than written down. The
 * app is served from a few places (the deployed site, a laptop during development, the installed
 * PWA), and the one that matters is whichever is being read right now.
 */
const siteUrl = typeof window === 'undefined' ? '' : window.location.origin;

const card = 'rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4';
const heading = 'text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3';
const field =
  'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';
const primaryBtn = 'px-3.5 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50';
const plainBtn =
  'px-3.5 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50';
const dangerBtn = 'px-3.5 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50';

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'bad'; children: React.ReactNode }) {
  const tones = {
    info: 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-200',
    warn: 'bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200',
    bad: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300',
  } as const;
  return <div className={`rounded-2xl px-3.5 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

/**
 * Everything about syncing with the user's own Supabase project.
 *
 * The app has no server, and this is the honest version of "your data on both devices": the user
 * brings a Supabase project they own, the events travel through *their* database, and nothing about
 * GuestSeat is in the path. What that costs is a setup with real steps in it, so the panel is
 * arranged as those steps and says at each one why it cannot do that part for them.
 */
export function SyncPanel({
  sync,
  askConfirm,
  onToast,
  onOpenGuide,
}: {
  sync: SyncState;
  askConfirm: (opts: ConfirmOptions) => void;
  onToast: (msg: string) => void;
  onOpenGuide: (section?: 'sync') => void;
}) {
  const { t, lang } = useLanguage();
  const { config, connected, busy, error, syncNow, clearError } = sync;

  const [form, setForm] = useState(() => ({
    url: config.url || '',
    anonKey: config.anonKey || '',
    email: config.email || '',
    password: '',
  }));
  const [working, setWorking] = useState<string | null>(null);
  const [sides, setSides] = useState<ConnectSummary | null>(null);
  const [schema, setSchema] = useState<SchemaState | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceRow[] | null>(null);
  const [changes, setChanges] = useState<ChangeRow[] | null>(null);
  const [trailOpen, setTrailOpen] = useState(false);
  const [device, setDevice] = useState(() => thisDevice());
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);

  const needsDecision = sync.needsDecision;
  const busyAll = busy || Boolean(working);

  const setField = (name: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [name]: value }));

  // What each side holds, kind by kind — the reading that answers "did it really go?" and, when it
  // did not, *which* part is short. Refreshed after every sync, since a sync is the only thing that
  // changes either side.
  useEffect(() => {
    if (!connected) {
      setSides(null);
      return undefined;
    }
    let cancelled = false;
    connectSummary()
      .then((next) => !cancelled && setSides(next))
      .catch(() => !cancelled && setSides(null));
    return () => {
      cancelled = true;
    };
  }, [connected, config.last]);

  const cloudRows = sides?.cloud ?? null;
  const localRows = sides?.local ?? null;

  // The devices this project has seen, the last rows written to it, and how far the project's own
  // schema has got. All three are read only on a connected device.
  useEffect(() => {
    if (!connected) {
      setDevices(null);
      setChanges(null);
      setSchema(null);
      return undefined;
    }
    let cancelled = false;
    readDevices()
      .then((list) => !cancelled && setDevices(list))
      .catch(() => !cancelled && setDevices([]));
    recentChanges(10)
      .then((list) => !cancelled && setChanges(list))
      .catch(() => !cancelled && setChanges([]));
    schemaState()
      .then((state) => !cancelled && setSchema(state))
      .catch(() => !cancelled && setSchema(null));
    return () => {
      cancelled = true;
    };
  }, [connected, config.last]);

  // The decision dialog opens by itself the first time a connected device lands here without having
  // made one — which is exactly the moment somebody has just typed their password and is looking at
  // the screen. Not reopened if dismissed: the card behind it stays, and nothing is pushed either
  // way until it is answered.
  const [decisionShown, setDecisionShown] = useState(false);
  useEffect(() => {
    if (!needsDecision || decisionShown || setupOpen) return;
    setDecisionShown(true);
    setJoinOpen(true);
  }, [needsDecision, decisionShown, setupOpen]);

  const connect = async (mode: 'signIn' | 'signUp') => {
    const url = normalizeUrl(form.url);
    if (!url) {
      onToast(t('sync.errors.badUrl'));
      return;
    }
    const key = checkKey(form.anonKey);
    if (!key.ok) {
      onToast(keyErrorText(key, t));
      return;
    }
    if (!form.email.trim() || !form.password) {
      onToast(t('sync.errors.needCredentials'));
      return;
    }

    setWorking(mode);
    clearError();
    try {
      if (mode === 'signUp') {
        const { needsConfirmation } = await signUp({ email: form.email, password: form.password, url, anonKey: key.key });
        if (needsConfirmation) {
          onToast(t('sync.connect.confirmEmail'));
          return;
        }
      } else {
        await signIn({ email: form.email, password: form.password, url, anonKey: key.key });
      }
      // A device that has just connected knows nothing about what is up there, so the first run takes
      // the whole cloud copy — and, until the dialog is answered, sends nothing at all.
      resetWatermarks();
      const result = await syncNow();
      setForm((prev) => ({ ...prev, password: '' }));
      if (result?.needsDecision) onToast(t('sync.connect.connectedUndecided', { count: result.pulled }));
      else if (result) onToast(t('sync.result', { pulled: result.pulled, pushed: result.pushed }));
    } catch (err) {
      onToast(syncErrorText(err, t));
    } finally {
      setWorking(null);
    }
  };

  const run = async (label: string, job: () => Promise<string>) => {
    setWorking(label);
    try {
      onToast(await job());
    } catch (err) {
      onToast(syncErrorText(err, t));
    } finally {
      setWorking(null);
    }
  };

  /**
   * The three directions, each behind the confirmation its consequences deserve.
   *
   * Merge loses nothing, so it runs on the press. The other two destroy one side or the other, and
   * both ask for a word to be typed — a stray tap can dismiss a dialog, it cannot type "TAKE".
   */
  const chooseMode = (mode: SyncMode, summary?: ConnectSummary) => {
    const go = () =>
      run(mode, async () => {
        const result = await syncNow({ mode });
        setJoinOpen(false);
        return result ? t('sync.result', { pulled: result.pulled, pushed: result.pushed }) : t('sync.failed');
      });

    // What each direction would actually destroy, counted rather than assumed. `summary` comes from
    // the join dialog, which has just read both sides; the panel's own buttons fall back to the
    // counts it keeps, and an unknown count is treated as "something", never as "nothing".
    const losesLocal = summary ? summary.onlyLocal : (localRows ?? 1);
    const overwritesCloud = summary ? summary.cloud : (cloudRows ?? 1);

    if (mode === MODES.TAKE && losesLocal > 0) {
      askConfirm({
        title: t('sync.modes.takeTitle'),
        message: t('sync.modes.takeConfirm'),
        confirmLabel: t('sync.modes.takeConfirmLabel'),
        danger: true,
        requireText: t('sync.modes.takeWord'),
        onConfirm: go,
      });
      return;
    }
    if (mode === MODES.PUSH && overwritesCloud > 0) {
      askConfirm({
        title: t('sync.modes.pushTitle'),
        message: t('sync.modes.pushConfirm', { rows: overwritesCloud }),
        confirmLabel: t('sync.modes.pushConfirmLabel'),
        danger: true,
        requireText: t('sync.modes.pushWord'),
        onConfirm: go,
      });
      return;
    }
    // Nothing to lose on either side — the commonest case by far, a second device joining a copy —
    // so it is one tap. A word typed to protect nothing only teaches people to type it.
    go();
  };

  const disconnect = () =>
    askConfirm({
      title: t('sync.disconnect'),
      message: t('sync.disconnectConfirm'),
      confirmLabel: t('sync.disconnect'),
      onConfirm: () => {
        void signOut().then(() => {
          clearConfig();
          onToast(t('sync.disconnected'));
        });
      },
    });

  const wipeCloud = () =>
    askConfirm({
      title: t('sync.danger.title'),
      message: t('sync.danger.confirm', { rows: cloudRows ?? '…' }),
      confirmLabel: t('sync.danger.confirmLabel'),
      danger: true,
      confirmAgain: { message: t('sync.danger.confirmFinal') },
      requireText: t('sync.danger.word'),
      onConfirm: () => {
        void run('wipe', async () => {
          await deleteCloud();
          setSides((prev) => (prev ? { ...prev, cloud: 0, cloudByKind: {}, both: 0, onlyCloud: 0 } : prev));
          return t('sync.danger.done');
        });
      },
    });

  const saveDeviceName = (name: string) => {
    setDevice(renameDevice(name));
    setNameDraft(null);
    // Written into the project on the next sync, which is also what refreshes the list below.
    void syncNow();
  };

  const missingRows = cloudRows !== null && localRows !== null && cloudRows < localRows ? localRows - cloudRows : 0;

  return (
    <div className="space-y-3">
      {setupOpen && (
        <ProjectSetupModal
          url={config.url || normalizeUrl(form.url)}
          from={schema?.version ?? 0}
          onClose={() => setSetupOpen(false)}
          onReady={() => {
            clearError();
            schemaState()
              .then(setSchema)
              .catch(() => undefined);
            void syncNow();
          }}
        />
      )}

      {joinOpen && <JoinCloudModal busy={busyAll} onChoose={chooseMode} onClose={() => setJoinOpen(false)} />}

      {error && (
        <Note tone="bad">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <span>{t(`sync.errors.${error.code}`) === `sync.errors.${error.code}` ? error.message : t(`sync.errors.${error.code}`)}</span>
            {error.code === 'table' && (
              <button onClick={() => setSetupOpen(true)} className={plainBtn}>
                {t('sync.setup.open')}
              </button>
            )}
          </div>
        </Note>
      )}

      {/* Connected, and holding everything back until somebody says which side is right. The card
          stays for as long as that is true — the dialog can be dismissed, the question cannot. */}
      {needsDecision && (
        <Note>
          <p className="mb-2">{t('sync.decisionBanner')}</p>
          <button onClick={() => setJoinOpen(true)} className={plainBtn} disabled={busyAll}>
            {t('sync.decisionAction')}
          </button>
        </Note>
      )}

      {connected && schema?.update && !schema.missing && (
        <Note tone="warn">
          <p className="mb-2">{t('sync.schemaOutdated', { version: schema.version, latest: schema.latest })}</p>
          <button onClick={() => setSetupOpen(true)} className={plainBtn}>
            {t('sync.updateProject')}
          </button>
        </Note>
      )}

      {connected && config.serverClock === false && (
        <Note tone="warn">
          <p className="mb-2">{t('sync.noServerClock')}</p>
          <button onClick={() => setSetupOpen(true)} className={plainBtn}>
            {t('sync.setup.open')}
          </button>
        </Note>
      )}

      {!connected ? (
        <>
          {config.url && <Note tone="warn">{t('sync.sessionGone')}</Note>}

          <section className={card}>
            <h3 className={heading}>{t('sync.connect.step1')}</h3>
            <ol className="list-decimal ps-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
              <li>{t('sync.connect.step1a')}</li>
              <li>
                {t('sync.connect.step1b')}
                <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                  <code className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs break-all">
                    {siteUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard
                        ?.writeText(siteUrl)
                        .then(() => onToast(t('sync.connect.siteUrlCopied')))
                        .catch(() => undefined);
                    }}
                    className={plainBtn}
                  >
                    {t('common.copy')}
                  </button>
                </div>
              </li>
              <li>{t('sync.connect.step1c')}</li>
              <li>{t('sync.connect.step1d')}</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setSetupOpen(true)} className={primaryBtn}>
                {t('sync.setup.open')}
              </button>
              <button onClick={() => onOpenGuide('sync')} className={plainBtn}>
                📖 {t('guide.readMore')}
              </button>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className={plainBtn}>
                {t('sync.connect.openDashboard')} ↗
              </a>
            </div>
          </section>

          <section className={card}>
            <h3 className={heading}>{t('sync.connect.step2')}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t('sync.connect.step2Body')}</p>
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void connect('signIn');
              }}
            >
              <input
                value={form.url}
                onChange={(e) => setField('url', e.target.value)}
                placeholder="https://abcdefgh.supabase.co"
                aria-label={t('sync.connect.projectUrl')}
                autoComplete="off"
                spellCheck={false}
                className={field}
              />
              <input
                value={form.anonKey}
                onChange={(e) => setField('anonKey', e.target.value)}
                placeholder={t('sync.connect.keyPlaceholder')}
                aria-label={t('sync.connect.publicKey')}
                autoComplete="off"
                spellCheck={false}
                className={field}
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setField('email', e.target.value)}
                placeholder={t('sync.connect.emailPlaceholder')}
                aria-label={t('sync.connect.email')}
                autoComplete="username"
                className={field}
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setField('password', e.target.value)}
                placeholder={t('sync.connect.passwordPlaceholder')}
                aria-label={t('sync.connect.password')}
                autoComplete="current-password"
                className={field}
              />
              <p className="text-xs text-slate-500 dark:text-slate-400">{t('sync.connect.keyHint')}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button type="submit" className={primaryBtn} disabled={busyAll}>
                  {working === 'signIn' ? t('sync.working') : t('sync.connect.signIn')}
                </button>
                <button type="button" onClick={() => void connect('signUp')} className={plainBtn} disabled={busyAll}>
                  {working === 'signUp' ? t('sync.working') : t('sync.connect.signUp')}
                </button>
              </div>
            </form>
          </section>
        </>
      ) : (
        <>
          <section className={card}>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t('sync.connectedTitle')}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {projectName(config.url)} · {config.email}
                </p>
              </div>
              <div className="text-end">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">{t('sync.lastSync')}</div>
                <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {whenText(config.last?.at, lang)}
                </div>
              </div>
            </div>

            {config.last?.error ? (
              <Note tone="warn">{t('sync.lastFailed', { error: config.last.error })}</Note>
            ) : (
              config.last && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {t('sync.lastSummary', {
                    pulled: config.last.pulled,
                    pushed: config.last.pushed,
                    cloud: cloudRows === null ? '…' : cloudRows,
                    local: localRows === null ? '…' : localRows,
                  })}
                </p>
              )
            )}

            {/* The cloud may hold more than this device (tombstones swept here, rows another device
                deleted), never less — so this way round it is always something to act on. */}
            {!needsDecision && missingRows > 0 && (
              <div className="mt-3">
                <Note tone="warn">
                  <p className="mb-2">{t('sync.missingRows', { count: missingRows })}</p>
                  <button
                    className={plainBtn}
                    disabled={busyAll}
                    onClick={() =>
                      void run('repair', async () => {
                        const found = await repairNow();
                        // Sent afterwards either way: finding nothing to re-flag does not mean there
                        // is nothing to send, and stopping here would answer "the project is missing
                        // 3 events" with "there was nothing to repair".
                        const result = await syncNow();
                        return t('sync.repaired', { found, pushed: result?.pushed ?? 0 });
                      })
                    }
                  >
                    {working === 'repair' ? t('sync.working') : t('sync.repair')}
                  </button>
                </Note>
              </div>
            )}

            <label className="mt-3 flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sync.auto}
                onChange={(e) => saveConfig({ auto: e.target.checked })}
                className="mt-0.5 w-4 h-4 accent-indigo-600"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">{t('sync.autoLabel')}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">{t('sync.autoDesc')}</span>
              </span>
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className={primaryBtn}
                disabled={busyAll}
                onClick={() =>
                  void run('sync', async () => {
                    const result = await syncNow();
                    return result ? t('sync.result', { pulled: result.pulled, pushed: result.pushed }) : t('sync.failed');
                  })
                }
              >
                {busy ? t('sync.working') : t('sync.syncNow')}
              </button>
              <button className={plainBtn} disabled={busyAll} onClick={disconnect}>
                {t('sync.disconnect')}
              </button>
            </div>

            <div className="mt-4">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t('sync.modes.intro')}</p>
              <div className="flex flex-wrap gap-2">
                <button className={plainBtn} disabled={busyAll} onClick={() => chooseMode(MODES.MERGE)}>
                  {t('sync.modes.merge')}
                </button>
                <button className={plainBtn} disabled={busyAll} onClick={() => chooseMode(MODES.TAKE)}>
                  {t('sync.modes.take')}
                </button>
                <button className={plainBtn} disabled={busyAll} onClick={() => chooseMode(MODES.PUSH)}>
                  {t('sync.modes.push')}
                </button>
              </div>
            </div>

            {newKey === null ? (
              <button
                onClick={() => setNewKey(config.anonKey || '')}
                className="mt-3 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {t('sync.changeKey')}
              </button>
            ) : (
              <form
                className="mt-3 space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run('key', async () => {
                    await changeKey(newKey);
                    setNewKey(null);
                    return t('sync.keyChanged');
                  });
                }}
              >
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  autoFocus
                  autoComplete="off"
                  spellCheck={false}
                  aria-label={t('sync.newKey')}
                  className={field}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">{t('sync.changeKeyHint')}</p>
                <div className="flex gap-2">
                  <button type="submit" className={primaryBtn} disabled={busyAll}>
                    {working === 'key' ? t('sync.working') : t('sync.saveKey')}
                  </button>
                  <button type="button" className={plainBtn} onClick={() => setNewKey(null)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* What is actually stored, on each side, kind by kind. "34 rows from 34 records" answers
              whether sync is working and nothing else; when a kind *is* short, this is the only view
              that says which one. */}
          <section className={card}>
            <h3 className={heading}>{t('sync.stored.title')}</h3>
            {sides === null ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('sync.stored.counting')}</p>
            ) : (
              <>
                <SideBySide cloud={sides.cloudByKind} local={sides.localByKind} totals={[sides.cloud, sides.local]} />
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  {t('sync.stored.split', { both: sides.both, onlyLocal: sides.onlyLocal, onlyCloud: sides.onlyCloud })}
                </p>
              </>
            )}
          </section>

          {/* Who wrote what. One account is signed in on every device, so without this the project
              cannot answer the only question that matters after a sync does something unexpected. */}
          <section className={card}>
            <h3 className={heading}>{t('sync.devices.title')}</h3>

            {nameDraft === null ? (
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                {t('sync.devices.thisIs')} <strong>{device.name}</strong>{' '}
                <button
                  onClick={() => setNameDraft(device.name)}
                  className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {t('sync.devices.rename')}
                </button>
              </p>
            ) : (
              <form
                className="flex gap-2 mb-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveDeviceName(nameDraft);
                }}
              >
                <input
                  autoFocus
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={40}
                  aria-label={t('sync.devices.rename')}
                  className={field}
                />
                <button type="submit" className={primaryBtn}>
                  {t('common.save')}
                </button>
              </form>
            )}

            {devices === null ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('sync.devices.reading')}</p>
            ) : devices.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">{t('sync.devices.none')}</p>
            ) : (
              <ul className="space-y-2">
                {devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {d.name || t('sync.devices.unnamed')}
                        {d.self && <span className="ms-2 text-[11px] text-slate-400">{t('sync.devices.thisOne')}</span>}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {t('sync.devices.line', {
                          when: agoText(d.lastSync, lang, t),
                          records: d.records,
                          pushed: d.pushed,
                        })}
                      </div>
                    </div>
                    {!d.self && (
                      <button
                        onClick={() =>
                          askConfirm({
                            title: t('sync.devices.forgetTitle'),
                            message: t('sync.devices.forgetConfirm', { name: d.name || t('sync.devices.unnamed') }),
                            confirmLabel: t('sync.devices.forget'),
                            onConfirm: () => {
                              void forgetDevice(d.id)
                                .then(() => setDevices((list) => (list ?? []).filter((x) => x.id !== d.id)))
                                .catch((err) => onToast(syncErrorText(err, t)));
                            },
                          })
                        }
                        aria-label={t('sync.devices.forget')}
                        className="shrink-0 w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              onClick={() => setTrailOpen((open) => !open)}
              className="mt-3 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              {trailOpen ? t('sync.trail.hide') : t('sync.trail.show')}
            </button>

            {trailOpen && (
              <ul className="mt-2 space-y-1 text-xs text-slate-500 dark:text-slate-400">
                {changes === null ? (
                  <li>{t('sync.trail.reading')}</li>
                ) : changes.length === 0 ? (
                  <li>{t('sync.trail.none')}</li>
                ) : (
                  changes.map((c) => (
                    <li key={`${c.key}:${c.at}`}>
                      {agoText(c.at, lang, t)} ·{' '}
                      {c.deleted ? t('sync.trail.deleted') : t('sync.trail.written')} ·{' '}
                      {c.device ? (
                        <strong>
                          {c.device}
                          {c.self ? ` ${t('sync.devices.thisOne')}` : ''}
                        </strong>
                      ) : (
                        <em>{t('sync.trail.noDevice')}</em>
                      )}
                    </li>
                  ))
                )}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-red-200 dark:border-red-900/60 bg-red-50/50 dark:bg-red-950/20 p-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-2">
              {t('sync.danger.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t('sync.danger.desc')}</p>
            <button className={dangerBtn} disabled={busyAll} onClick={wipeCloud}>
              {working === 'wipe' ? t('sync.working') : t('sync.danger.button')}
            </button>
          </section>
        </>
      )}

      <section className={card}>
        <h3 className={heading}>{t('sync.safety.title')}</h3>
        <ul className="list-disc ps-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li>{t('sync.safety.publicKey')}</li>
          <li>{t('sync.safety.secretKey')}</li>
          <li>{t('sync.safety.storedHere')}</li>
          <li>{t('sync.safety.ownProject')}</li>
          <li>{t('sync.safety.lastWins')}</li>
          <li>{t('sync.safety.newDevice')}</li>
          <li>{t('sync.safety.deviceTrail')}</li>
        </ul>
      </section>
    </div>
  );
}
