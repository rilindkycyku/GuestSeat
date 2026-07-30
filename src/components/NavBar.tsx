import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useTheme } from '../hooks/useTheme';
import { useDialog } from '../hooks/useDialog';
import { ExportMenu } from './ExportMenu';
import type { EventState } from '../types';

interface NavBarProps {
  state: EventState;
  query: string;
  onQueryChange: (query: string) => void;
  /** How many guests the current query matched, or null when nothing is being searched. */
  matchCount: number | null;
  searchInputRef: RefObject<HTMLInputElement | null>;
  onRename: (name: string) => void;
  onAddGuest: () => void;
  onAddTable: () => void;
  onImportFile: (file: File) => void;
  onOpenCheckIn: () => void;
  onOpenOverview: () => void;
  onOpenEvents: () => void;
  onOpenSettings: () => void;
  onShowInvitation: () => void;
  onShowQr: () => void;
  onToast: (msg: string) => void;
}

/** An uppercase divider that names the group of rows under it, as in the FinanCare nav drawer. */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 pt-3 px-3 pb-1 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 first:mt-0 first:pt-0 first:border-0">
      {children}
    </div>
  );
}

/** One tappable row in the drawer: emoji tile, label, optional trailing hint. */
function DrawerRow({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: string;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
    >
      <span className="w-6 text-center text-base" aria-hidden>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </button>
  );
}

/**
 * The slide-in panel behind the ☰ button. It replaces the inline grid of buttons the header used to
 * unfold on phones — that pushed the board down the page and left the actions unlabelled, while a
 * drawer names each one, groups them, and leaves the seating chart where it was.
 */
function NavDrawer({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useDialog<HTMLDivElement>(onClose);

  // Keep the board from scrolling under the open drawer.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return (
    <div className="md:hidden fixed inset-0 z-50" data-print="hide">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute top-0 right-0 h-full w-[82vw] max-w-[310px] flex flex-col bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl overflow-y-auto outline-none motion-safe:animate-[gs-drawer-in_.2s_ease-out]"
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The app's header: the event's name and seating progress, the search field, and every action that
 * isn't tied to a single table. From `md` up the actions sit in the bar itself; below that they move
 * into a drawer, so a phone keeps the header down to a title, a search box and the progress line.
 */
export function NavBar({
  state,
  query,
  onQueryChange,
  matchCount,
  searchInputRef,
  onRename,
  onAddGuest,
  onAddTable,
  onImportFile,
  onOpenCheckIn,
  onOpenOverview,
  onOpenEvents,
  onOpenSettings,
  onShowInvitation,
  onShowQr,
  onToast,
}: NavBarProps) {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const totalGuests = state.guests.length;
  const totalSeated = state.guests.filter((g) => g.tableId).length;
  const confirmedCount = state.guests.filter((g) => g.rsvp === 'confirmed').length;
  const declinedCount = state.guests.filter((g) => g.rsvp === 'declined').length;

  const themeLabel = theme === 'dark' ? t('settings.themeLight') : t('settings.themeDark');

  // Every drawer row does its thing and closes the drawer behind it.
  const pick = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const iconButtonClass =
    'w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center';

  return (
    // The drawer is a sibling of the header, not a child: the header's `backdrop-blur` makes it a
    // containing block for fixed descendants, which would pin the drawer to the bar instead of the
    // viewport.
    <>
      <header
        data-print="hide"
        className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/90 backdrop-blur px-3 py-2.5 sm:px-4 sm:py-3"
      >
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="text-xl shrink-0">🪑</span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {nameDraft !== null ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => {
                  onRename(nameDraft.trim() || state.eventName);
                  setNameDraft(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="font-bold text-base sm:text-lg bg-transparent border-b border-indigo-400 outline-none text-slate-900 dark:text-white min-w-0"
              />
            ) : (
              <button
                onClick={() => setNameDraft(state.eventName)}
                className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400"
                title={t('header.renameHint')}
              >
                {state.eventName}
              </button>
            )}
            <span className="text-[11px] sm:text-xs font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">
              {totalSeated}/{totalGuests}
            </span>
            {(confirmedCount > 0 || declinedCount > 0) && (
              <span
                className="hidden sm:inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-medium shrink-0"
                title={t('rsvp.label')}
              >
                <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {confirmedCount}
                </span>
                <span className="inline-flex items-center gap-0.5 text-red-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {declinedCount}
                </span>
              </span>
            )}
          </div>

          <div className="hidden md:flex items-center gap-2 shrink-0">
            <button
              onClick={onAddGuest}
              className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 shadow-sm shadow-indigo-600/20"
            >
              {t('header.addGuest')}
            </button>
            <button
              onClick={onAddTable}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('header.addTable')}
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('header.import')}
            </button>
            <ExportMenu
              state={state}
              onToast={onToast}
              onShowInvitation={onShowInvitation}
              onShowQr={onShowQr}
            />
            <button onClick={toggleTheme} className={iconButtonClass} title={themeLabel} aria-label={t('settings.theme')}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            <button
              onClick={onOpenEvents}
              className={iconButtonClass}
              title={t('events.myEvents')}
              aria-label={t('events.myEvents')}
            >
              📁
            </button>
            <button
              onClick={onOpenSettings}
              className={iconButtonClass}
              title={t('settings.title')}
              aria-label={t('settings.title')}
            >
              ⚙️
            </button>
          </div>

          <div className="md:hidden flex items-center gap-1.5 shrink-0">
            <button onClick={onOpenSettings} className={iconButtonClass} aria-label={t('settings.title')}>
              ⚙️
            </button>
            <button
              onClick={() => setMenuOpen(true)}
              className={iconButtonClass}
              aria-label={t('nav.openMenu')}
              aria-expanded={menuOpen}
            >
              ☰
            </button>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json,text/csv,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onImportFile(file);
              e.target.value = '';
            }}
          />
        </div>

        <div className="relative mt-2.5">
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              // Escape clears a query, or blurs the empty field so focus returns to the board.
              if (e.key === 'Escape') {
                if (query) onQueryChange('');
                else (e.target as HTMLInputElement).blur();
              }
            }}
            placeholder={t('header.searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 pl-8 pr-16 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          {!query && (
            <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center h-5 px-1.5 rounded border border-slate-200 dark:border-slate-700 text-[10px] font-medium text-slate-400 pointer-events-none select-none">
              /
            </kbd>
          )}
          {query && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {matchCount !== null && <span className="text-xs text-slate-400 tabular-nums">{matchCount}</span>}
              <button
                onClick={() => onQueryChange('')}
                aria-label={t('header.clearSearch')}
                title={t('header.clearSearch')}
                className="w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-700 text-xs"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Slim seating-progress bar pinned to the header's bottom edge — an at-a-glance sense
            of how far along the arrangement is without reading the count. */}
        {totalGuests > 0 && (
          <div
            className="mt-2.5 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"
            role="progressbar"
            aria-valuenow={totalSeated}
            aria-valuemin={0}
            aria-valuemax={totalGuests}
            aria-label={t('header.seatedProgress', { seated: totalSeated, total: totalGuests })}
            title={t('header.seatedProgress', { seated: totalSeated, total: totalGuests })}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${Math.round((totalSeated / totalGuests) * 100)}%` }}
            />
          </div>
        )}
      </header>

      {menuOpen && (
        <NavDrawer label={t('header.menu')} onClose={() => setMenuOpen(false)}>
          <div className="sticky top-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg shrink-0" aria-hidden>
                🪑
              </span>
              <span className="font-semibold text-slate-900 dark:text-white truncate">{state.eventName}</span>
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              className="shrink-0 w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
              aria-label={t('nav.closeMenu')}
            >
              ✕
            </button>
          </div>

          <nav className="p-2">
            <GroupLabel>{t('nav.add')}</GroupLabel>
            <DrawerRow icon="🧑" label={t('nav.guest')} onClick={pick(onAddGuest)} />
            <DrawerRow icon="🪑" label={t('nav.table')} onClick={pick(onAddTable)} />

            <GroupLabel>{t('nav.data')}</GroupLabel>
            <DrawerRow icon="📥" label={t('header.import')} onClick={pick(() => importInputRef.current?.click())} />
            <ExportMenu
              state={state}
              inline
              onToast={onToast}
              onShowInvitation={pick(onShowInvitation)}
              onShowQr={pick(onShowQr)}
            />

            <GroupLabel>{t('nav.event')}</GroupLabel>
            <DrawerRow icon="🎉" label={t('checkin.title')} onClick={pick(onOpenCheckIn)} />
            <DrawerRow icon="📊" label={t('settings.overview')} onClick={pick(onOpenOverview)} />
            <DrawerRow icon="📁" label={t('events.myEvents')} onClick={pick(onOpenEvents)} />
            <DrawerRow icon="⚙️" label={t('settings.title')} onClick={pick(onOpenSettings)} />

            <GroupLabel>{t('settings.appearance')}</GroupLabel>
            {/* Left open on purpose: flipping the theme is something you judge by looking at it. */}
            <DrawerRow icon={theme === 'dark' ? '☀️' : '🌙'} label={themeLabel} onClick={toggleTheme} />
          </nav>
        </NavDrawer>
      )}
    </>
  );
}
