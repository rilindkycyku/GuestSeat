import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  createListTranslator,
  createStepTranslator,
  createTranslator,
  detectInitialLanguage,
  type Language,
} from '../lib/i18n';

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Copy that is a list of lines — the guide's bullets. */
  tList: (key: string) => string[];
  /** Copy that is a list of steps, each a title and a body. */
  tSteps: (key: string) => { title: string; text: string }[];
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(detectInitialLanguage);

  const setLang = useCallback((next: Language) => {
    localStorage.setItem('guestseat.language', next);
    setLangState(next);
  }, []);

  const t = useMemo(() => createTranslator(lang), [lang]);
  const tList = useMemo(() => createListTranslator(lang), [lang]);
  const tSteps = useMemo(() => createStepTranslator(lang), [lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo(() => ({ lang, setLang, t, tList, tSteps }), [lang, setLang, t, tList, tSteps]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider');
  return ctx;
}
