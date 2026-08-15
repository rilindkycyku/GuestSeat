import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onLocalChange } from '../lib/db';
import {
  adoptSessionFromLink,
  isConfigured,
  isConnected,
  onConfig,
  readConfig,
  SyncError,
  type SyncConfig,
  type SyncErrorCode,
} from '../lib/sync/supabase';
import { hasUnsent, sync, type SyncMode, type SyncResult } from '../lib/sync/sync';

/** A change is almost never alone — auto-seating writes every guest at once, and a drag writes the
 * event on every drop. Waiting a few seconds turns a burst into one sync instead of one per write. */
const AFTER_CHANGE = 4000;

/** Coming back to the tab syncs, but not if one has just run: switching between two windows would
 * otherwise fire a request every time the mouse crosses the screen. */
const FRESH_FOR = 60_000;

/** How often an open, visible app checks by itself. The other triggers are all events — a save, a
 * tab switch, coming back online — and none of them fires on the laptop left open on the seating
 * board while the phone is the one being used at the venue. */
const INTERVAL = 10 * 60_000;

export interface SyncState {
  config: SyncConfig;
  /** A project, a key and a session that still works. */
  connected: boolean;
  /** A project was set up here, whether or not the session still works. */
  configured: boolean;
  auto: boolean;
  busy: boolean;
  error: { message: string; code: SyncErrorCode } | null;
  /** Something has been written here since the last successful sync. */
  unsent: boolean;
  online: boolean;
  /** Connected, but the user has not yet said what should happen to the cloud copy. Read-only until
   * they do. */
  needsDecision: boolean;
  syncNow: (options?: { full?: boolean; mode?: SyncMode | null }) => Promise<SyncResult | null>;
  clearError: () => void;
}

/**
 * Runs the sync in the background and holds its state for the UI.
 *
 * A seating plan is edited in bursts — an hour on the laptop, then five minutes on a phone at the
 * venue — so this syncs when the app opens, a few seconds after any change is saved, when the tab is
 * looked at again, when the device comes back online, and every ten minutes while it is visible.
 * Each of those is a moment where the other device may have moved on; between them nothing happens,
 * because there is nothing to notice.
 *
 * The switch that turns all of it off is in the sync panel. With it off nothing leaves the browser
 * except when the user presses "Sync now".
 *
 * `onApplied` is called after a sync that actually brought something down, so whatever is on screen
 * is re-read from the database rather than going on showing the version it downloaded over.
 */
export function useSync({ ready, onApplied }: { ready: boolean; onApplied: () => void | Promise<void> }): SyncState {
  const [config, setConfig] = useState<SyncConfig>(() => readConfig());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SyncState['error']>(null);
  // Tracked from the write events rather than by counting flagged records, because the nav-bar
  // indicator reads this on every render and a database scan per render is not a price worth paying
  // for an icon.
  const [unsent, setUnsent] = useState(false);
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const lastRun = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  // Kept in a ref so the sync callback keeps a stable identity: it is a dependency of every effect
  // below, and a new one per render would re-arm all of them on every keystroke.
  const appliedRef = useRef(onApplied);
  appliedRef.current = onApplied;

  useEffect(() => {
    const off = onConfig(setConfig);
    // A session arriving in the URL — the link from the confirmation email, when the project's Site
    // URL points here. Taken before anything else runs, and the fragment wiped immediately
    // afterwards so the token does not stay in the address bar or in the back-button history.
    if (adoptSessionFromLink()) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    return off;
  }, []);

  const connected = isConnected(config);
  const configured = isConfigured(config);
  const auto = connected && config.auto !== false;
  const needsDecision = connected && config.decided === false;

  /**
   * The one place a sync is started from. Everything it can throw is caught and shown as state: an
   * automatic sync failing because a venue's wifi is behind a captive portal must not take the app
   * down, and the board in front of the user is complete with or without it.
   */
  const syncNow = useCallback(async (options: { full?: boolean; mode?: SyncMode | null } = {}) => {
    if (!isConnected()) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await sync(options);
      lastRun.current = Date.now();
      // Everything this device was holding has been accepted; anything written from here on sets the
      // flag again through the listener below.
      setUnsent(false);
      // Only when something actually came down — or when the user chose a direction, since "take the
      // cloud copy" can take events *away* and a screen still showing them would be the one moment
      // the app lies about what it holds.
      if (result?.changed || result?.mode) await appliedRef.current();
      return result;
    } catch (err) {
      setError({
        message: (err as Error)?.message || 'Sync failed.',
        code: err instanceof SyncError ? err.code : 'server',
      });
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  // At startup, once the events themselves are on screen. Syncing before that would race the first
  // read and, on a slow phone, delay the only thing the user is waiting for.
  useEffect(() => {
    if (!ready || !auto || !navigator.onLine) return;
    void syncNow();
    // Deliberately only on the transition into "ready": the rest of the triggers are below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, auto]);

  // What was still unsent when the app was last closed. Without this the indicator would start every
  // session claiming the device is in step, however much is actually queued.
  useEffect(() => {
    if (!ready || !connected) return;
    hasUnsent()
      .then((yes) => yes && setUnsent(true))
      .catch(() => undefined);
  }, [ready, connected]);

  // A few seconds after the last write — and, whether or not automatic sync is on, the fact that
  // there is now something to send.
  useEffect(() => {
    if (!connected) return undefined;
    const off = onLocalChange(() => {
      setUnsent(true);
      if (!auto) return;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (navigator.onLine) void syncNow();
      }, AFTER_CHANGE);
    });
    return () => {
      off();
      window.clearTimeout(timer.current);
    };
  }, [connected, auto, syncNow]);

  // Whether the device can reach anything at all — the indicator says "waiting" rather than "failed"
  // when the answer is no, which is the difference between a bug and a basement venue.
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Back on this tab, or back online.
  useEffect(() => {
    if (!auto) return undefined;
    const attempt = () => {
      if (!navigator.onLine) return;
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastRun.current < FRESH_FOR) return;
      void syncNow();
    };
    document.addEventListener('visibilitychange', attempt);
    window.addEventListener('online', attempt);
    // Same guard, on a timer: a hidden tab does nothing, and a visible one that synced a minute ago
    // does nothing either.
    const tick = window.setInterval(attempt, INTERVAL);
    return () => {
      document.removeEventListener('visibilitychange', attempt);
      window.removeEventListener('online', attempt);
      window.clearInterval(tick);
    };
  }, [auto, syncNow]);

  const clearError = useCallback(() => setError(null), []);

  return useMemo(
    () => ({ config, connected, configured, auto, busy, error, unsent, online, needsDecision, syncNow, clearError }),
    [config, connected, configured, auto, busy, error, unsent, online, needsDecision, syncNow, clearError]
  );
}
