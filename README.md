# GuestSeat 🪑💍

![GuestSeat — seating board](promo/en/screenshots/02-board-list.png)

**GuestSeat** is a web app for planning wedding (or any event) table seating from a guest-list JSON file. Drag guests onto tables, build a print-ready invitation, and share the whole plan with a QR code — no server, the entire list travels inside the link. It runs fully offline, right in your browser.

🔗 **Live:** [**guestseat.rilindkycyku.dev**](https://guestseat.rilindkycyku.dev)

> All screenshots use the built-in **demo list** (Elira & Arben — Demo Wedding), so no real guest data is shown.

---

## ✨ Features

| Feature | Description |
| :--- | :--- |
| **📥 Import** | Load a guest list JSON — the "grouped by letter" shape (`{ "A": ["Name1", ...] }`), a flat array of names/objects, or a previously exported GuestSeat file (round-trip). |
| **🚀 Onboarding** | If no data is loaded yet, the app prompts you to upload a JSON file, view an example, or download an example template. |
| **🪑 Seating board** | Drag guests from the unseated list onto tables (or back), with per-table capacity limits. Click a guest to edit their name/surname/notes or reassign their table from a dropdown. Fully keyboard-operable: <kbd>Space</kbd> picks a guest up, arrow keys move between tables, <kbd>Space</kbd> seats them, <kbd>Esc</kbd> cancels. |
| **👤 Guests** | Only a first name is required — surname is optional, and the name is always the primary identifier. Guests can be **linked** (must sit together) or **kept apart** (must not share a table); auto-seating honours both, and seating a kept-apart pair together by hand is flagged rather than blocked. |
| **✨ Auto-seat** | Fills the tables in one undoable step, keeping linked parties together, feuding guests apart, and clustering by group tag. When someone can't be placed it says who, grouped by family, and whether the problem was space or a keep-apart. |
| **🔎 Search** | Filter by name, surname, or table name/number. |
| **💌 Invitation** | Fill in bride & groom, venue, location, date/time, a schedule and a message, then download a print-ready **invitation PDF** in three designs — **Classic**, **Modern** or **Romantic**. The schedule is illustrated with vector icons matched by keyword. No QR code on the invitation — it shouldn't expose the whole guest list to whoever receives it. |
| **📱 Share & QR** | Share the whole event via a link (no server — the state lives in the URL), or show a **QR code** guests can scan. A compact index-based, gzip-compressed, base42-packed encoding fits a ~500-guest list into a single QR; larger lists fall back to the native share sheet, a one-tap WhatsApp button, or copy-to-clipboard. |
| **🔎 Find your seat** | The QR comes in two flavours: the full plan (for a co-planner) or a **guest link** that opens a read-only "type your name, see your table" lookup — nothing saved, nothing editable, and no names listed until someone types. |
| **📤 Export** | **JSON** (full, re-importable — every field round-trips), **PDF** (a gold-framed cream seating chart with per-part pages, a share QR and a branded footer), **table cards** and **place cards** (folded tent cards, one per guest, four to a page), and **Excel** (`.xlsx`) — a styled charcoal-and-gold ExcelJS workbook with *Guests* and *Tables* sheets. The board itself also prints cleanly with <kbd>Ctrl</kbd>+<kbd>P</kbd>. |
| **💾 Persistence** | Every event is saved automatically to **IndexedDB**, so a planner can keep several events side by side and reopen the last one they had open. Lists saved by older versions are migrated from `localStorage` on first run. |

---

## 📸 Screenshots

| Onboarding | Seating board |
| :---: | :---: |
| ![Onboarding](promo/en/screenshots/01-onboarding.png) | ![Seating board](promo/en/screenshots/02-board-list.png) |
| **Floor plan** | **Guest editor** |
| ![Floor plan](promo/en/screenshots/03-floor-plan.png) | ![Guest editor](promo/en/screenshots/09-guest-editor.png) |
| **Invitation** | **QR share** |
| ![Invitation](promo/en/screenshots/05-invitation.png) | ![QR share](promo/en/screenshots/06-qr-share.png) |
| **Overview & stats** | **Export menu** |
| ![Overview & stats](promo/en/screenshots/08-overview-stats.png) | ![Export menu](promo/en/screenshots/04-export-menu.png) |
| **Settings** | **Dark mode** |
| ![Settings](promo/en/screenshots/07-settings.png) | ![Dark mode](promo/en/screenshots/10-board-dark.png) |

### 📱 On mobile

![GuestSeat on mobile](promo/en/guestseat-mobile.png)

### 📄 Exports

The real, print-ready invitation and seating-chart PDFs:

![GuestSeat PDF exports](promo/en/guestseat-exports.png)

---

## 🛠️ Development

```bash
npm install
npm run dev
```

## 🔢 Versioning

The version shown in the app's footer lives only in `package.json` and is injected at build time
(`__APP_VERSION__`), so it can't drift from the number a release is tagged with.

`1.0` was the first working release; every merged pull request since bumps the **minor**, which makes
the number checkable against the history at any time:

```bash
git log --merges --oneline main | grep -c 'pull request'   # merged PRs = the minor
```

## ✅ Tests & checks

```bash
npm test        # Vitest — share-link codec, importers, auto-seating, board search
npm run lint    # oxlint
npx tsc -b      # typecheck
```

CI runs all four (typecheck, lint, tests, build) on every push and pull request.

## 📦 Build

```bash
npm run build
npm run preview
```

---

*Made with ❤️ by [Rilind Kyçyku](https://github.com/rilindkycyku)*
