import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import type { TableColumns, ViewMode } from '../lib/storage';
import type { Language } from '../lib/i18n';
import type { TableTag, TagColor } from '../types';
import { TAG_COLORS, TAG_COLOR_ORDER } from '../lib/tagColors';

interface SettingsModalProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  tableColumns: TableColumns;
  onTableColumnsChange: (cols: TableColumns) => void;
  systemTags: TableTag[];
  tags: TableTag[];
  onAddTag: (label: string) => void;
  onUpdateTag: (tagId: string, patch: Partial<Omit<TableTag, 'id'>>) => void;
  onRemoveTag: (tagId: string) => void;
  onMarkAllComing: () => void;
  onMarkAllPending: () => void;
  onUnseatAll: () => void;
  onReset: () => void;
  onEditInvitation: () => void;
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

function TagManager({
  systemTags,
  tags,
  onAddTag,
  onUpdateTag,
  onRemoveTag,
}: Pick<SettingsModalProps, 'systemTags' | 'tags' | 'onAddTag' | 'onUpdateTag' | 'onRemoveTag'>) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const [openColorId, setOpenColorId] = useState<string | null>(null);

  const add = () => {
    const label = draft.trim();
    if (!label) return;
    onAddTag(label);
    setDraft('');
  };

  const fieldClass =
    'flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400';

  return (
    <div className="space-y-2">
      {/* Built-in Groom/Bride tags: always present, cannot be renamed or removed. */}
      {systemTags.map((tag) => (
        <div key={tag.id} className="flex items-center gap-2">
          <span className={`shrink-0 w-7 h-7 rounded-full ${TAG_COLORS[tag.color].dot} ring-2 ring-white dark:ring-slate-900 shadow`} />
          <span className="flex-1 min-w-0 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 truncate">
            {tag.label}
          </span>
          <span className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800">
            {t('tags.builtIn')}
          </span>
        </div>
      ))}
      {tags.map((tag) => (
        <div key={tag.id} className="flex items-center gap-2">
          <div className="relative shrink-0">
            <button
              onClick={() => setOpenColorId(openColorId === tag.id ? null : tag.id)}
              title={t('tags.chooseColor')}
              className={`w-7 h-7 rounded-full ${TAG_COLORS[tag.color].dot} ring-2 ring-white dark:ring-slate-900 shadow`}
            />
            {openColorId === tag.id && (
              <div className="absolute left-0 top-full mt-1 z-10 grid grid-cols-4 gap-1.5 w-36 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg">
                {TAG_COLOR_ORDER.map((c: TagColor) => (
                  <button
                    key={c}
                    onClick={() => {
                      onUpdateTag(tag.id, { color: c });
                      setOpenColorId(null);
                    }}
                    className={`w-6 h-6 rounded-full ${TAG_COLORS[c].dot} ${
                      c === tag.color ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ring-slate-400' : ''
                    }`}
                  />
                ))}
              </div>
            )}
          </div>
          <input
            value={tag.label}
            onChange={(e) => onUpdateTag(tag.id, { label: e.target.value })}
            className={fieldClass}
          />
          <button
            onClick={() => onRemoveTag(tag.id)}
            title={t('tags.deleteTag')}
            className="w-8 h-8 shrink-0 rounded-lg text-sm bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40 flex items-center justify-center"
          >
            🗑
          </button>
        </div>
      ))}
      {tags.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 pt-0.5">{t('tags.settingsHint')}</p>}
      <div className="flex items-center gap-2 pt-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') add();
          }}
          placeholder={t('tags.newTagPlaceholder')}
          className={fieldClass}
        />
        <button
          onClick={add}
          className="shrink-0 rounded-lg bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 hover:bg-indigo-500"
        >
          {t('tags.addTag')}
        </button>
      </div>
    </div>
  );
}

export function SettingsModal({
  viewMode,
  onViewModeChange,
  tableColumns,
  onTableColumnsChange,
  systemTags,
  tags,
  onAddTag,
  onUpdateTag,
  onRemoveTag,
  onMarkAllComing,
  onMarkAllPending,
  onUnseatAll,
  onReset,
  onEditInvitation,
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

        <Section title={t('invitation.title')}>
          <button onClick={onEditInvitation} className={actionButton}>
            💌 {t('invitation.editDetails')}
            <span className="block text-xs font-normal text-slate-400 dark:text-slate-500 mt-0.5">
              {t('invitation.editDetailsDesc')}
            </span>
          </button>
        </Section>

        <Section title={t('settings.view')}>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('settings.layout')}</p>
              <Segmented
                value={viewMode}
                options={[
                  { value: 'list', label: `☰ ${t('settings.viewList')}` },
                  { value: 'floor', label: `◯ ${t('settings.viewFloor')}` },
                ]}
                onChange={onViewModeChange}
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1.5">{t('settings.columns')}</p>
              <Segmented
                value={String(tableColumns)}
                options={[
                  { value: '1', label: t('settings.columnsOne') },
                  { value: '2', label: t('settings.columnsTwo') },
                ]}
                onChange={(v) => onTableColumnsChange(v === '1' ? 1 : 2)}
              />
            </div>
          </div>
        </Section>

        <Section title={t('tags.title')}>
          <TagManager
            systemTags={systemTags}
            tags={tags}
            onAddTag={onAddTag}
            onUpdateTag={onUpdateTag}
            onRemoveTag={onRemoveTag}
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
