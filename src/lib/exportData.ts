import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EventState, Guest, Table, TableTag } from '../types';
import { tableDisplayName, type Translator } from './tableDisplay';
import { buildShareQr } from './qr';
import type { Language } from './i18n';

function downloadBlob(content: BlobPart, filename: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}

function sideLabel(table: Table | undefined, t: Translator): string {
  if (!table?.side) return '';
  return t(`tables.side.${table.side}`);
}

/** Labels of the custom tags applied to a table, in their defined order. */
function tagLabels(table: Table | undefined, tagsById: Map<string, TableTag>): string[] {
  if (!table?.tagIds) return [];
  return table.tagIds.map((id) => tagsById.get(id)?.label).filter((label): label is string => !!label);
}

function rsvpLabel(g: Guest, t: Translator): string {
  if (g.rsvp === 'confirmed') return t('rsvp.confirmed');
  if (g.rsvp === 'declined') return t('rsvp.declined');
  return t('rsvp.pending');
}

export function exportAsJson(state: EventState): void {
  downloadBlob(JSON.stringify(state, null, 2), `${slug(state.eventName)}-seating.json`, 'application/json');
}

export function exportAsCsv(state: EventState, t: Translator): void {
  const tableById = new Map(state.tables.map((tb) => [tb.id, tb]));
  const guestById = new Map(state.guests.map((g) => [g.id, g]));
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const header = [
    t('export.fields.name'),
    t('export.fields.surname'),
    t('export.fields.table'),
    t('export.fields.capacity'),
    t('export.fields.side'),
    t('export.fields.tags'),
    t('export.fields.rsvp'),
    t('export.fields.linkedWith'),
    t('export.fields.notes'),
  ];
  const rows = [...state.guests]
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map((g) => {
      const table = g.tableId ? tableById.get(g.tableId) : undefined;
      const linked = (g.linkedGuestIds ?? [])
        .map((id) => guestById.get(id))
        .filter((p): p is Guest => !!p)
        .map((p) => fullName(p))
        .join('; ');
      return [
        g.name,
        g.surname ?? '',
        g.tableId ? (table ? tableDisplayName(table, t) : t('export.fields.unknownTable')) : t('export.fields.unseated'),
        table ? String(table.capacity) : '',
        sideLabel(table, t),
        tagLabels(table, tagsById).join('; '),
        rsvpLabel(g, t),
        linked,
        g.notes ?? '',
      ];
    });
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  downloadBlob(csv, `${slug(state.eventName)}-seating.csv`, 'text/csv');
}

/**
 * A print-ready seating list, styled to echo the physical invitation: each A4 page is
 * divided into a 2×2 grid of cream, gold-framed "quarter cards", and the seating list
 * flows through them (top-left → top-right → bottom-left → bottom-right), continuing onto
 * further pages as needed. The first card carries the event title, a summary, and a QR code
 * that opens the live list on a phone.
 */
export async function exportAsPdf(state: EventState, t: Translator): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Palette echoing the invitation: warm cream cards, gold hairlines, serif ink.
  const ink: [number, number, number] = [51, 51, 51];
  const muted: [number, number, number] = [120, 120, 120];
  const body: [number, number, number] = [60, 55, 45];
  const gold: [number, number, number] = [176, 141, 87];
  const goldSoft: [number, number, number] = [206, 183, 142];
  const cream: [number, number, number] = [250, 247, 241];

  // 2×2 grid of quarter-page cards.
  const margin = 8;
  const gutter = 5;
  const pad = 5;
  const cardW = (pageWidth - margin * 2 - gutter) / 2;
  const cardH = (pageHeight - margin * 2 - gutter) / 2;
  const contentW = cardW - pad * 2;
  const cardRects = [
    { x: margin, y: margin },
    { x: margin + cardW + gutter, y: margin },
    { x: margin, y: margin + cardH + gutter },
    { x: margin + cardW + gutter, y: margin + cardH + gutter },
  ];

  const drawCardFrames = () => {
    for (const c of cardRects) {
      doc.setFillColor(...cream);
      doc.setDrawColor(...gold);
      doc.setLineWidth(0.5);
      doc.roundedRect(c.x, c.y, cardW, cardH, 2.5, 2.5, 'FD');
      doc.setDrawColor(...goldSoft);
      doc.setLineWidth(0.15);
      doc.roundedRect(c.x + 1.4, c.y + 1.4, cardW - 2.8, cardH - 2.8, 2, 2, 'S');
    }
  };

  // A QR code for the live share link, so anyone with the printout can scan to open the
  // seating list on their phone. Best-effort: omit it rather than failing the export.
  let shareQr: string | null = null;
  try {
    shareQr = (await buildShareQr(state)).dataUrl;
  } catch {
    shareQr = null;
  }

  const tables: Table[] = state.tables;
  const guestsByTable = new Map<string, Guest[]>();
  const unseated: Guest[] = [];
  for (const g of state.guests) {
    if (g.tableId && tables.some((tb) => tb.id === g.tableId)) {
      const list = guestsByTable.get(g.tableId) ?? [];
      list.push(g);
      guestsByTable.set(g.tableId, list);
    } else {
      unseated.push(g);
    }
  }

  const confirmedTotal = state.guests.filter((g) => g.rsvp === 'confirmed').length;
  const declinedTotal = state.guests.filter((g) => g.rsvp === 'declined').length;
  const hasRsvp = confirmedTotal > 0 || declinedTotal > 0;

  // Flow cursor: which card we're filling and how far down it we are.
  let card = 0;
  let y = 0;
  const contentX = () => cardRects[card].x + pad;
  const contentBottom = () => cardRects[card].y + cardH - pad;
  const advanceCard = () => {
    if (card >= cardRects.length - 1) {
      doc.addPage();
      drawCardFrames();
      card = 0;
    } else {
      card += 1;
    }
    y = cardRects[card].y + pad;
  };
  /** Move to the next card if `h` mm won't fit in the remaining height of the current one. */
  const ensure = (h: number) => {
    if (y + h > contentBottom()) advanceCard();
  };

  drawCardFrames();
  y = cardRects[0].y + pad;

  // Card header: title, gold rule, summary, and the QR code.
  const headCx = contentX() + contentW / 2;
  doc.setFont('times', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...gold);
  for (const line of doc.splitTextToSize(state.eventName, contentW) as string[]) {
    doc.text(line, headCx, y + 4, { align: 'center' });
    y += 5.4;
  }
  y += 1.5;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.4);
  doc.line(headCx - 14, y, headCx + 14, y);
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text(
    t('export.summary', { guests: state.guests.length, tables: tables.length, date: new Date().toLocaleDateString() }),
    headCx,
    y,
    { align: 'center' }
  );
  y += 3.4;
  if (hasRsvp) {
    doc.text(
      t('export.rsvpSummary', {
        confirmed: confirmedTotal,
        declined: declinedTotal,
        pending: state.guests.length - confirmedTotal - declinedTotal,
      }),
      headCx,
      y,
      { align: 'center' }
    );
    y += 3.4;
  }
  if (shareQr) {
    const qr = 20;
    doc.addImage(shareQr, 'PNG', headCx - qr / 2, y + 1, qr, qr);
    y += qr + 3;
    doc.setFontSize(6);
    doc.setTextColor(...muted);
    doc.text(t('share.scanToOpen'), headCx, y, { align: 'center' });
    y += 2;
  }
  y += 3;

  const drawSectionHeading = (label: string) => {
    // Reserve enough room that the heading lands on the same card as the start of its first
    // table block — otherwise a section title can dangle alone at the foot of a card.
    ensure(22);
    doc.setFont('times', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...gold);
    doc.text(label.toUpperCase(), contentX(), y + 3.5);
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.3);
    doc.line(contentX(), y + 5.4, contentX() + contentW, y + 5.4);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ink);
    y += 8.5;
  };

  const drawBlock = (heading: string, guests: Guest[]) => {
    const sorted = [...guests].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    // Measure the heading up front: long headings (e.g. tables with custom tags) wrap to
    // several lines, so the guest list must start below the last line, not a fixed offset.
    doc.setFontSize(7.6);
    doc.setFont('helvetica', 'bold');
    const headingLines = doc.splitTextToSize(heading, contentW) as string[];
    const headingLineHeight = 3.3;
    const headingHeight = 2.8 + (headingLines.length - 1) * headingLineHeight + 1.4;
    const estHeight = headingHeight + Math.max(sorted.length, 1) * 3.4 + 3;
    ensure(estHeight);
    const x = contentX();
    const startY = y;
    doc.setTextColor(...ink);
    doc.text(headingLines, x, startY + 2.8);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: startY + headingHeight,
      margin: { left: x },
      tableWidth: contentW,
      head: [],
      body: sorted.length
        ? sorted.map((g, i) => {
            const marker = g.rsvp === 'declined' ? ` (${t('rsvp.declinedShort')})` : '';
            return [`${i + 1}. ${fullName(g)}${marker}${g.notes ? ` — ${g.notes}` : ''}`];
          })
        : [[t('export.noGuestsSeated')]],
      styles: { fontSize: 7, cellPadding: 0.6, textColor: body },
      theme: 'plain',
      showHead: false,
    });
    // @ts-expect-error autoTable attaches this at runtime
    y = doc.lastAutoTable.finalY + 3;
  };

  const sortedTables = [...tables].sort((a, b) =>
    tableDisplayName(a, t).localeCompare(tableDisplayName(b, t), undefined, { numeric: true })
  );
  const sections: { label: string; tables: Table[] }[] = [
    { label: t('tables.filter.groom'), tables: sortedTables.filter((tb) => tb.side === 'groom') },
    { label: t('tables.filter.bride'), tables: sortedTables.filter((tb) => tb.side === 'bride') },
    { label: t('export.ungroupedHeading'), tables: sortedTables.filter((tb) => !tb.side) },
  ];

  for (const section of sections) {
    if (section.tables.length === 0) continue;
    drawSectionHeading(section.label);
    for (const table of section.tables) {
      const guests = guestsByTable.get(table.id) ?? [];
      const side = sideLabel(table, t);
      const tags = tagLabels(table, tagsById);
      const heading = `${tableDisplayName(table, t)}${side ? ` (${side})` : ''}${
        tags.length ? ` · ${tags.join(', ')}` : ''
      } — ${guests.length}/${table.capacity}`;
      drawBlock(heading, guests);
    }
  }

  if (unseated.length) {
    drawSectionHeading(t('unseated.title'));
    drawBlock(t('export.unseatedHeading', { count: unseated.length }), unseated);
  }

  doc.save(`${slug(state.eventName)}-seating.pdf`);
}

/** Format an ISO `YYYY-MM-DD` date into a long, localized, human string. */
function formatEventDate(iso: string, lang: Language): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  const locale = lang === 'sq' ? 'sq-AL' : 'en-US';
  try {
    return date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return date.toLocaleDateString();
  }
}

/**
 * A single-page, print-ready invitation for guests: bride & groom, date/time,
 * venue and location, the schedule, a personal note, and a QR code that opens
 * the live seating list on a phone. Every field is optional — the layout simply
 * skips whatever the couple hasn't filled in.
 */
export async function exportInvitationPdf(state: EventState, t: Translator, lang: Language): Promise<void> {
  const details = state.details ?? {};
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const cx = pageWidth / 2;

  const ink: [number, number, number] = [51, 51, 51];
  const muted: [number, number, number] = [120, 120, 120];
  const gold: [number, number, number] = [176, 141, 87];

  // Decorative double frame.
  const frame = 12;
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.8);
  doc.roundedRect(frame, frame, pageWidth - frame * 2, pageHeight - frame * 2, 4, 4);
  doc.setLineWidth(0.2);
  doc.roundedRect(frame + 2.5, frame + 2.5, pageWidth - (frame + 2.5) * 2, pageHeight - (frame + 2.5) * 2, 3, 3);

  const contentWidth = pageWidth - frame * 2 - 20;
  let y = frame + 22;

  const centered = (text: string, size: number, opts?: { font?: 'times' | 'helvetica'; style?: string; color?: [number, number, number]; gap?: number; lineHeight?: number }) => {
    const { font = 'times', style = 'normal', color = ink, gap = 6, lineHeight = size * 0.52 } = opts ?? {};
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, contentWidth) as string[];
    for (const line of lines) {
      doc.text(line, cx, y, { align: 'center' });
      y += lineHeight;
    }
    y += gap;
  };

  const rule = (width = 40) => {
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.4);
    doc.line(cx - width / 2, y, cx + width / 2, y);
    y += 8;
  };

  const hasNames = !!(details.brideName || details.groomName);

  centered(t('invitation.intro'), 10, { font: 'helvetica', color: muted, gap: 8, lineHeight: 4.5 });

  if (hasNames) {
    if (details.brideName) centered(details.brideName, 30, { gap: 2 });
    if (details.brideName && details.groomName) centered('&', 16, { color: gold, style: 'italic', gap: 2 });
    if (details.groomName) centered(details.groomName, 30, { gap: 6 });
  } else {
    centered(state.eventName, 26, { gap: 6 });
  }

  rule();

  if (details.date) {
    const dateStr = formatEventDate(details.date, lang);
    const withTime = details.time ? `${dateStr} · ${details.time}` : dateStr;
    centered(withTime, 13, { font: 'helvetica', gap: 3, lineHeight: 6 });
  } else if (details.time) {
    centered(details.time, 13, { font: 'helvetica', gap: 3, lineHeight: 6 });
  }

  if (details.venue) centered(details.venue, 14, { style: 'bold', gap: details.address ? 1 : 6 });
  if (details.address) centered(details.address, 10, { font: 'helvetica', color: muted, gap: 6, lineHeight: 5 });

  const agenda = (details.agenda ?? []).filter((a) => a.title.trim() || a.time?.trim());
  if (agenda.length) {
    rule(30);
    centered(t('invitation.scheduleHeading').toUpperCase(), 9, { font: 'helvetica', color: gold, gap: 5, lineHeight: 4 });
    for (const item of agenda) {
      const line = item.time?.trim() ? `${item.time.trim()}   ${item.title.trim()}` : item.title.trim();
      centered(line, 11, { font: 'helvetica', gap: 2.5, lineHeight: 5 });
    }
    y += 4;
  }

  if (details.invitationNote?.trim()) {
    rule(30);
    centered(details.invitationNote.trim(), 11.5, { style: 'italic', color: ink, gap: 6, lineHeight: 5.5 });
  }

  // A small gold flourish anchored toward the foot of the invitation. The seating-list QR
  // deliberately lives only on the seating list and the in-app share sheet, not here — an
  // invitation shouldn't expose the whole guest list to whoever it's handed to.
  const flourishY = Math.max(y + 6, pageHeight - frame - 16);
  doc.setFont('times', 'italic');
  doc.setFontSize(13);
  doc.setTextColor(...gold);
  doc.text('~', cx, flourishY, { align: 'center' });

  doc.save(`${slug(state.eventName)}-invitation.pdf`);
}
