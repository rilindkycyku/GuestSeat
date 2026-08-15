# Changelog

Versions are grouped by **what shipped**, not by how many pull requests it took — several features
here landed over five or six PRs of iteration, and a few PRs were pure fixes. Each entry lists the
PRs it covers so the number stays checkable against the history.

`1.0` is the app's first working release. Every capability added since bumps the minor; fixes are
folded into the release they belong to.

---

## 1.16.0

A guide, so the app explains itself.

- **"How it works", inside the app.** Thirteen sections — starting out, importing a list, seating by
  hand and by keyboard, what a guest can carry, tables, auto-seating, the invitation, sharing,
  check-in, printing, backups, sync, and where the data actually lives — in both languages, closed
  until asked for, because a guide that unfolds all at once is a manual and manuals do not get read.
  Reachable from Settings, from the drawer, and from the very first screen, before anyone has any
  data of their own to risk.
- **It opens where you got stuck.** The sync panel's own "how this works" lands *on* the sync
  section, scrolled to it, rather than at the top of a wall of text.
- The same walkthrough is now in the README for anyone reading on GitHub.

## 1.15.0

The two answers to "where does this list exist besides this browser?" — a file you keep, and a cloud
copy that keeps itself.

- **Sync across your devices, through a project you own.** GuestSeat still has no server: you bring
  your own Supabase project, and the events travel through *your* database. Setup is a script the app
  opens in your own SQL editor (the key a browser holds can create rows, never a table — that is
  protection, not a gap), and from then on the phone and the laptop keep each other in step by
  themselves: on open, a few seconds after any change, when the tab comes back, when the device comes
  back online.
- **A new device can't overwrite an evening's work.** As soon as it connects it only *reads*, and
  shows how much each side holds; until you choose — keep both, take the project's copy, or send this
  device up — nothing goes up. The two destructive directions ask for a word to be typed.
- **It merges per guest, not per event.** A wedding travels as rows — one for the event, one for
  each guest, one for each table — so adding a guest on the laptop while someone checks people in on
  a phone at the door keeps both. Only two devices editing the same guest can collide, and then the
  later sync wins. A save sends only what changed: seating one guest rewrites the whole event in the
  app, and the diff turns that back into one row.
- Nothing is discarded before it has been sent, so a phone with a wrong clock keeps its edits.
  Deletions travel as tombstones rather than being downloaded straight back, and deleting an event
  tombstones every row it was made of. Once a day the two sides are counted, and a cloud copy that
  turns out to be short is repaired.
- **Which device did that.** Every row carries the device that wrote it, and the panel lists your
  devices and the project's recent changes — with one email signed in everywhere, that is the only
  question the data itself cannot answer.
- **A backup file with every event in it.** The board's JSON export writes the event that happens to
  be open; this writes them all, with their ids. Restoring puts the browser back to what the file
  says, and *Add from file* only brings in what isn't here — so an old backup can't undo newer work.
  Persistent storage can be requested from the same screen, which is what keeps Safari from clearing
  a site left unvisited for a week.
- Tests: 55 more, covering taking an event apart and putting it back together, the save diff, the
  merge rules, the row shapes, key and project-address validation, and the backup file in both
  directions. The whole loop was also driven end to end in two real browsers against a stand-in
  Supabase: two devices editing the same wedding at the same time both keep their work.

## 1.14.0

The two screens where a mistake costs the most: the guest's own lookup, and the buttons that
rewrite the whole list.

- **A guest can tell which row is theirs.** Two cousins called Butrinti used to produce two
  identical cards. Each result now carries what the planner already recorded about who a guest
  belongs to — their group tags, the people they're linked to, the table's side, their meal — and
  cards that still share a name say how many namesakes there are, including the common case where
  they all sit at one table and the choice doesn't matter. Notes stay off the screen: they hold
  dietary needs written for the host, not for a phone held up at the door.
- **The lookup survives a phone keyboard.** "Kycyku" finds "Kyçyku", name and surname can be typed
  in either order, and a fully typed name outranks someone who merely contains it. Too many matches
  now asks for a surname instead of quietly cutting the list.
- **Whole-list actions ask twice.** Unseating everyone, resetting every RSVP, wiping the arrivals
  and deleting an event now take a second, deliberate confirmation that states the damage in
  numbers — how many guests, how many tables — and puts the keyboard on Cancel, so a held Enter
  can't carry anyone through both steps.
- Tests: 15 more, covering the guest lookup's matching, ranking and same-name handling.

## 1.13.0

Data fidelity, accessibility, and the parts of the plan that face guests.

- **Nothing is lost in transit.** The JSON export writes the whole state, but re-importing read back
  only names, notes and links — RSVP, meal, arrival, guest tags, table shape, the tag palette and the
  entire invitation were dropped. Share links had the same hole. Both now carry everything, with the
  link's new fields appended so older installs still open new links.
- **The board works without a mouse.** Space picks a guest up, arrow keys hop between tables, Space
  seats them, Escape cancels — with screen-reader announcements in Albanian and English.
- **Dialogs behave like dialogs.** All eleven announce themselves, trap focus, hand focus back to
  whatever opened them, and close on Escape (topmost only).
- **Keep apart.** Guests who must not share a table, honoured by auto-seating and flagged — not
  blocked — when you override it by hand. Auto-seating also reports *who* it couldn't place and why.
- **Find your seat.** A guest QR opens a read-only "type your name, see your table" lookup.
- **Place cards** — folded tent cards, one per guest, four to a page — and the board now prints.
- Tests (74) and CI covering the share-link codec, importers, auto-seating and board search.

## 1.12.0

Day-of and finishing touches. Check-in arrivals in the overview, printable cut-out table cards with
readable names and an event header, and the "Developed by" credits across every screen.
<sub>#49, #50, #51, #52 · docs #53, #54</sub>

## 1.11.0

Many events at once. IndexedDB replaces the single-event localStorage store, with an event picker,
per-event rename/delete, and a one-time migration of an existing list. <sub>#48</sub>

## 1.10.0

Albanian traditions on the invitation (send-off, çifteli, sofra glyphs and a full traditional
program), drag-to-reorder schedule, duplicate table, and the synetia event type.
<sub>#44, #45, #47</sub>

## 1.9.0

Event details became their own screen instead of living inside the invitation editor; Settings
redesigned around it; "Add to Home Screen"; `/` and ⌘K to search; jsPDF moved off the initial load.
<sub>#36, #39, #40, #43</sub>

## 1.8.0

Long banquet ("imperial") tables, and per-guest group tags so groups sharing one long table stay
distinguishable. Styled table picker with tag chips. <sub>#31, #33, #35, #37, #38</sub>

## 1.7.0

A clean start: the bundled 198-guest list removed, replaced by a one-click demo and "start blank".
<sub>#27, #28, #30</sub>

## 1.6.0

Export overhaul: a styled Excel workbook, and the seating chart redrawn as gold quarter-cards.
<sub>#21, #26 · fixes #42</sub>

## 1.5.0

The guest invitation PDF: three designs, event details, and a schedule of vector icons that wraps
to a second row, with a proper time picker. <sub>#20, #22, #29, #32, #34</sub>

## 1.4.0

Sharing with no server. The whole plan travels in a URL, with a native share sheet and a QR code
that fits roughly 500 guests. Albanian became the default language. <sub>#18, #24, #25</sub>

## 1.3.0

Custom tags for tables, with Groom and Bride folded into the same list as built-in tags, and tags
carried into the exports. <sub>#12, #13, #17 · fixes #19</sub>

## 1.2.0

The floor-plan view, a settings panel with bulk actions, a mobile overhaul (two tables per row,
readable names under every table), themed dialogs in place of native prompts, and capacity steppers.
<sub>#9, #10, #11, #14, #15, #16</sub>

## 1.1.0

Per-guest RSVP (coming / not coming) and an offline-ready service worker. <sub>#7, #8</sub>

## 1.0.0

GuestSeat: import a guest list, arrange tables, drag guests into seats. Letter or number table
naming, groom/bride sides, linked guests who stay together, dark mode, Albanian and English,
installable as a PWA, and a round-trippable CSV. <sub>#1–#6</sub>
