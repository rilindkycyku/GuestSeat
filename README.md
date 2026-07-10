# GuestSeat

A web app for planning wedding (or any event) table seating from a guest-list JSON file.

## Features

- **Import** a guest list JSON — supports the "grouped by letter" shape (`{ "A": ["Name1", ...] }`), a flat array of names/objects, or a previously exported GuestSeat file (round-trip).
- **Onboarding**: if no data is loaded yet, the app prompts you to upload a JSON file, view an example, or download an example template.
- **Seating board**: drag guests from the unseated list onto tables (or back), with per-table capacity limits. Click a guest to edit their name/surname/notes or reassign their table from a dropdown.
- **Guests**: only a first name is required — surname is optional, and name is always the primary identifier.
- **Search**: filter by name, surname, or table name/number.
- **Export**: JSON (full seating data, re-importable), PDF (printable per-table seating chart), CSV (spreadsheet-friendly).
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
