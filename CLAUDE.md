# CLAUDE.md

Guidance for AI assistants working in this repository. Read this before touching code.

## What this is

**GuestSeat** — a seating planner for weddings and other celebrations, and it is *entirely
client-side*. React 19 + TypeScript + Vite SPA, no backend of its own. Guests, tables, tags,
invitation details and every saved event live in the browser's **IndexedDB** (`guestseat`).

The only ways data leaves the browser are ones the user sets up or triggers themselves:

- **Share links and QR codes**, which carry the whole plan *inside the URL hash* — no server ever
  sees it (`lib/shareLink.ts`).
- **Sync** through a **Supabase project the user owns** (optional, off until connected).
- Exports the user asks for (JSON / PDF / place cards / Excel) and the whole-app backup file.

There is no GuestSeat server anywhere. **Never introduce one**, and never add a dependency that
phones home — the app is a PWA that must keep working with no signal at all, which is the normal
condition of a phone doing check-in at a venue.

The UI is **bilingual: English and Albanian**, switchable at runtime. Deployed as a static SPA.

## Commands

```bash
npm install
npm run dev        # vite
npm run build      # tsc -b && vite build — the typecheck is part of the build
npm run preview
npm run lint       # oxlint — must stay at 0 errors (2 pre-existing warnings)
npm test           # vitest run — 10 files, 157 tests, all green
npm run test:watch
npx tsc -b         # typecheck alone
```

Run `npx tsc -b`, `npm run lint` and `npm test` before committing — that is exactly what
`.github/workflows/ci.yml` runs on every branch and every PR, each step with `if: '!cancelled()'`
so one push reports every problem at once.

Note the linter is **oxlint**, not ESLint. Config is `.oxlintrc.json`; it is deliberately small
(`react/rules-of-hooks` as an error, `react/only-export-components` as a warning).

## House style

- **Comments and JSDoc explain *why*, at length.** This is the most distinctive thing about the
  codebase: most `lib/` modules open with a block comment that names the problem the design solves,
  usually including the failure it is there to prevent ("without one, the next sync would … and
  deleting anything would be impossible"). Match that when you add non-obvious code — write the
  reason, never a restatement of the line.
- **Commit messages are long-form narrative**, Albanian or English (both appear; recent work is
  often Albanian). A declarative subject with no prefix and no ticket id, then a body explaining the
  problem, the decision, and what stayed unchanged. Read `git log` before writing one.
- Identifiers, types and file names are **English**. Only user-facing copy is translated, and it
  lives in the dictionaries — never inline in JSX.

## Layout

```
src/
  App.tsx          The whole board: state, screens, and the DndContext. No router — which screen
                   is showing is state here, not a URL.
  main.tsx         Entry; ErrorBoundary + language/theme providers
  types/index.ts   Every domain type, heavily commented. Start here.
  components/      One file per dialog or piece of the board; components/sync/ for the sync UI
  hooks/           useEventState (the ledger), useSync, useBoardDnd, useDialog, useLanguage, …
  lib/             All logic. Pure where it can be — see below.
  lib/i18n/        en.ts, sq.ts, index.ts
  lib/sync/        The Supabase half: records, sync, schema, supabase, device, messages
promo/             Screenshots and marketing copy (promo/en/ for the English set)
```

### Key lib modules

| File | Role |
|---|---|
| `db.ts` | IndexedDB: the `events` store the app reads, plus the `records`/`deletions` shadow the cloud sees |
| `importGuests.ts` | Normalizes every accepted import shape into an `ImportResult`; validates rather than trusts |
| `importCsv.ts` | Bank-style CSV/spreadsheet guest import |
| `autoSeat.ts` | One-shot table filling that honours linked parties, keep-aparts and group tags |
| `findSeat.ts` | The guest-facing "type your name, see your table" lookup, plus `foldName` (accent/case folding) |
| `boardSearch.ts` | Filtering and grouping for the board itself |
| `shareLink.ts` | The URL-hash codec: compact array form → gzip → base42, with legacy markers still decoded |
| `qr.ts` | QR payload building on top of `shareLink` |
| `exportData.ts` | JSON / PDF / table cards / place cards / Excel |
| `invitationPdf.ts` | The printable invitation, in three designs |
| `backup.ts` | The whole-app backup file: every saved event, restored as Replace or Merge |
| `guide.ts` | Shape of the in-app guide (order, group, icon, which screen it opens) — copy lives in i18n |
| `keyboardDnd.ts` | Keyboard seating: pick up, move, drop |
| `linkGroups.ts` | Linked-guest party resolution |
| `tableDisplay.ts` / `tagColors.ts` | Table display names; tag color → Tailwind classes |
| `eventTypes.ts` / `demoEvent.ts` / `testFixtures.ts` | Per-event-type defaults, the demo list, shared test factories |
| `storage.ts` | localStorage — **UI preferences only** (collapsed tables, view mode, columns) |
| `sync/*` | See "Sync invariants" below |

## Architecture rules

### 1. An event is the unit the app reads; a record is the unit that syncs

`db.ts` keeps two views of the same data. `events` holds whole `EventState` objects and is what the
board reads and writes. `records` holds the same event *taken apart* — one row for the event's own
details, one per guest, one per table — and is what the cloud sees.

`putEvent` keeps them in step by **diffing**. Seating one guest rewrites the whole `EventState` in
React; without the diff every save would mark all 300 guests changed and push them.

Never write to `records` from the app side directly, and never make the event the unit of sync — the
whole point is that a phone doing check-in at the venue and a laptop moving guests around both keep
their edits.

### 2. Sync invariants (the easiest place to lose someone's work)

Read the header comments of `lib/sync/sync.ts`, `lib/db.ts` and `lib/sync/schema.ts` before changing
anything here.

- Every local change is flagged **`pending`** — "not sent yet" — and stays flagged until the cloud
  accepts it. `db.ts` sets it; `sync.ts` clears it. A flag, not a date comparison, because a phone
  whose clock is an hour off still knows perfectly well *that* it changed something.
- `updatedAt` is the **server's** clock once a record has been through the cloud, read back from the
  push. Two devices are never compared through two different clocks.
- Deletions leave **tombstones** in the `deletions` store, and a tombstone travels like any other
  change. Never hard-delete a synced record — without the tombstone the next pull downloads it
  straight back.
- Conflict rule: **last device to sync wins, per record** — per guest, per table, per event name.
- **Except on a newly connected device's first sync**, which pushes nothing until the user has been
  shown what is in the cloud and has chosen what should happen to it (`connectSummary`, `MODES`).
- Every pushed row is stamped with the device that pushed it (`sync/device.ts`); the account can't
  say, since the same email is signed in everywhere.
- The cloud side is **one table**, `guestseat_records`, of `(kind, record_id, updated_at, deleted,
  data jsonb)`. Adding a field to a guest therefore needs no migration in anybody's own project.
- `sync/schema.ts` migrations are **append-only, idempotent and additive**. A shipped migration has
  already run on other people's databases — fix a mistake by adding the next number, never by
  editing one. Removing a column ships as two releases (stop writing it, then drop it).
- A Supabase project may be **shared with another app**, so sign-up sends an explicit `redirect_to`
  rather than relying on the project's single Site URL.

### 3. Share links must stay small enough to scan

`shareLink.ts` earns its size. State is re-serialized to a compact array form (ids dropped for
indices, field names stripped), gzipped where `CompressionStream` exists, then encoded with
**base42** — an alphabet inside QR's *alphanumeric* set, which buys ~45% more capacity than byte
mode and is what fits a ~500-guest list into one scannable code.

- Payload markers are the first character (`A`, `B` current; `z`, `c`, `u` legacy). **Keep decoding
  the legacy ones** — links already shared must not break.
- Everything rides in the **hash**, never the query string, so it never reaches a server.
- A guest link carries the `f` flag and opens read-only find-your-seat: nothing saved, nothing
  editable, and no names shown until someone types one.

### 4. Copy is translated, never inline

- Text lives in `lib/i18n/en.ts` and `sq.ts`. `TranslationDict = typeof en`, so **`en.ts` is the
  schema** — `sq.ts` is type-checked against it and `tsc -b` fails on a missing key.
- Lookup falls back to English per key, so a key added to `en` but not yet translated shows in
  English instead of vanishing.
- Three readers: `t()` for strings, `tList()` for lists (guide bullets), `tSteps()` for
  title-and-body objects.
- Structural data — the guide's order and grouping, event-type defaults — stays in `lib/`, testable
  and separate from the words.

### 5. UI conventions

- **Tailwind v4** via `@tailwindcss/vite`; there is no `tailwind.config.js`. Dark mode is the
  `@custom-variant dark (&:where(.dark, .dark *))` declared in `src/index.css` — a class on the
  root, not the media query.
- Tailwind class names must be **complete literal strings** so the scanner sees them. That's why
  `tagColors.ts` is a lookup table of full class strings rather than interpolation; resolve through
  its accessor so an unknown color from an old file degrades to a default instead of throwing the
  page blank.
- **Every dialog goes through `ModalShell`**, which supplies the backdrop, the bottom-sheet-on-phone
  panel, and the dialog semantics from `useDialog` (focus in, focus back, Tab trapped, Escape closes
  only the topmost). Use `useDialog` directly only for a full-screen overlay with its own layout.
- No `window.alert` / `confirm` — use `ConfirmModal`.
- Drag and drop is `@dnd-kit`; **every drag interaction must also work from the keyboard** through
  `keyboardDnd.ts` (Space picks up, arrows move, Space seats, Esc cancels).
- Icons are inline SVG in components; there is no icon library dependency.

### 6. Persistence rules

- Guest and table data belongs in **IndexedDB**. `storage.ts` is localStorage and holds *only* small
  UI preferences — putting event data there is what the app moved away from.
- Bumping `DB_VERSION` (currently 3) needs an `onupgradeneeded` branch that is safe from every
  older version, and an upgrade blocked by another open tab is surfaced through `onDbBlocked`, not
  treated as an error.

## Data model

`src/types/index.ts` is the reference and is commented field by field. In outline:

- `Guest`: `name` (the only required field — a guest may have no surname), `surname`, `notes`,
  `group`, `tableId`, `linkedGuestIds[]` (must sit together), `apartGuestIds[]` (must not),
  `tagIds[]`, `rsvp`, `meal`, `arrived`.
- `Table`: `name`, `capacity`, `side` (`groom|bride`), `shape` (`round|long`), `tagIds[]`,
  `autoSuffix` (set while the name is auto-generated, cleared the moment the user renames it).
- `TableTag`: `label` + a `TagColor` from the fixed palette.
- `EventDetails`: everything the invitation prints — `eventType`, honoree names, venue, address,
  date, time, `agenda[]`, messages, dress code, RSVP phone, `invitationTemplate`.
- `EventState`: `eventName`, `guests`, `tables`, `tags`, `details`, `updatedAt`.
- `ImportShape` / `ImportGuestEntry` / `ImportResult`: the import boundary. Fields a hand-edited or
  third-party file could get wrong are typed `unknown` on purpose — validate, don't trust.

Two rules the types encode:

- **Linked and kept-apart are always mutual.** Writing one side means writing the other.
- **Optional means backward compatible.** An absent `eventType` is a wedding, an absent `shape` is
  round, an absent `rsvp` is "no answer yet" — that's how events saved by older versions keep
  working. Add new fields optional.
- A GuestSeat JSON export re-imported must **round-trip** without losing a field. Adding a field to
  the model means teaching both `exportData.ts` and `importGuests.ts` about it.

## Testing

- Vitest, `environment: 'node'`, config in its own `vitest.config.ts` (the app config loads the PWA
  plugin and Tailwind, which no unit test needs).
- `include` is **`src/**/*.test.ts`** — only `.ts`. A test written as `.tsx` will not run.
- Everything tested is pure: `autoSeat`, `backup`, `boardSearch`, `findSeat`, `guide`, `importCsv`,
  `importGuests`, `keyboardDnd`, `shareLink`, `sync/sync`.
- Shared factories live in `lib/testFixtures.ts` — use them rather than hand-building state.
- New logic in `lib/` is expected to arrive with tests. Components are not unit-tested — verify
  those in the browser and say so in the commit body.

## Releases

`package.json` `version` is the single source of truth. `vite.config.ts` injects it as
`__APP_VERSION__` (declared in `src/globals.d.ts`) and `Credits.tsx` shows it, so the footer can
never drift from the tag.

When a change is user-visible:

1. Bump `version` — minor for a new capability, patch folded into the release it belongs to.
2. Add the entry at the top of `CHANGELOG.md`. It is grouped by **what shipped**, not by PR: a
   short title line, then bolded lead-ins explaining what changed and why, with the PR numbers the
   release covers listed so the history stays checkable.
3. Update `README.md` if the feature table or the sync/privacy story changed.

## Gotchas

- **Offline is a feature.** The service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`)
  precaches JS/CSS/HTML/SVG/PNG/ICO/JSON and falls back to `index.html` for navigations. A runtime
  fetch to a third party breaks that and the privacy promise at once.
- **A name is the identifier, not a surname.** Anything that assumes both exist is a bug.
- Seating a kept-apart pair together **by hand** is allowed and flagged; auto-seating refuses it.
  Don't turn the flag into a block.
- Auto-seat must stay **one undoable step**, and must report *who* was left out and why, grouped by
  family — a bare count tells nobody what to fix.
- The invitation carries **no QR code** on purpose: it goes to guests, and the plan link exposes the
  whole list.
- Screenshots in `promo/` use the built-in demo list; never commit real guest data.
