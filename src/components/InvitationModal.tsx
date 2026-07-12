import { useState } from 'react';
import type { AgendaItem, EventDetails, EventState } from '../types';
import { makeId } from '../lib/importGuests';
import { exportInvitationPdf } from '../lib/exportData';
import { useLanguage } from '../hooks/useLanguage';

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
  const [busy, setBusy] = useState(false);

  const fieldClass =
    'w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';
  const labelClass = 'block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1';

  const setAgenda = (next: AgendaItem[]) => onChange({ agenda: next });
  const addAgendaItem = () => setAgenda([...agenda, { id: makeId('a'), time: '', title: '' }]);
  const updateAgendaItem = (id: string, patch: Partial<AgendaItem>) =>
    setAgenda(agenda.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeAgendaItem = (id: string) => setAgenda(agenda.filter((item) => item.id !== id));

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
                  <input
                    value={item.time ?? ''}
                    onChange={(e) => updateAgendaItem(item.id, { time: e.target.value })}
                    placeholder={t('invitation.timePlaceholder')}
                    className={`${fieldClass} w-20 shrink-0`}
                  />
                  <input
                    value={item.title}
                    onChange={(e) => updateAgendaItem(item.id, { title: e.target.value })}
                    placeholder={t('invitation.agendaPlaceholder')}
                    className={fieldClass}
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
              <button
                onClick={addAgendaItem}
                className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm py-2 hover:border-indigo-400 hover:text-indigo-500"
              >
                + {t('invitation.addAgendaItem')}
              </button>
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
