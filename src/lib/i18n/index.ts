import { en, type TranslationDict } from './en';
import { sq } from './sq';

export type Language = 'en' | 'sq';

export const translations: Record<Language, TranslationDict> = { en, sq };

export const LANGUAGE_LABELS: Record<Language, string> = { en: 'EN', sq: 'SQ' };

function resolvePath(dict: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, dict);
}

export function createTranslator(lang: Language) {
  return function t(key: string, vars?: Record<string, string | number>): string {
    const value = resolvePath(translations[lang], key) ?? resolvePath(translations.en, key);
    let text = typeof value === 'string' ? value : key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replaceAll(`{{${k}}}`, String(v));
      }
    }
    return text;
  };
}

/**
 * The same lookup for copy that is a *list* — the guide's steps and bullets, which read as prose in
 * the dictionary and would be unmaintainable split across `guide.s3.b1`, `b2`, `b3`.
 *
 * Falls back to English per key, like {@link createTranslator}, so a list added to `en` but not yet
 * translated shows in English rather than vanishing.
 */
export function createListTranslator(lang: Language) {
  return function tList(key: string): string[] {
    const value = resolvePath(translations[lang], key) ?? resolvePath(translations.en, key);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  };
}

/** The same, for copy whose items are objects — the guide's steps, which are a title and a body. */
export function createStepTranslator(lang: Language) {
  return function tSteps(key: string): { title: string; text: string }[] {
    const value = resolvePath(translations[lang], key) ?? resolvePath(translations.en, key);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is { title: string; text: string } =>
        Boolean(item) && typeof item === 'object' && typeof (item as { title?: unknown }).title === 'string'
    );
  };
}

export function detectInitialLanguage(): Language {
  // A saved choice always wins, so anyone who switches to English stays in English.
  const stored = localStorage.getItem('guestseat.language');
  if (stored === 'en' || stored === 'sq') return stored;
  // GuestSeat is Albanian-first, so new visitors start in Albanian regardless of the phone's
  // language — this keeps shared links, exports and the UI in Albanian by default.
  return 'sq';
}
