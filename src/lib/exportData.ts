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
 * A print-ready seating list, styled to echo the physical invitation. Every A4 page sits
 * inside a cream sheet with a gold double frame. The first page opens with a full-width
 * header — the event title, the couple's names, the venue and date, a summary and a QR code
 * that opens the live list on a phone — and the seating list then flows underneath it through
 * three columns, continuing onto further (header-less) framed pages as needed.
 */
export async function exportAsPdf(state: EventState, t: Translator, lang: Language): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const details = state.details ?? {};
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Palette echoing the invitation: warm cream sheet, gold hairlines, serif ink.
  const ink: [number, number, number] = [51, 51, 51];
  const muted: [number, number, number] = [120, 120, 120];
  const body: [number, number, number] = [60, 55, 45];
  const gold: [number, number, number] = [176, 141, 87];
  const goldSoft: [number, number, number] = [206, 183, 142];
  const cream: [number, number, number] = [250, 247, 241];

  // Full-width layout: a framed cream sheet with three flowing columns beneath the header.
  const frameOuter = 8;
  const frameInner = 10;
  const marginX = 15;
  const contentWidth = pageWidth - marginX * 2;
  const columnCount = 3;
  const gap = 6;
  const columnWidth = (contentWidth - gap * (columnCount - 1)) / columnCount;
  const topLimit = frameInner + 6;
  const bottomLimit = pageHeight - frameInner - 5;

  // Draw the cream sheet and its gold double frame. Runs on every page so continuation pages
  // keep the same look as the first.
  const drawFrame = () => {
    doc.setFillColor(...cream);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.8);
    doc.roundedRect(frameOuter, frameOuter, pageWidth - frameOuter * 2, pageHeight - frameOuter * 2, 4, 4, 'S');
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.2);
    doc.roundedRect(frameInner, frameInner, pageWidth - frameInner * 2, pageHeight - frameInner * 2, 3, 3, 'S');
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

  const names = [details.brideName?.trim(), details.groomName?.trim()].filter(Boolean) as string[];

  // Per-column flow cursors; a column is "full" once it reaches the bottom limit.
  const columnY: number[] = new Array(columnCount).fill(topLimit);
  const colX = (i: number) => marginX + i * (columnWidth + gap);
  const pickColumn = () => columnY.indexOf(Math.min(...columnY));

  // A compact running header for continuation pages: the event title (with the couple's
  // names alongside) and a gold rule, so every page is clearly identified. Returns the y at
  // which the columns should resume beneath it.
  const drawRunningHeader = (): number => {
    let ry = frameInner + 6;
    const titleLines = doc.splitTextToSize(state.eventName, contentWidth * (names.length ? 0.62 : 1)) as string[];
    if (names.length) {
      doc.setFont('times', 'italic');
      doc.setFontSize(11);
      doc.setTextColor(...ink);
      doc.text(names.join('  &  '), pageWidth - marginX, ry + 5, { align: 'right', maxWidth: contentWidth * 0.34 });
    }
    doc.setFont('times', 'normal');
    doc.setFontSize(15);
    doc.setTextColor(...gold);
    for (const line of titleLines) {
      doc.text(line, marginX, ry + 5);
      ry += 6.5;
    }
    ry += 1.5;
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.4);
    doc.line(marginX, ry, pageWidth - marginX, ry);
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.12);
    doc.line(marginX, ry + 0.7, pageWidth - marginX, ry + 0.7);
    return ry + 5;
  };

  const newPage = () => {
    doc.addPage();
    drawFrame();
    columnY.fill(drawRunningHeader());
  };

  // ---- Page 1 header (full width) --------------------------------------------------------
  drawFrame();

  // QR code, top-right inside the frame, so the title can run along the left.
  let qrBottom = frameInner + 6;
  if (shareQr) {
    const qr = 22;
    const qrX = pageWidth - marginX - qr;
    const qrY = frameInner + 6;
    doc.addImage(shareQr, 'PNG', qrX, qrY, qr, qr);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...muted);
    doc.text(t('share.scanToOpen'), qrX + qr / 2, qrY + qr + 2.6, { align: 'center' });
    qrBottom = qrY + qr + 4;
  }

  // Header text runs left-aligned, kept clear of the QR block on the right.
  const textMaxWidth = contentWidth - (shareQr ? 30 : 0);
  let hy = frameInner + 8;

  doc.setFont('times', 'normal');
  doc.setFontSize(22);
  doc.setTextColor(...gold);
  for (const line of doc.splitTextToSize(state.eventName, textMaxWidth) as string[]) {
    doc.text(line, marginX, hy + 6);
    hy += 8.5;
  }
  hy += 1;

  if (names.length) {
    doc.setFont('times', 'italic');
    doc.setFontSize(12.5);
    doc.setTextColor(...ink);
    doc.text(names.join('  &  '), marginX, hy + 4, { maxWidth: textMaxWidth });
    hy += 7;
  }

  const dateStr = details.date ? formatEventDate(details.date, lang) : '';
  const whenLine = [dateStr, details.time?.trim()].filter(Boolean).join(' · ');
  const whereLine = [details.venue?.trim(), details.address?.trim()].filter(Boolean).join(', ');
  const metaLine = [whereLine, whenLine].filter(Boolean).join('   ·   ');
  if (metaLine) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    for (const line of doc.splitTextToSize(metaLine, textMaxWidth) as string[]) {
      doc.text(line, marginX, hy + 3.6);
      hy += 4.8;
    }
    hy += 1;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...muted);
  doc.text(
    t('export.summary', { guests: state.guests.length, tables: tables.length, date: new Date().toLocaleDateString() }),
    marginX,
    hy + 3
  );
  hy += 3.8;
  if (hasRsvp) {
    doc.text(
      t('export.rsvpSummary', {
        confirmed: confirmedTotal,
        declined: declinedTotal,
        pending: state.guests.length - confirmedTotal - declinedTotal,
      }),
      marginX,
      hy + 3
    );
    hy += 3.8;
  }

  // Gold double rule closing the header, then columns start below the taller of text / QR.
  const headerBottom = Math.max(hy + 3.5, qrBottom);
  doc.setDrawColor(...gold);
  doc.setLineWidth(0.5);
  doc.line(marginX, headerBottom, pageWidth - marginX, headerBottom);
  doc.setDrawColor(...goldSoft);
  doc.setLineWidth(0.15);
  doc.line(marginX, headerBottom + 0.8, pageWidth - marginX, headerBottom + 0.8);
  columnY.fill(headerBottom + 6);

  // ---- Section headings & table blocks ---------------------------------------------------
  const drawSectionHeading = (label: string) => {
    // A section heading spans all columns. If it (plus a little of its first block) can't fit
    // on the current page, start a fresh one so the title never dangles alone at the foot.
    let sy = Math.max(...columnY);
    if (sy + 14 > bottomLimit) {
      newPage();
      sy = columnY[0];
    }
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...gold);
    doc.text(label.toUpperCase(), marginX, sy + 4);
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.3);
    doc.line(marginX, sy + 6, pageWidth - marginX, sy + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ink);
    columnY.fill(sy + 10);
  };

  const drawBlock = (heading: string, guests: Guest[]) => {
    const sorted = [...guests].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    // Measure the heading up front: long headings (e.g. tables with custom tags) wrap to
    // several lines, so the guest list must start below the last line, not a fixed offset.
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const headingLines = doc.splitTextToSize(heading, columnWidth) as string[];
    const headingLineHeight = 3.5;
    const headingHeight = 3 + (headingLines.length - 1) * headingLineHeight + 1.5;
    const estHeight = headingHeight + Math.max(sorted.length, 1) * 3.6 + 3;
    let colIndex = pickColumn();
    if (columnY[colIndex] + estHeight > bottomLimit) {
      newPage();
      colIndex = 0;
    }
    const x = colX(colIndex);
    const startY = columnY[colIndex];
    doc.setTextColor(...ink);
    doc.text(headingLines, x, startY + 3);
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: startY + headingHeight,
      margin: { left: x },
      tableWidth: columnWidth,
      head: [],
      body: sorted.length
        ? sorted.map((g, i) => {
            const marker = g.rsvp === 'declined' ? ` (${t('rsvp.declinedShort')})` : '';
            return [`${i + 1}. ${fullName(g)}${marker}${g.notes ? ` — ${g.notes}` : ''}`];
          })
        : [[t('export.noGuestsSeated')]],
      styles: { fontSize: 7.3, cellPadding: 0.7, textColor: body },
      theme: 'plain',
      showHead: false,
    });
    // @ts-expect-error autoTable attaches this at runtime
    columnY[colIndex] = doc.lastAutoTable.finalY + 4;
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
