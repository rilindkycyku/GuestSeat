import { useCallback, useRef, useState } from 'react';
import { ImportError, parseImportedJson } from '../lib/importGuests';
import { parseImportedCsv } from '../lib/importCsv';
import { useLanguage } from '../hooks/useLanguage';
import { EVENT_TYPES } from '../lib/eventTypes';
import { SettingsControls } from './SettingsControls';
import type { EventType, Guest, Table, TableNamingMode } from '../types';

interface OnboardingProps {
  onImported: (guests: Guest[], tables: Table[], eventName: string | undefined, eventType: EventType) => void;
  /** Load the fully-featured demo event (tags, sides, links, RSVP, invitation details). */
  onLoadDemo: () => void;
  /** Start with an empty event — no guests or tables — and build the list by hand. */
  onStartBlank: (eventType: EventType) => void;
}

export function Onboarding({ onImported, onLoadDemo, onStartBlank }: OnboardingProps) {
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [namingMode, setNamingMode] = useState<TableNamingMode>('letters');
  const [eventType, setEventType] = useState<EventType>('wedding');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      try {
        const text = await file.text();
        if (file.name.toLowerCase().endsWith('.csv')) {
          const { guests, tables } = parseImportedCsv(text);
          onImported(guests, tables, t('header.defaultEventName'), eventType);
          return;
        }
        const json = JSON.parse(text);
        const { guests, tables, eventName } = parseImportedJson(json, t('tables.namePrefix'), namingMode);
        onImported(guests, tables, eventName ?? t('header.defaultEventName'), eventType);
      } catch (err) {
        if (err instanceof ImportError) {
          setError(t(`import.errors.${err.code}`));
        } else if (err instanceof SyntaxError) {
          setError(t('import.errors.SYNTAX_ERROR'));
        } else {
          setError(t('import.errors.READ_FAILED'));
        }
      }
    },
    [onImported, t, namingMode, eventType]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) void handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-4 relative">
      <SettingsControls className="absolute top-4 right-4" />
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white text-2xl mb-4 shadow-lg shadow-indigo-600/20">
            🪑
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">GuestSeat</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">{t('onboarding.tagline')}</p>
        </div>

        <div className="mb-6">
          <p className="text-center text-sm text-slate-500 dark:text-slate-400 mb-2.5">{t('onboarding.whatPlanning')}</p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {EVENT_TYPES.map((et) => {
              const active = et.id === eventType;
              return (
                <button
                  key={et.id}
                  type="button"
                  onClick={() => setEventType(et.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  <span aria-hidden>{et.emoji}</span>
                  {t(et.labelKey)}
                </button>
              );
            })}
          </div>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors bg-white dark:bg-slate-900 ${
            isDragging
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
              : 'border-slate-300 dark:border-slate-700'
          }`}
        >
          <p className="text-slate-600 dark:text-slate-300 mb-4">
            {t('onboarding.dropHint', { ext: '.json / .csv' })}
          </p>

          <div
            className="inline-flex items-center gap-2 mb-4 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-slate-400">{t('onboarding.tableNaming')}:</span>
            <div className="inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                onClick={() => setNamingMode('letters')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  namingMode === 'letters'
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t('onboarding.namingLetters')}
              </button>
              <button
                onClick={() => setNamingMode('numbers')}
                className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                  namingMode === 'numbers'
                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {t('onboarding.namingNumbers')}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition-colors"
            >
              {t('onboarding.chooseFile')}
            </button>
            <button
              onClick={() => onStartBlank(eventType)}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {t('onboarding.startBlank')}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,text/csv,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {error && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={onLoadDemo}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors"
          >
            ✨ {t('onboarding.tryDemo')}
          </button>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">{t('onboarding.tryDemoHint')}</p>
        </div>
      </div>
    </div>
  );
}
