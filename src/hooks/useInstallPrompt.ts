import { useEffect, useState } from 'react';

// The `beforeinstallprompt` event isn't part of the standard DOM lib types yet.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Whether the app is already running as an installed PWA (a home-screen shortcut). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes standalone on navigator rather than via matchMedia.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** True on iOS/iPadOS, where installing is a manual Share → "Add to Home Screen" flow. */
function isIos(): boolean {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as a Mac; a touch-capable "Mac" is really an iPad.
    (/macintosh/i.test(ua) && 'ontouchend' in document)
  );
}

/**
 * How the app can be added to the home screen right now:
 * - `available`  – Chrome/Edge fired `beforeinstallprompt`; we can show the native prompt.
 * - `ios`        – Safari on iOS/iPadOS; install is manual, so we surface instructions instead.
 * - `installed`  – already running as an installed PWA; nothing to offer.
 * - `unsupported`– a browser/platform with no install path (e.g. desktop Firefox).
 */
export type InstallState = 'available' | 'ios' | 'installed' | 'unsupported';

/**
 * Tracks whether the PWA can be installed as a home-screen shortcut and, when the browser
 * supports it, lets the caller trigger the native install prompt on demand (e.g. from a menu).
 */
export function useInstallPrompt(): {
  state: InstallState;
  promptInstall: () => Promise<'accepted' | 'dismissed' | null>;
} {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar; we drive the prompt from the Export menu instead.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const state: InstallState = installed
    ? 'installed'
    : deferred
      ? 'available'
      : isIos()
        ? 'ios'
        : 'unsupported';

  // Shows the browser's native install prompt and resolves with the user's choice, or `null`
  // when there's no prompt to show (already installed, or a platform without a native prompt).
  const promptInstall = async (): Promise<'accepted' | 'dismissed' | null> => {
    if (!deferred) return null;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A `beforeinstallprompt` event can only be used once; drop it so the menu reflects reality.
    setDeferred(null);
    return outcome;
  };

  return { state, promptInstall };
}
