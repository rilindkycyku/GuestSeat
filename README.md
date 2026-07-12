# GuestSeat

A web app for planning wedding (or any event) table seating from a guest-list JSON file.

## Features

- **Import** a guest list JSON — supports the "grouped by letter" shape (`{ "A": ["Name1", ...] }`), a flat array of names/objects, or a previously exported GuestSeat file (round-trip).
- **Onboarding**: if no data is loaded yet, the app prompts you to upload a JSON file, view an example, or download an example template.
- **Seating board**: drag guests from the unseated list onto tables (or back), with per-table capacity limits. Click a guest to edit their name/surname/notes or reassign their table from a dropdown.
- **Guests**: only a first name is required — surname is optional, and name is always the primary identifier.
- **Search**: filter by name, surname, or table name/number.
- **Invitation**: fill in bride & groom, venue, location, date/time, a schedule, and a message to guests, then download a print-ready **invitation PDF** styled after a classic gold-framed wedding card. The invitation deliberately carries no QR code — it shouldn't expose the whole guest list to whoever receives it.
- **Share & QR**: share the whole event via a link (no server — the state travels in the URL), or show a **QR code** guests can scan. Links use a compact, index-based encoding of the seating state, which is roughly 3× smaller than the raw JSON — enough to fit a ~200-guest list into a single QR code. The seating PDF carries this share QR; lists that still exceed a QR's capacity fall back to the copy-link option automatically.
- **Export**: JSON (full seating data, re-importable), PDF (printable seating chart — a gold-framed cream sheet that opens with a full-width header showing the couple's names, venue, date and a share QR code, with the seating list flowing beneath it in three columns), CSV (spreadsheet-friendly).
- **Persistence**: seating state is saved to `localStorage` automatically.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```
