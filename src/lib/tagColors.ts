import type { TagColor } from '../types';

/** Classes for rendering a tag in its color: `chip` for a pill, `dot` for a swatch. */
export const TAG_COLORS: Record<TagColor, { chip: string; dot: string }> = {
  rose: { chip: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300', dot: 'bg-rose-500' },
  amber: { chip: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300', dot: 'bg-amber-500' },
  emerald: { chip: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300', dot: 'bg-emerald-500' },
  sky: { chip: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', dot: 'bg-sky-500' },
  violet: { chip: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300', dot: 'bg-violet-500' },
  orange: { chip: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300', dot: 'bg-orange-500' },
  teal: { chip: 'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300', dot: 'bg-teal-500' },
  slate: { chip: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200', dot: 'bg-slate-500' },
};

/** Stable ordering for the color picker and for auto-assigning colors to new tags. */
export const TAG_COLOR_ORDER: TagColor[] = ['rose', 'amber', 'emerald', 'sky', 'violet', 'orange', 'teal', 'slate'];
