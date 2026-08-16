import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import type { TableColumns, ViewMode } from '../lib/storage';
import type { Language } from '../lib/i18n';
import type { TableTag, TagColor } from '../types';
import { TAG_COLORS, TAG_COLOR_ORDER, tagColorClasses } from '../lib/tagColors';
import { ModalHeader } from './ModalHeader';
import { ModalShell } from './ModalShell';
import { Credits } from './Credits';

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
  onAutoSeat: () => void;
  onOverview: () => void;
  onCheckIn: () => void;
  onEditEventDetails: () => void;
  onEditInvitation: () => void;
  onSwitchEvents: () => void;
  /** Open the data & sync dialog. */
  onOpenData: () => void;
  onOpenGuide: () => void;
  /** Whether a Supabase project is set up on this device, for the row's one-line summary. */
  syncConfigured: boolean;
  onClose: () => void;
}

function Section({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
        {icon && <span className="text-sm not-italic">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A tappable navigation row: icon tile, title, description and a chevron affordance. */
function NavRow({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="group w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20 transition-colors text-left"
    >
      <span className="shrink-0 w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-lg">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
        <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{description}</span>
      </span>
      <span className="shrink-0 text-slate-300 dark:text-slate-600 group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-transform">
        ›
      </span>
    </button>
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
          <span
            className={`shrink-0 w-7 h-7 rounded-full ${tagColorClasses(tag.color).dot} ring-2 ring-white dark:ring-slate-900 shadow`}
          />
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
              className={`w-7 h-7 rounded-full ${tagColorClasses(tag.color).dot} ring-2 ring-white dark:ring-slate-900 shadow`}
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
                      c === tag.color
                        ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-slate-800 ring-slate-400'
                        : ''
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
      {tags.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 pt-0.5">{t('tags.settingsHint')}</p>
      )}
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
  onAutoSeat,
  onOverview,
  onCheckIn,
  onEditEventDetails,
  onEditInvitation,
  onSwitchEvents,
  onOpenData,
  onOpenGuide,
  syncConfigured,
  onClose,
}: SettingsModalProps) {
  const { t, lang, setLang } = useLanguage();
  const { theme, toggleTheme } = useTheme();

  const actionButton =
    'w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors';

  return (
    <ModalShell
      onClose={onClose}
      label={t('settings.title')}
      panelClassName="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <ModalHeader icon="⚙️" title={t('settings.title')} onClose={onClose} />

      <div className="overflow-y-auto p-4 sm:p-5 space-y-3">
        <Section title={t('events.myEvents')} icon="📁">
          <NavRow
            icon="🗂️"
            title={t('events.switchEvent')}
            description={t('events.switchEventDesc')}
            onClick={onSwitchEvents}
          />
        </Section>

        <Section title={t('settings.content')} icon="✨">
          <div className="space-y-2">
            <NavRow
              icon="🗓️"
              title={t('eventDetails.editDetails')}
              description={t('eventDetails.editDetailsDesc')}
              onClick={onEditEventDetails}
            />
            <NavRow
              icon="💌"
              title={t('invitation.editDetails')}
              description={t('invitation.editDetailsDesc')}
              onClick={onEditInvitation}
            />
          </div>
        </Section>

        <Section title={t('settings.seating')} icon="🎯">
          <div className="space-y-2">
            <NavRow
              icon="✨"
              title={t('settings.autoSeat')}
              description={t('settings.autoSeatDesc')}
              onClick={onAutoSeat}
            />
            <NavRow
              icon="📊"
              title={t('settings.overview')}
              description={t('settings.overviewDesc')}
              onClick={onOverview}
            />
            <NavRow
              icon="🎉"
              title={t('settings.checkIn')}
              description={t('settings.checkInDesc')}
              onClick={onCheckIn}
            />
          </div>
        </Section>

        <Section title={t('settings.view')} icon="🪑">
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

        <Section title={t('tags.title')} icon="🏷️">
          <TagManager
            systemTags={systemTags}
            tags={tags}
            onAddTag={onAddTag}
            onUpdateTag={onUpdateTag}
            onRemoveTag={onRemoveTag}
          />
        </Section>

        <Section title={t('settings.attendance')} icon="✅">
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

        <Section title={t('settings.appearance')} icon="🎨">
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

        <Section title={t('settings.data')} icon="🗄️">
          <div className="space-y-2">
            <NavRow
              icon="☁️"
              title={t('backup.title')}
              description={syncConfigured ? t('backup.navDescConnected') : t('backup.navDesc')}
              onClick={onOpenData}
            />
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

        <Section title={t('settings.help')} icon="📖">
          <NavRow icon="📖" title={t('guide.open')} description={t('guide.openDesc')} onClick={onOpenGuide} />
        </Section>

        <Credits compact />
      </div>
    </ModalShell>
  );
}
