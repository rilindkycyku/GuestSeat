import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import type { ViewMode } from '../lib/storage';
import type { Language } from '../lib/i18n';

interface SettingsModalProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onMarkAllComing: () => void;
  onMarkAllPending: () => void;
  onUnseatAll: () => void;
  onReset: () => void;
  onClose: () => void;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid grid-flow-col auto-cols-fr rounded-xl bg-slate-100 dark:bg-slate-800 p-1 gap-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsModal({
  viewMode,
  onViewModeChange,
  onMarkAllComing,
  onMarkAllPending,
  onUnseatAll,
  onReset,
  onClose,
}: SettingsModalProps) {
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const actionButton =
    'w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl p-6 max-h-[88vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">⚙️ {t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        <Section title={t('settings.view')}>
          <Segmented
            value={viewMode}
            options={[
              { value: 'list', label: `☰ ${t('settings.viewList')}` },
              { value: 'floor', label: `◯ ${t('settings.viewFloor')}` },
            ]}
            onChange={onViewModeChange}
          />
        </Section>

        <Section title={t('settings.attendance')}>
          <div className="space-y-2">
            <button onClick={onMarkAllComing} className={actionButton}>
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-2" />
              {t('settings.markAllComing')}
            </button>
            <button onClick={onMarkAllPending} className={actionButton}>
              <span className="inline-block w-2 h-2 rounded-full bg-slate-400 mr-2" />
              {t('settings.markAllPending')}
            </button>
          </div>
        </Section>

        <Section title={t('settings.appearance')}>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('settings.language')}</p>
              <Segmented<Language>
                value={lang}
                options={[
                  { value: 'en', label: 'English' },
                  { value: 'sq', label: 'Shqip' },
                ]}
                onChange={setLang}
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('settings.theme')}</p>
              <Segmented
                value={theme}
                options={[
                  { value: 'light', label: `☀️ ${t('settings.themeLight')}` },
                  { value: 'dark', label: `🌙 ${t('settings.themeDark')}` },
                ]}
                onChange={(next) => {
                  if (next !== theme) toggleTheme();
                }}
              />
            </div>
          </div>
        </Section>

        <Section title={t('settings.data')}>
          <div className="space-y-2">
            <button onClick={onUnseatAll} className={actionButton}>
              {t('settings.unseatAll')}
            </button>
            <button
              onClick={onReset}
              className="w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
            >
              {t('settings.resetData')}
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}
