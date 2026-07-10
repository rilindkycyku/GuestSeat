import { useDroppable } from '@dnd-kit/core';
import type { Guest } from '../types';
import { GuestChip } from './GuestChip';
import { useLanguage } from '../hooks/useLanguage';

interface UnseatedPanelProps {
  guests: Guest[];
  matchedIds: Set<string> | null;
  linkBadges: Map<string, { status: 'together' | 'apart'; title: string }>;
  onGuestClick: (guest: Guest) => void;
}

export function UnseatedPanel({ guests, matchedIds, linkBadges, onGuestClick }: UnseatedPanelProps) {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: 'unseated' });

  return (
    <div
      ref={setNodeRef}
      data-testid="unseated-panel"
      className={`flex flex-col h-full rounded-2xl border-2 border-dashed p-3 transition-colors ${
        isOver ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{t('unseated.title')}</h2>
        <span className="text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">
          {guests.length}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 min-h-[80px]">
        {guests.length === 0 && (
          <p className="text-xs text-slate-400 text-center py-6">
            {t('unseated.allSeated')}
            <br />
            {t('unseated.dragHint')}
          </p>
        )}
        {guests.map((g) => (
          <GuestChip
            key={g.id}
            guest={g}
            highlighted={matchedIds ? matchedIds.has(g.id) : false}
            linkBadge={linkBadges.get(g.id)}
            onClick={() => onGuestClick(g)}
          />
        ))}
      </div>
    </div>
  );
}
