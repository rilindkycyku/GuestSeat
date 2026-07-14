import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { eventTypeConfig } from '../lib/eventTypes';
import { SettingsControls } from './SettingsControls';
import { Credits } from './Credits';
import type { EventSummary } from '../lib/db';

interface EventPickerProps {
  events: EventSummary[];
  onOpen: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, name: string) => void;
  onDelete: (event: EventSummary) => void;
}

/**
 * The home screen once a planner has more than one saved event: a grid of event cards. Opening a
 * card resumes that event exactly where it was left; the primary button starts a fresh one. Each
 * event lives independently in IndexedDB, so closing one and opening another loses nothing.
 */
export function EventPicker({ events, onOpen, onNew, onRename, onDelete }: EventPickerProps) {
  const { t, lang } = useLanguage();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const dateFmt = new Intl.DateTimeFormat(lang === 'sq' ? 'sq' : 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const sorted = [...events].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const commitRename = (id: string) => {
    const name = draft.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-16 sm:py-12 relative">
      <SettingsControls className="absolute top-4 right-4" />
      <div className="w-full max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-2xl mb-4 shadow-lg shadow-indigo-600/20">
            🪑
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">{t('events.title')}</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">{t('events.subtitle')}</p>
        </div>

        <button
          onClick={onNew}
          className="w-full mb-5 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 font-semibold px-4 py-4 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/30 transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          {t('events.newEvent')}
        </button>

        {sorted.length === 0 ? (
          <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">{t('events.empty')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sorted.map((ev) => {
              const cfg = eventTypeConfig(ev.eventType);
              const name = ev.eventName?.trim() || t('events.untitled');
              const renaming = renamingId === ev.id;
              return (
                <div
                  key={ev.id}
                  className="group relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all"
                >
                  <button
                    onClick={() => !renaming && onOpen(ev.id)}
                    className="w-full text-left flex items-start gap-3"
                    disabled={renaming}
                  >
                    <span className="shrink-0 w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 flex items-center justify-center text-xl">
                      {cfg.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      {renaming ? (
                        <input
                          autoFocus
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onBlur={() => commitRename(ev.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitRename(ev.id);
                            if (e.key === 'Escape') setRenamingId(null);
                          }}
                          className="w-full font-semibold text-slate-900 dark:text-white bg-transparent border-b border-indigo-400 outline-none"
                        />
                      ) : (
                        <span className="block font-semibold text-slate-900 dark:text-white truncate">{name}</span>
                      )}
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {t('events.guestsTables', { guests: ev.guestCount, tables: ev.tableCount })}
                      </span>
                      <span className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                        {t('events.updated', { date: dateFmt.format(new Date(ev.updatedAt)) })}
                      </span>
                    </span>
                  </button>

                  {!renaming && (
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setDraft(ev.eventName ?? '');
                          setRenamingId(ev.id);
                        }}
                        title={t('events.rename')}
                        aria-label={t('events.rename')}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center text-xs"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => onDelete(ev)}
                        title={t('events.delete')}
                        aria-label={t('events.delete')}
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40 flex items-center justify-center text-xs"
                      >
                        🗑
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <Credits />
      </div>
    </div>
  );
}
