import type { Guest } from '../types';

/**
 * Clusters guests who are linked to each other *within this same list* (e.g. one table's
 * guests) into groups, using their mutual `linkedGuestIds`. A guest linked only to someone
 * seated elsewhere returns as its own singleton group here — that's surfaced separately via
 * the per-guest "apart" badge, not this grouping.
 */
export function groupLinkedWithin(guests: Guest[]): Guest[][] {
  const byId = new Map(guests.map((g) => [g.id, g]));
  const visited = new Set<string>();
  const groups: Guest[][] = [];

  for (const start of guests) {
    if (visited.has(start.id)) continue;
    const stack = [start.id];
    const clusterIds: string[] = [];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      clusterIds.push(id);
      for (const linkedId of byId.get(id)?.linkedGuestIds ?? []) {
        if (byId.has(linkedId) && !visited.has(linkedId)) stack.push(linkedId);
      }
    }
    groups.push(clusterIds.map((id) => byId.get(id)!).sort((a, b) => a.name.localeCompare(b.name)));
  }

  groups.sort((a, b) => a[0].name.localeCompare(b[0].name));
  return groups;
}
