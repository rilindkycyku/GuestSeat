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
  const stored = localStorage.getItem('guestseat.language');
  if (stored === 'en' || stored === 'sq') return stored;
  return navigator.language.toLowerCase().startsWith('sq') ? 'sq' : 'en';
}
