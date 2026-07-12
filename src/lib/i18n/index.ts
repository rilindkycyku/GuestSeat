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

export function detectInitialLanguage(): Language {
  // A saved choice always wins, so anyone who switches to English stays in English.
  const stored = localStorage.getItem('guestseat.language');
  if (stored === 'en' || stored === 'sq') return stored;
  // GuestSeat is Albanian-first, so new visitors start in Albanian regardless of the phone's
  // language — this keeps shared links, exports and the UI in Albanian by default.
  return 'sq';
}
