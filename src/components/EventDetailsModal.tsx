import type { EventDetails, EventState } from '../types';
import { useLanguage } from '../hooks/useLanguage';

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

  const fieldClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4" onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">🗓️ {t('eventDetails.title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
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

          <p className="text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">{t('eventDetails.hint')}</p>
        </div>

        <div className="mt-6">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-indigo-600 text-white text-sm font-medium px-4 py-2.5 hover:bg-indigo-500"
          >
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
