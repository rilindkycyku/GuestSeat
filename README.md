# GuestSeat

A web app for planning wedding (or any event) table seating from a guest-list JSON file.

## Features

- **Import** a guest list JSON — supports the "grouped by letter" shape (`{ "A": ["Name1", ...] }`), a flat array of names/objects, or a previously exported GuestSeat file (round-trip).
- **Onboarding**: if no data is loaded yet, the app prompts you to upload a JSON file, view an example, or download an example template.
- **Seating board**: drag guests from the unseated list onto tables (or back), with per-table capacity limits. Click a guest to edit their name/surname/notes or reassign their table from a dropdown.
- **Guests**: only a first name is required — surname is optional, and name is always the primary identifier.
- **Search**: filter by name, surname, or table name/number.
- **Invitation**: fill in bride & groom, venue, location, date/time, a schedule, and a message to guests, then download a print-ready **invitation PDF** styled after a classic gold-framed wedding card. The invitation deliberately carries no QR code — it shouldn't expose the whole guest list to whoever receives it.
- **Share & QR**: share the whole event via a link (no server — the state travels in the URL), or show a **QR code** guests can scan. Links use a compact, index-based encoding of the seating state (roughly 3× smaller than the raw JSON), gzip-compressed and packed into a URL-safe base42 alphabet so the QR can use its high-capacity *alphanumeric* mode — enough to fit a ~500-guest list into a single QR code with no server. The seating PDF carries this share QR; the largest lists that still exceed a QR's capacity fall back automatically to sending the link — via the native share sheet, a one-tap WhatsApp button, or copy-to-clipboard.
- **Export**: JSON (full seating data, re-importable), PDF (printable seating chart — a gold-framed cream sheet where each part (groom, bride, unseated) begins on its own page under a full-width header showing the couple's names, venue, date and a share QR code, with each part's tables flowing in three columns so the parts can be printed separately), CSV (spreadsheet-friendly).
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
