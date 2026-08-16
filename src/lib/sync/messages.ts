/**
 * Failures, in the reader's language.
 *
 * The sync library throws codes with an English sentence attached: it has no business importing the
 * translator, and the same failure has to be reportable from a background sync nobody is watching.
 * This is the other half — the code turned into a sentence, falling back to whatever the project
 * itself said when the code is one we have no better words for (a Postgres error, say, which is at
 * least true even if it is in English).
 */

import { SyncError, type KeyCheck } from './supabase';

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** `t` returns the key itself when there is no translation, which is exactly the signal needed to
 * tell "we have words for this" from "fall back to the server's own". */
function translated(t: Translate, key: string): string | null {
  const text = t(key);
  return text === key ? null : text;
}

export function syncErrorText(err: unknown, t: Translate): string {
  if (err instanceof SyncError) {
    const text = translated(t, `sync.errors.${err.code}`);
    if (text) return text;
  }
  return (err as Error)?.message || t('sync.errors.server');
}

/** Why a pasted key was refused. Each reason is a different mistake with a different fix, and the
 * two dangerous ones (a secret or service-role key) say plainly what would have happened. */
export function keyErrorText(check: KeyCheck, t: Translate): string {
  if (check.ok) return '';
  if (check.reason === 'role') return t('sync.keyErrors.role', { role: check.role ?? '' });
  return t(`sync.keyErrors.${check.reason}`);
}
