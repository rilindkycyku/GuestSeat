import { useEffect, useRef, useState } from 'react';
import type { AgendaItem, EventDetails, EventState, InvitationTemplate } from '../types';
import { makeId } from '../lib/importGuests';
import { exportInvitationPdf, INVITATION_TEMPLATES, iconForAgenda, type IconKind } from '../lib/invitationPdf';
import { useLanguage } from '../hooks/useLanguage';

/** Emoji shown next to a schedule row in the editor, echoing the icon the PDF draws for it. */
const ICON_EMOJI: Record<IconKind, string> = {
  cocktail: '🍸',
  toast: '🥂',
  arch: '💒',
  church: '⛪',
  bride: '👰',
  car: '🚗',
  camera: '📸',
  flowers: '💐',
  dinner: '🍽️',
  cake: '🎂',
  rings: '💍',
  music: '🎵',
  dance: '💃',
  mic: '🎤',
  gift: '🎁',
  candle: '🕯️',
  doves: '🕊️',
  fireworks: '🎆',
  heart: '💗',
};

/**
 * The program points a wedding invitation starts with — pre-filled but fully editable and
 * removable. Each `key` resolves to a localized title (see `invitation.defaults.*`) and maps,
 * via keyword, to one of the drawn icons. Times are sensible starting points.
 */
const DEFAULT_AGENDA_KEYS = [
  { key: 'cocktail', time: '16:00' },
  { key: 'entrance', time: '16:30' },
  { key: 'ceremony', time: '17:00' },
  { key: 'dinner', time: '19:00' },
  { key: 'cake', time: '21:00' },
  { key: 'party', time: '22:00' },
] as const;

/**
 * Extra one-tap program points, each drawing its own vector icon on the invitation. They aren't
 * seeded into the schedule, only offered as "quick add" chips, so couples can pick the moments
 * that fit their day — a toast, church ceremony, photos, bouquet, the departure car, rings,
 * fireworks — without every card carrying them.
 */
const EXTRA_SUGGESTION_KEYS = [
  { key: 'toast', time: '' },
  { key: 'church', time: '' },
  { key: 'congrats', time: '' },
  { key: 'gifts', time: '' },
  { key: 'firstDance', time: '' },
  { key: 'photo', time: '' },
  { key: 'flowers', time: '' },
  { key: 'candles', time: '' },
  { key: 'doves', time: '' },
  { key: 'car', time: '' },
  { key: 'rings', time: '' },
  { key: 'fireworks', time: '' },
] as const;

/**
 * Editor for the guest-facing invitation: bride & groom, venue, date/time,
 * schedule, and a personal note. Fields write straight through to the shared
 * event state (auto-saved), and a button renders the printable PDF.
 */
export function InvitationModal({
  state,
  onChange,
  onShowQr,
  onToast,
  onClose,
}: {
  state: EventState;
  onChange: (patch: Partial<EventDetails>) => void;
  onShowQr: () => void;
  onToast?: (msg: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const details = state.details ?? {};
  const agenda = details.agenda ?? [];
  const template: InvitationTemplate = details.invitationTemplate ?? 'classic';
  const [busy, setBusy] = useState(false);

  // `fieldBase` carries everything but the width, so inputs inside a flex row can size themselves
  // (a fixed `w-16`, or `flex-1`) without `w-full` overriding them — that override is exactly what
  // used to push the schedule's delete buttons off the screen.
  const fieldBase =
    'rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const fieldClass = `w-full ${fieldBase}`;
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';

  const setAgenda = (next: AgendaItem[]) => onChange({ agenda: next });
  const addAgendaItem = () => setAgenda([...agenda, { id: makeId('a'), time: '', title: '' }]);
  const addAgendaTitle = (title: string, time = '') => setAgenda([...agenda, { id: makeId('a'), time, title }]);
  const updateAgendaItem = (id: string, patch: Partial<AgendaItem>) =>
    setAgenda(agenda.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeAgendaItem = (id: string) => setAgenda(agenda.filter((item) => item.id !== id));

  // Seed the default program the first time the invitation is opened. We key off `agenda` being
  // *undefined* (never touched) rather than empty — so once a couple deletes points down to none,
  // reopening the editor won't silently bring the defaults back.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const patch: Partial<EventDetails> = {};
    if (details.agenda === undefined) {
      patch.agenda = DEFAULT_AGENDA_KEYS.map(({ key, time }) => ({ id: makeId('a'), time, title: t(`invitation.defaults.${key}`) }));
    }
    if (details.introMessage === undefined) {
      patch.introMessage = t('invitation.introMessageDefault');
    }
    if (Object.keys(patch).length) onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Quick add" chips for any default point not already on the schedule (matched by its icon, so
  // an edited "Darka i vonë" still counts as dinner). Lets a couple re-add what they removed.
  const presentIcons = new Set(agenda.map(iconForAgenda));
  const suggestions = [...DEFAULT_AGENDA_KEYS, ...EXTRA_SUGGESTION_KEYS]
    .map(({ key, time }) => ({ key, time, title: t(`invitation.defaults.${key}`) }))
    .filter((d) => !presentIcons.has(iconForAgenda({ id: d.key, title: d.title })));

  const downloadPdf = async () => {
    setBusy(true);
    try {
      await exportInvitationPdf(state, t, lang);
    } catch {
      onToast?.(t('share.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">💌 {t('invitation.title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>{t('invitation.introMessage')}</label>
            <textarea
              value={details.introMessage ?? ''}
              onChange={(e) => onChange({ introMessage: e.target.value })}
              placeholder={t('invitation.introMessagePlaceholder')}
              rows={3}
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('invitation.brideName')}</label>
              <input
                value={details.brideName ?? ''}
                onChange={(e) => onChange({ brideName: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('invitation.groomName')}</label>
              <input
                value={details.groomName ?? ''}
                onChange={(e) => onChange({ groomName: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('invitation.venue')}</label>
            <input
              value={details.venue ?? ''}
              onChange={(e) => onChange({ venue: e.target.value })}
              placeholder={t('invitation.venuePlaceholder')}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>{t('invitation.address')}</label>
            <input
              value={details.address ?? ''}
              onChange={(e) => onChange({ address: e.target.value })}
              placeholder={t('invitation.addressPlaceholder')}
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('invitation.date')}</label>
              <input
                type="date"
                value={details.date ?? ''}
                onChange={(e) => onChange({ date: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('invitation.time')}</label>
              <input
                type="time"
                value={details.time ?? ''}
                onChange={(e) => onChange({ time: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('invitation.schedule')}</label>
            <div className="space-y-2">
              {agenda.map((item) => (
                <div key={item.id} className="flex items-center gap-2">
                  <span aria-hidden className="w-6 shrink-0 text-center text-lg leading-none">
                    {ICON_EMOJI[iconForAgenda(item)]}
                  </span>
                  <input
                    value={item.time ?? ''}
                    onChange={(e) => updateAgendaItem(item.id, { time: e.target.value })}
                    placeholder={t('invitation.timePlaceholder')}
                    className={`${fieldBase} w-16 shrink-0`}
                  />
                  <input
                    value={item.title}
                    onChange={(e) => updateAgendaItem(item.id, { title: e.target.value })}
                    placeholder={t('invitation.agendaPlaceholder')}
                    className={`${fieldBase} min-w-0 flex-1`}
                  />
                  <button
                    onClick={() => removeAgendaItem(item.id)}
                    title={t('common.delete')}
                    className="w-9 h-9 shrink-0 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40 flex items-center justify-center"
                  >
                    🗑
                  </button>
                </div>
              ))}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {suggestions.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => addAgendaTitle(s.title, s.time)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 text-xs text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:text-indigo-500"
                    >
                      <span aria-hidden>{ICON_EMOJI[iconForAgenda({ id: s.key, title: s.title })]}</span>
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={addAgendaItem}
                className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm py-2 hover:border-indigo-400 hover:text-indigo-500"
              >
                + {t('invitation.addOther')}
              </button>
              <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{t('invitation.timelineHint')}</p>
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('invitation.note')}</label>
            <textarea
              value={details.invitationNote ?? ''}
              onChange={(e) => onChange({ invitationNote: e.target.value })}
              placeholder={t('invitation.notePlaceholder')}
              rows={3}
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('invitation.hostFamily')}</label>
              <input
                value={details.hostFamily ?? ''}
                onChange={(e) => onChange({ hostFamily: e.target.value })}
                placeholder={t('invitation.hostFamilyPlaceholder')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('invitation.rsvpPhone')}</label>
              <input
                type="tel"
                value={details.rsvpPhone ?? ''}
                onChange={(e) => onChange({ rsvpPhone: e.target.value })}
                placeholder={t('invitation.rsvpPhonePlaceholder')}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('invitation.design')}</label>
            <div className="grid grid-cols-3 gap-2">
              {INVITATION_TEMPLATES.map((tpl) => {
                const active = tpl.id === template;
                const [bg, accent, ink] = tpl.swatch;
                return (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => onChange({ invitationTemplate: tpl.id })}
                    className={`group rounded-xl border p-2 text-left transition-all ${
                      active
                        ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                    }`}
                  >
                    <div
                      className="h-14 rounded-lg border border-black/5 flex flex-col items-center justify-center gap-1 mb-1.5 overflow-hidden"
                      style={{ backgroundColor: bg }}
                    >
                      <span className="text-[8px] font-serif leading-none" style={{ color: ink }}>
                        A &amp; B
                      </span>
                      <span className="block h-px w-6" style={{ backgroundColor: accent }} />
                      <span className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent, opacity: 0.55 }} />
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent, opacity: 0.3 }} />
                      </span>
                    </div>
                    <span
                      className={`block text-[11px] font-semibold ${
                        active ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {t(tpl.labelKey)}
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 leading-tight">{t(tpl.descKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={() => void downloadPdf()}
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? t('invitation.generating') : t('invitation.downloadPdf')}
          </button>
          <button
            onClick={onShowQr}
            className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium px-4 py-2.5 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {t('share.qrTitle')}
          </button>
        </div>
      </div>
    </div>
  );
}
