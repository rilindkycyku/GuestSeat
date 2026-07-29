import type { AutoSeatResult } from '../lib/autoSeat';
import { useLanguage } from '../hooks/useLanguage';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';

/**
 * Shown after auto-seating when some guests couldn't be placed. The toast alone could only give a
 * count, which says that something went wrong but not what to do about it; this names each party
 * that stayed unseated and why — no table had enough free seats together, or the only tables with
 * room held someone they must not sit with. Undo stays on the toast; this is read-only.
 */
export function AutoSeatReport({
  result,
  onClose,
}: {
  result: Pick<AutoSeatResult, 'seated' | 'unplaced'>;
  onClose: () => void;
}) {
  const { t } = useLanguage();

  return (
    <ModalShell
      onClose={onClose}
      label={t('autoSeat.unplacedTitle')}
      panelClassName="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col"
      zClassName="z-[60]"
    >
      <ModalHeader icon="🪑" title={t('autoSeat.unplacedTitle')} onClose={onClose} />

      <div className="overflow-y-auto p-6">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t('autoSeat.seatedAnyway', { count: result.seated })}
        </p>

        <ul className="mt-4 space-y-2">
          {result.unplaced.map((party) => (
            <li
              key={party.names.join('|')}
              className="rounded-xl bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-900 px-3 py-2.5"
            >
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{party.names.join(', ')}</p>
              <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
                {party.reason === 'keepApart'
                  ? t('autoSeat.unplacedKeepApart')
                  : t('autoSeat.unplacedNoRoom', { count: party.names.length })}
              </p>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">{t('autoSeat.unplacedHint')}</p>

        <div className="mt-5 flex justify-end">
          <button
            autoFocus
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
