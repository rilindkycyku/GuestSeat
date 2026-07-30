import { useLanguage } from './useLanguage';
import { useInstallPrompt } from './useInstallPrompt';
import { exportAsExcel, exportAsJson, exportAsPdf, exportAsPlaceCards, exportAsTableCards } from '../lib/exportData';
import { encodeStateToLink } from '../lib/shareLink';
import type { EventState } from '../types';

export interface ExportAction {
  key: string;
  /** Emoji shown by the surfaces that list actions as rows; the desktop menus go without. */
  icon: string;
  label: string;
  desc: string;
  onClick: () => void;
}

export interface ExportGroup {
  key: string;
  label: string;
  actions: ExportAction[];
}

interface Options {
  state: EventState;
  onToast?: (msg: string) => void;
  onShowInvitation?: () => void;
  onShowQr?: () => void;
}

/**
 * Everything you can do with a finished list, in two families: *sharing* it as a live link, and
 * *exporting* it as paper or a file. The two are separate menus in the nav bar and separate groups
 * in its drawer, and both read from here so neither surface has to restate the list.
 *
 * Groups whose actions are all unavailable on this device drop out, so no surface ever renders a
 * heading with nothing under it.
 */
export function useExportActions({ state, onToast, onShowInvitation, onShowQr }: Options): {
  share: ExportGroup[];
  output: ExportGroup[];
} {
  const { t, lang } = useLanguage();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const { state: installState, promptInstall } = useInstallPrompt();
  // Offer the shortcut only where there's a path to install: a native prompt, or iOS's manual flow.
  const canInstall = installState === 'available' || installState === 'ios';

  const copyLink = async () => {
    try {
      const url = await encodeStateToLink(state);
      await navigator.clipboard.writeText(url);
      onToast?.(t('share.copied'));
    } catch {
      onToast?.(t('share.failed'));
    }
  };

  // Native share sheet (WhatsApp, email, AirDrop…) carrying the auto-load link; falls back to copy.
  const shareLink = async () => {
    try {
      const url = await encodeStateToLink(state);
      await navigator.share({ title: state.eventName, text: t('share.shareText', { name: state.eventName }), url });
    } catch (err) {
      // AbortError = the user dismissed the share sheet; stay silent for that.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(await encodeStateToLink(state));
        onToast?.(t('share.copied'));
      } catch {
        onToast?.(t('share.failed'));
      }
    }
  };

  // Install the app as a home-screen shortcut. On Chrome/Edge this fires the native prompt; on
  // iOS there's no programmatic install, so we point the user at the Share → Add flow instead.
  const addToHomeScreen = async () => {
    if (installState === 'ios') {
      onToast?.(t('export.shortcutIosHint'));
      return;
    }
    const outcome = await promptInstall();
    if (outcome === 'accepted') onToast?.(t('export.shortcutAdded'));
  };

  const group = (key: string, actions: (ExportAction | false | undefined)[]): ExportGroup => ({
    key,
    label: t(`export.groups.${key}`),
    actions: actions.filter((a): a is ExportAction => Boolean(a)),
  });

  const share = [
    group('share', [
      canShare && {
        key: 'shareApps',
        icon: '📤',
        label: t('share.share'),
        desc: t('share.shareDesc'),
        onClick: () => void shareLink(),
      },
      {
        key: 'copy',
        icon: '🔗',
        label: t('share.copyLink'),
        desc: t('share.copyLinkDesc'),
        onClick: () => void copyLink(),
      },
      onShowQr && { key: 'qr', icon: '📱', label: t('export.qr'), desc: t('export.qrDesc'), onClick: onShowQr },
    ]),
    group('app', [
      canInstall && {
        key: 'shortcut',
        icon: '🏠',
        label: t('export.shortcut'),
        desc: t('export.shortcutDesc'),
        onClick: () => void addToHomeScreen(),
      },
    ]),
  ].filter((g) => g.actions.length > 0);

  const output = [
    group('print', [
      onShowInvitation && {
        key: 'invitation',
        icon: '💌',
        label: t('export.invitation'),
        desc: t('export.invitationDesc'),
        onClick: onShowInvitation,
      },
      {
        key: 'pdf',
        icon: '📄',
        label: t('export.pdf'),
        desc: t('export.pdfDesc'),
        onClick: () => void exportAsPdf(state, t, lang),
      },
      {
        key: 'tableCards',
        icon: '🎴',
        label: t('export.tableCards'),
        desc: t('export.tableCardsDesc'),
        onClick: () => void exportAsTableCards(state, t, lang),
      },
      {
        key: 'placeCards',
        icon: '🏷️',
        label: t('export.placeCards'),
        desc: t('export.placeCardsDesc'),
        onClick: () => void exportAsPlaceCards(state, t, lang),
      },
    ]),
    group('files', [
      {
        key: 'excel',
        icon: '📗',
        label: t('export.excel'),
        desc: t('export.excelDesc'),
        onClick: () => void exportAsExcel(state, t, lang),
      },
      { key: 'json', icon: '🗄️', label: t('export.json'), desc: t('export.jsonDesc'), onClick: () => exportAsJson(state) },
    ]),
  ].filter((g) => g.actions.length > 0);

  return { share, output };
}
