import { useMemo } from 'react';
import type { EventState, Guest } from '../types';
import { seatedFeuds } from '../lib/autoSeat';
import type { Translator } from '../lib/tableDisplay';

export interface LinkBadge {
  /** `together` when every partner shares this guest's table, `apart` when they don't (yet). */
  status: 'together' | 'apart';
  title: string;
}

/**
 * The two little markers a guest chip can carry, by guest id.
 *
 * `linkBadges` says whether the people this guest must sit with are actually here — the whole point
 * of a link is visible at a glance, and a broken one is what you want to spot. `feudBadges` is its
 * opposite: someone kept apart is sharing this table anyway, which only happens when a person seats
 * them by hand, and is flagged rather than prevented because overriding is a legitimate choice.
 */
export function useGuestBadges(state: EventState | null, t: Translator) {
  const linkBadges = useMemo(() => {
    const badges = new Map<string, LinkBadge>();
    if (!state) return badges;
    const guestById = new Map(state.guests.map((g) => [g.id, g]));
    for (const g of state.guests) {
      if (!g.linkedGuestIds?.length) continue;
      const partners = g.linkedGuestIds.map((id) => guestById.get(id)).filter((p): p is Guest => !!p);
      if (partners.length === 0) continue;
      const together = g.tableId != null && partners.every((p) => p.tableId === g.tableId);
      badges.set(g.id, {
        status: together ? 'together' : 'apart',
        title: `${t('guestEditor.linkedGuests')}: ${partners.map(fullName).join(', ')}`,
      });
    }
    return badges;
  }, [state, t]);

  const feudBadges = useMemo(() => {
    const badges = new Map<string, { title: string }>();
    if (!state) return badges;
    for (const [guestId, clashes] of seatedFeuds(state.guests)) {
      badges.set(guestId, { title: t('guestEditor.apartWarning', { names: clashes.map(fullName).join(', ') }) });
    }
    return badges;
  }, [state, t]);

  return { linkBadges, feudBadges };
}

function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
}
