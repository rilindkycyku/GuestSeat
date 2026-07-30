import type { EventDetails, EventState, EventType } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { EVENT_TYPES, eventTypeConfig } from '../lib/eventTypes';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';

/**
 * Editor for the core event facts — bride & groom, venue, location and the
 * date/time. These are kept separate from the printable invitation so a couple
 * can record who/where/when without ever opening the invitation editor (handy
 * when they aren't printing invitations at all). The invitation PDF reads the
 * same saved fields, so filling these in here is all it needs.
 */
export function EventDetailsModal({
  state,
  onChange,
  onClose,
}: {
  state: EventState;
  onChange: (patch: Partial<EventDetails>) => void;
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const details = state.details ?? {};
  const type = details.eventType ?? 'wedding';
  const cfg = eventTypeConfig(type);

  // Switching type also tidies the name fields: single-honoree events drop the second name, and
  // a nameless party clears both, so the invitation never prints a leftover from a previous type.
  const selectType = (id: EventType) => {
    const next = eventTypeConfig(id);
    const patch: Partial<EventDetails> = { eventType: id };
    if (next.nameLabelKeys.length < 2) patch.groomName = '';
    if (next.nameLabelKeys.length === 0) patch.brideName = '';
    onChange(patch);
  };

  const fieldClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';

  return (
    <ModalShell
      onClose={onClose}
      label={t('eventDetails.title')}
      panelClassName="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
      closeOnBackdrop={false}
    >
      <ModalHeader icon="🗓️" title={t('eventDetails.title')} onClose={onClose} />

      <div className="overflow-y-auto p-6 space-y-4">
        <div>
          <label className={labelClass}>{t('eventType.label')}</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {EVENT_TYPES.map((et) => {
              const active = et.id === type;
              return (
                <button
                  key={et.id}
                  type="button"
                  onClick={() => selectType(et.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2 text-center transition-colors ${
                    active
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl leading-none">{et.emoji}</span>
                  <span className="text-[10px] font-medium leading-tight">{t(et.labelKey)}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500 mt-2">{t('eventType.hint')}</p>
        </div>

        {cfg.nameLabelKeys.length === 2 && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t(cfg.nameLabelKeys[0])}</label>
              <input
                value={details.brideName ?? ''}
                onChange={(e) => onChange({ brideName: e.target.value })}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t(cfg.nameLabelKeys[1])}</label>
              <input
                value={details.groomName ?? ''}
                onChange={(e) => onChange({ groomName: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        {cfg.nameLabelKeys.length === 1 && (
          <div>
            <label className={labelClass}>{t(cfg.nameLabelKeys[0])}</label>
            <input
              value={details.brideName ?? ''}
              onChange={(e) => onChange({ brideName: e.target.value })}
              className={fieldClass}
            />
          </div>
        )}

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

        <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{t('eventDetails.hint')}</p>

        <button
          onClick={onClose}
          className="w-full mt-2 rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-500"
        >
          {t('common.save')}
        </button>
      </div>
    </ModalShell>
  );
}
