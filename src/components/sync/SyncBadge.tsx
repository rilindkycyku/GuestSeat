import { useLanguage } from '../../hooks/useLanguage';
import type { SyncState } from '../../hooks/useSync';

/**
 * The state of sync, in one icon in the header.
 *
 * Sync is meant to be forgotten about, which is exactly what makes a broken one dangerous: a phone
 * whose session expired, or one that has been on a venue's captive-portal wifi all afternoon, goes
 * on looking perfectly normal while everything typed into it stays on that phone. Nothing said so
 * until the user happened to open the sync panel — and nobody opens a panel about a thing they
 * believe is working.
 *
 * So it earns attention in proportion: nothing at all when sync is not set up, a quiet cloud when
 * all is well, a spinner while it runs, and a mark that stays put when the last attempt failed or
 * when changes are waiting with no way out. Tapping it opens the panel that explains.
 */
export function SyncBadge({ sync, onOpen, className = '' }: { sync: SyncState; onOpen: () => void; className?: string }) {
  const { t } = useLanguage();

  // Shown for a device that has a project set up, even when the session is gone: losing the session
  // is the loudest thing that can happen here, not a reason to fall silent.
  if (!sync.configured) return null;

  const failed = !sync.connected || Boolean(sync.error || sync.config.last?.error);
  const state = sync.busy
    ? 'busy'
    : failed
      ? 'failed'
      : sync.needsDecision
        ? 'undecided'
        : sync.unsent
          ? 'waiting'
          : 'ok';

  const icon = { busy: '🔄', failed: '⚠️', undecided: '⚠️', waiting: sync.online ? '☁️' : '📴', ok: '☁️' }[state];
  const title = {
    busy: t('sync.badge.busy'),
    failed: sync.connected ? t('sync.badge.failed') : t('sync.badge.sessionGone'),
    undecided: t('sync.badge.undecided'),
    waiting: sync.online ? t('sync.badge.waiting') : t('sync.badge.offline'),
    ok: t('sync.badge.ok'),
  }[state];
  const tone = {
    busy: 'text-indigo-500',
    failed: 'text-amber-500',
    undecided: 'text-amber-500',
    waiting: 'text-slate-400',
    ok: 'text-emerald-500',
  }[state];

  return (
    <button
      onClick={onOpen}
      title={title}
      aria-label={title}
      className={`relative w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center ${className}`}
    >
      <span className={`text-sm ${sync.busy ? 'motion-safe:animate-spin' : ''}`} aria-hidden>
        {icon}
      </span>
      {(state === 'failed' || state === 'undecided') && (
        <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-current ${tone}`} />
      )}
    </button>
  );
}
