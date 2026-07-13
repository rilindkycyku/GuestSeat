import { useEffect, useRef, useState } from 'react';
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import type { AgendaItem, EventDetails, EventState, InvitationTemplate } from '../types';
import { makeId } from '../lib/importGuests';
import { exportInvitationPdf, INVITATION_TEMPLATES, iconForAgenda, type IconKind } from '../lib/invitationPdf';
import { useLanguage } from '../hooks/useLanguage';
import { ModalHeader } from './ModalHeader';

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
  balloons: '🎈',
  plane: '✈️',
  guestbook: '📖',
  clock: '🕐',
  groom: '🤵',
  dress: '👗',
  makeup: '💄',
  pin: '📍',
  letter: '💌',
  carriage: '🐴',
  drum: '🥁',
  lantern: '🏮',
  video: '🎥',
  stars: '✨',
  sunset: '🌅',
  fireworks: '🎆',
  flag: '🚩',
  sofra: '🍲',
  cifteli: '🪕',
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
 * The traditional Albanian wedding program, seeded instead of the plain default when the
 * "pre-fill traditions" setting is on: the bride's send-off (marrja e nuses), the çifteli folk
 * band and the krushq feast (sofra e krushqve) each land in their natural spot in the day.
 */
const TRADITION_AGENDA_KEYS = [
  { key: 'cocktail', time: '16:00' },
  { key: 'brideSendoff', time: '16:20' },
  { key: 'ceremony', time: '17:00' },
  { key: 'cifteli', time: '18:00' },
  { key: 'krushqFeast', time: '19:00' },
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
  { key: 'gettingReady', time: '' },
  { key: 'dress', time: '' },
  { key: 'arrival', time: '' },
  { key: 'location', time: '' },
  { key: 'toast', time: '' },
  { key: 'church', time: '' },
  { key: 'vows', time: '' },
  { key: 'congrats', time: '' },
  { key: 'gifts', time: '' },
  { key: 'guestbook', time: '' },
  { key: 'firstDance', time: '' },
  { key: 'photo', time: '' },
  { key: 'video', time: '' },
  { key: 'flowers', time: '' },
  { key: 'decor', time: '' },
  { key: 'lanterns', time: '' },
  { key: 'candles', time: '' },
  { key: 'traditional', time: '' },
  { key: 'brideSendoff', time: '' },
  { key: 'cifteli', time: '' },
  { key: 'krushqFeast', time: '' },
  { key: 'doves', time: '' },
  { key: 'groom', time: '' },
  { key: 'sunset', time: '' },
  { key: 'evening', time: '' },
  { key: 'carriage', time: '' },
  { key: 'car', time: '' },
  { key: 'honeymoon', time: '' },
  { key: 'rings', time: '' },
  { key: 'fireworks', time: '' },
] as const;

/**
 * One draggable schedule row. The leading glyph doubles as the drag handle (so reordering costs no
 * extra button); the whole row is a drop target. Reordering happens on drop — see the parent's
 * `onAgendaDragEnd` — so there's no live-follow overlay, just a dimmed source and a highlighted target.
 */
function AgendaRow({
  item,
  emoji,
  dragging,
  dragLabel,
  timeLabel,
  titlePlaceholder,
  deleteLabel,
  fieldBase,
  onUpdate,
  onRemove,
}: {
  item: AgendaItem;
  emoji: string;
  dragging: boolean;
  dragLabel: string;
  timeLabel: string;
  titlePlaceholder: string;
  deleteLabel: string;
  fieldBase: string;
  onUpdate: (patch: Partial<AgendaItem>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef: setDragRef } = useDraggable({ id: item.id });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: item.id });
  return (
    <div
      ref={setDropRef}
      className={`flex items-center gap-2 rounded-lg transition-colors ${dragging ? 'opacity-40' : ''} ${
        isOver && !dragging ? 'ring-2 ring-indigo-300 dark:ring-indigo-700' : ''
      }`}
    >
      <button
        ref={setDragRef}
        type="button"
        {...listeners}
        {...attributes}
        aria-label={dragLabel}
        title={dragLabel}
        className="w-6 shrink-0 text-center text-lg leading-none cursor-grab active:cursor-grabbing touch-none select-none"
      >
        {emoji}
      </button>
      <input
        type="time"
        value={item.time ?? ''}
        onChange={(e) => onUpdate({ time: e.target.value })}
        aria-label={timeLabel}
        className={`${fieldBase} w-28 shrink-0`}
      />
      <input
        value={item.title}
        onChange={(e) => onUpdate({ title: e.target.value })}
        placeholder={titlePlaceholder}
        className={`${fieldBase} min-w-0 flex-1`}
      />
      <button
        onClick={onRemove}
        title={deleteLabel}
        className="w-9 h-9 shrink-0 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40 flex items-center justify-center"
      >
        🗑
      </button>
    </div>
  );
}

/**
 * Editor for the printable invitation: the top message, schedule, personal note,
 * host sign-off, RSVP number and design. The couple, venue and date/time live in
 * the separate Event Details editor (they're shared state the PDF also reads), so
 * this modal is only about what gets printed. Fields auto-save; a button renders
 * the PDF.
 */
export function InvitationModal({
  state,
  onChange,
  onShowQr,
  onToast,
  seedTraditions = false,
  onClose,
}: {
  state: EventState;
  onChange: (patch: Partial<EventDetails>) => void;
  onShowQr: () => void;
  onToast?: (msg: string) => void;
  /** When true, a fresh invitation seeds the traditional Albanian program instead of the plain default. */
  seedTraditions?: boolean;
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

  // Drag-to-reorder the schedule. A local DndContext (isolated from the app's guest-seating one)
  // reorders rows when a dragged item is dropped onto another; the leading icon doubles as the grab
  // handle so no extra control crowds the row. Touch uses a short press-and-hold so taps still edit.
  const [activeAgendaId, setActiveAgendaId] = useState<string | null>(null);
  const agendaSensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );
  const moveAgendaItem = (activeId: string, overId: string) => {
    if (activeId === overId) return;
    const from = agenda.findIndex((a) => a.id === activeId);
    const to = agenda.findIndex((a) => a.id === overId);
    if (from === -1 || to === -1) return;
    const next = [...agenda];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setAgenda(next);
  };
  const onAgendaDragStart = (e: DragStartEvent) => setActiveAgendaId(String(e.active.id));
  const onAgendaDragEnd = (e: DragEndEvent) => {
    setActiveAgendaId(null);
    if (e.over) moveAgendaItem(String(e.active.id), String(e.over.id));
  };

  // Seed the default program the first time the invitation is opened. We key off `agenda` being
  // *undefined* (never touched) rather than empty — so once a couple deletes points down to none,
  // reopening the editor won't silently bring the defaults back.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const patch: Partial<EventDetails> = {};
    if (details.agenda === undefined) {
      const keys = seedTraditions ? TRADITION_AGENDA_KEYS : DEFAULT_AGENDA_KEYS;
      patch.agenda = keys.map(({ key, time }) => ({ id: makeId('a'), time, title: t(`invitation.defaults.${key}`) }));
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
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader icon="💌" title={t('invitation.title')} onClose={onClose} />

        <div className="overflow-y-auto p-6">
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

          <div>
            <label className={labelClass}>{t('invitation.schedule')}</label>
            <div className="space-y-2">
              <DndContext
                sensors={agendaSensors}
                collisionDetection={closestCenter}
                onDragStart={onAgendaDragStart}
                onDragEnd={onAgendaDragEnd}
              >
                {agenda.map((item) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    emoji={ICON_EMOJI[iconForAgenda(item)]}
                    dragging={activeAgendaId === item.id}
                    dragLabel={t('invitation.dragToReorder')}
                    timeLabel={t('invitation.time')}
                    titlePlaceholder={t('invitation.agendaPlaceholder')}
                    deleteLabel={t('common.delete')}
                    fieldBase={fieldBase}
                    onUpdate={(patch) => updateAgendaItem(item.id, patch)}
                    onRemove={() => removeAgendaItem(item.id)}
                  />
                ))}
              </DndContext>
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
    </div>
  );
}
