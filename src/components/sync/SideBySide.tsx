import { useLanguage } from '../../hooks/useLanguage';
import { RECORD_KINDS } from '../../lib/sync/records';

/**
 * What the project holds against what this device holds, kind by kind.
 *
 * One total each answers "is sync working" and nothing else. When something *is* missing, the only
 * useful question is which part — a device that has every guest but no tables is a different problem
 * from one that has nothing — so the numbers are broken out the way the data is.
 *
 * A kind neither side has is left out entirely rather than shown as a row of dashes.
 */
export function SideBySide({
  cloud,
  local,
  totals,
}: {
  cloud: Record<string, number>;
  local: Record<string, number>;
  totals: [number, number];
}) {
  const { t } = useLanguage();
  const rows = RECORD_KINDS.filter((kind) => (cloud[kind] ?? 0) > 0 || (local[kind] ?? 0) > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[11px] text-slate-500 dark:text-slate-400">
            <th className="text-start font-normal pb-1" />
            <th className="text-end font-normal pb-1">{t('sync.stored.inProject')}</th>
            <th className="text-end font-normal pb-1">{t('sync.stored.here')}</th>
          </tr>
        </thead>
        <tbody className="text-slate-700 dark:text-slate-200">
          {rows.map((kind) => (
            <tr key={kind}>
              <td className="py-0.5">{t(`sync.kinds.${kind}`)}</td>
              <td className="py-0.5 text-end tabular-nums">{cloud[kind] || '—'}</td>
              <td className="py-0.5 text-end tabular-nums">{local[kind] || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="py-1 text-slate-400 dark:text-slate-500">
                {t('sync.stored.nothing')}
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="font-semibold border-t border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100">
            <td className="pt-1">{t('sync.kinds.total')}</td>
            <td className="pt-1 text-end tabular-nums">{totals[0]}</td>
            <td className="pt-1 text-end tabular-nums">{totals[1]}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
