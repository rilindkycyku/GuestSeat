import { useTheme } from '../hooks/useTheme';
import { useLanguage } from '../hooks/useLanguage';
import { LANGUAGE_LABELS, type Language } from '../lib/i18n';

export function SettingsControls({ className = '' }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang } = useLanguage();

  const otherLang: Language = lang === 'en' ? 'sq' : 'en';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <button
        onClick={() => setLang(otherLang)}
        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
        title={`Switch to ${LANGUAGE_LABELS[otherLang]}`}
      >
        {LANGUAGE_LABELS[lang]}
      </button>
      <button
        onClick={toggleTheme}
        className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
