import { useEffect, useMemo, useState } from 'react';
import type { Guest, RsvpStatus, Table, TableTag } from '../types';
import { useLanguage } from '../hooks/useLanguage';
import { tableDisplayName } from '../lib/tableDisplay';
import { TAG_COLORS } from '../lib/tagColors';
import { TableSelect } from './TableSelect';
import { ModalHeader } from './ModalHeader';

interface GuestEditorModalProps {
  guest: Guest;
  tables: Table[];
  tags: TableTag[];
  allGuests: Guest[];
  seatedCount: Map<string, number>;
  onSave: (patch: Partial<Guest>) => void;
  onDelete: () => void;
  onClose: () => void;
  onLink: (otherGuestId: string) => void;
  onUnlink: (otherGuestId: string) => void;
  onSeatGuest: (guestId: string, tableId: string | null) => void;
  /** Toggle a custom tag (group) on this guest. */
  onToggleTag: (tagId: string) => void;
  /** Create a brand-new tag and apply it to this guest. */
  onCreateTag: (label: string) => void;
}

function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
}

export function GuestEditorModal({
  guest,
  tables,
  tags,
  allGuests,
  seatedCount,
  onSave,
  onDelete,
  onClose,
  onLink,
  onUnlink,
  onSeatGuest,
  onToggleTag,
  onCreateTag,
}: GuestEditorModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(guest.name);
  const [surname, setSurname] = useState(guest.surname ?? '');
  const [notes, setNotes] = useState(guest.notes ?? '');
  const [tableId, setTableId] = useState<string>(guest.tableId ?? '');
  const [rsvp, setRsvp] = useState<RsvpStatus | undefined>(guest.rsvp);
  const [linkSearch, setLinkSearch] = useState('');
  const [tagDraft, setTagDraft] = useState('');

  const guestTagIds = guest.tagIds ?? [];
  const createTag = () => {
    const label = tagDraft.trim();
    if (!label) return;
    onCreateTag(label);
    setTagDraft('');
  };

  // Keep the table selector in sync when linking auto-seats this guest elsewhere.
  useEffect(() => {
    setTableId(guest.tableId ?? '');
  }, [guest.tableId]);

  const tableById = useMemo(() => new Map(tables.map((tb) => [tb.id, tb])), [tables]);
  const guestById = useMemo(() => new Map(allGuests.map((g) => [g.id, g])), [allGuests]);

  const linkedGuests = (guest.linkedGuestIds ?? [])
    .map((id) => guestById.get(id))
    .filter((g): g is Guest => g !== undefined)
    .sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const { linkResults, hasExcludedByTable } = useMemo(() => {
    const q = linkSearch.trim().toLowerCase();
    if (!q) return { linkResults: [] as Guest[], hasExcludedByTable: false };
    const linkedIds = new Set(guest.linkedGuestIds ?? []);
    const canLinkWith = (g: Guest) => guest.tableId == null || g.tableId == null || g.tableId === guest.tableId;
    const nameMatches = allGuests
      .filter((g) => g.id !== guest.id && !linkedIds.has(g.id))
      .filter((g) => `${g.name} ${g.surname ?? ''}`.toLowerCase().includes(q));
    const eligible = nameMatches.filter(canLinkWith).slice(0, 6);
    return { linkResults: eligible, hasExcludedByTable: eligible.length === 0 && nameMatches.length > 0 };
  }, [linkSearch, allGuests, guest.id, guest.linkedGuestIds, guest.tableId]);

  const save = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      surname: surname.trim() || undefined,
      notes: notes.trim() || undefined,
      tableId: tableId || null,
      rsvp,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-sm sm:px-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalHeader icon="🧑" title={t('guestEditor.title')} onClose={onClose} />

        <div className="overflow-y-auto p-6">
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.name')} <span className="text-red-500">*</span>
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.surname')} <span className="text-slate-400">({t('common.optional')})</span>
        </label>
        <input
          value={surname}
          onChange={(e) => setSurname(e.target.value)}
          className="w-full mb-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('rsvp.label')}</label>
        <div className="grid grid-cols-3 gap-1.5 mb-3">
          {(
            [
              { value: undefined, label: t('rsvp.pending'), active: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-white' },
              { value: 'confirmed', label: t('rsvp.confirmed'), active: 'bg-emerald-500 text-white' },
              { value: 'declined', label: t('rsvp.declined'), active: 'bg-red-500 text-white' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setRsvp(opt.value)}
              className={`px-2 py-2 rounded-lg text-xs font-medium transition-colors ${
                rsvp === opt.value
                  ? opt.active
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{t('guestEditor.table')}</label>
        <div className="mb-3">
          <TableSelect tables={tables} tags={tags} seatedCount={seatedCount} value={tableId} onChange={setTableId} />
        </div>

        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.notes')} <span className="text-slate-400">({t('common.optional')})</span>
        </label>
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('guestEditor.notesPlaceholder')}
          className="w-full mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
        />

        {/* Group tags — e.g. "Bride's family", "Groom's friends". Handy when many guests share one long table. */}
        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          {t('guestEditor.tags')}
        </label>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('guestEditor.tagsHint')}</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {tags.map((tag) => {
            const active = guestTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => onToggleTag(tag.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? TAG_COLORS[tag.color].chip + ' ring-1 ring-inset ring-current'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${TAG_COLORS[tag.color].dot}`} />
                {tag.label}
                {active && <span className="text-current">✓</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1.5 mb-4">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                createTag();
              }
            }}
            placeholder={t('tags.newTagPlaceholder')}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
          />
          <button
            type="button"
            onClick={createTag}
            disabled={!tagDraft.trim()}
            title={t('tags.createTag')}
            className="shrink-0 rounded-lg bg-indigo-600 text-white text-sm w-9 h-9 flex items-center justify-center hover:bg-indigo-500 disabled:opacity-40"
          >
            ＋
          </button>
        </div>

        <div className="mb-4 border-t border-slate-100 dark:border-slate-800 pt-3">
          <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            🔗 {t('guestEditor.linkedGuests')}
          </label>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t('guestEditor.linkedGuestsHint')}</p>

          {linkedGuests.length > 0 && (
            <ul className="space-y-1.5 mb-2">
              {linkedGuests.map((lg) => {
                const lgTable = lg.tableId ? tableById.get(lg.tableId) : undefined;
                const sameTable = tableId ? lg.tableId === tableId : lg.tableId === (guest.tableId ?? '');
                return (
                  <li
                    key={lg.id}
                    className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5"
                  >
                    <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                      {lgTable
                        ? t('guestEditor.linkedSeatedAt', { name: fullName(lg), table: tableDisplayName(lgTable, t) })
                        : t('guestEditor.linkedUnseated', { name: fullName(lg) })}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {!sameTable && (
                        <button
                          onClick={() => onSeatGuest(lg.id, tableId || null)}
                          className="text-[11px] font-medium px-2 py-1 rounded-md bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-900"
                        >
                          {t('guestEditor.seatTogether')}
                        </button>
                      )}
                      <button
                        onClick={() => onUnlink(lg.id)}
                        className="text-[11px] font-medium px-2 py-1 rounded-md text-slate-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-950/40"
                      >
                        {t('guestEditor.unlink')}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="relative">
            <input
              value={linkSearch}
              onChange={(e) => setLinkSearch(e.target.value)}
              placeholder={t('guestEditor.searchToLink')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white outline-none focus:border-indigo-400"
            />
            {linkSearch.trim() && (
              <div
                data-testid="link-search-results"
                className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-40 overflow-y-auto"
              >
                {linkResults.length === 0 && (
                  <p className="px-3 py-2 text-xs text-slate-400">
                    {hasExcludedByTable ? t('guestEditor.onlySameTableOrUnseated') : t('guestEditor.noMatches')}
                  </p>
                )}
                {linkResults.map((g) => (
                  <button
                    key={g.id}
                    data-testid="link-result"
                    onClick={() => {
                      onLink(g.id);
                      setLinkSearch('');
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    {fullName(g)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            onClick={onDelete}
            className="px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            {t('common.delete')}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={save}
              disabled={!name.trim()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500 disabled:opacity-40"
            >
              {t('common.save')}
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
