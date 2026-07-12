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

export async function exportAsPdf(state: EventState, t: Translator): Promise<void> {
  const doc = new jsPDF();
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const marginTop = 10;
  const bottomLimit = pageHeight - 10;
  const columnCount = 3;
  const gap = 4;
  const columnWidth = (pageWidth - marginX * 2 - gap * (columnCount - 1)) / columnCount;

  // A QR code for the live share link, so anyone with the printout can scan to
  // open the seating list (and event details) on their phone. Best-effort: if it
  // can't be built we simply omit it rather than failing the whole export.
  let shareQr: string | null = null;
  try {
    shareQr = (await buildShareQr(state)).dataUrl;
  } catch {
    shareQr = null;
  }
  const qrSize = 20;

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

  doc.setFontSize(15);
  doc.text(state.eventName, marginX, marginTop + 5);
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(
    t('export.summary', {
      guests: state.guests.length,
      tables: tables.length,
      date: new Date().toLocaleDateString(),
    }),
    marginX,
    marginTop + 10
  );
  if (hasRsvp) {
    doc.text(
      t('export.rsvpSummary', {
        confirmed: confirmedTotal,
        declined: declinedTotal,
        pending: state.guests.length - confirmedTotal - declinedTotal,
      }),
      marginX,
      marginTop + 14.5
    );
  }
  doc.setTextColor(0);

  if (shareQr) {
    const qrX = pageWidth - marginX - qrSize;
    doc.addImage(shareQr, 'PNG', qrX, marginTop, qrSize, qrSize);
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(t('share.scanToOpen'), qrX + qrSize / 2, marginTop + qrSize + 2, { align: 'center' });
    doc.setTextColor(0);
  }

  const textBlockBottom = marginTop + (hasRsvp ? 20 : 16);
  const qrBlockBottom = shareQr ? marginTop + qrSize + 5 : 0;
  const columnY: number[] = new Array(columnCount).fill(Math.max(textBlockBottom, qrBlockBottom));

  const pickColumn = () => columnY.indexOf(Math.min(...columnY));

  const drawSectionHeading = (label: string, color: [number, number, number]) => {
    let y = Math.max(...columnY);
    if (y + 8 > bottomLimit) {
      doc.addPage();
      y = marginTop;
    }
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...color);
    doc.text(label, marginX, y + 4);
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
    columnY.fill(y + 9);
  };

  const drawBlock = (heading: string, guests: Guest[]) => {
    const sorted = [...guests].sort((a, b) => fullName(a).localeCompare(fullName(b)));
    // Measure the heading up front: long headings (e.g. tables with custom tags) wrap to
    // several lines, so the guest list must start below the last line, not a fixed offset.
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    const headingLines = doc.splitTextToSize(heading, columnWidth) as string[];
    const headingLineHeight = 3.6;
    const headingHeight = 3 + (headingLines.length - 1) * headingLineHeight + 1.5;
    const estHeight = headingHeight + 2.5 + Math.max(sorted.length, 1) * 3.7 + 3;
    let colIndex = pickColumn();
    if (columnY[colIndex] + estHeight > bottomLimit) {
      doc.addPage();
      columnY.fill(marginTop);
      colIndex = 0;
    }
    const x = marginX + colIndex * (columnWidth + gap);
    const startY = columnY[colIndex];
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
      styles: { fontSize: 7.3, cellPadding: 0.8, textColor: [40, 40, 40] },
      theme: 'plain',
      showHead: false,
    });
    // @ts-expect-error autoTable attaches this at runtime
    columnY[colIndex] = doc.lastAutoTable.finalY + 4;
  };

  const sortedTables = [...tables].sort((a, b) =>
    tableDisplayName(a, t).localeCompare(tableDisplayName(b, t), undefined, { numeric: true })
  );
  const sections: { label: string; color: [number, number, number]; tables: Table[] }[] = [
    { label: t('tables.filter.groom'), color: [37, 99, 235], tables: sortedTables.filter((tb) => tb.side === 'groom') },
    { label: t('tables.filter.bride'), color: [219, 39, 119], tables: sortedTables.filter((tb) => tb.side === 'bride') },
    { label: t('export.ungroupedHeading'), color: [79, 70, 229], tables: sortedTables.filter((tb) => !tb.side) },
  ];

  for (const section of sections) {
    if (section.tables.length === 0) continue;
    drawSectionHeading(section.label, section.color);
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
    drawSectionHeading(t('unseated.title'), [100, 116, 139]);
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

  // QR code + caption, anchored toward the bottom of the page.
  try {
    const { dataUrl } = await buildShareQr(state);
    const qrSize = 32;
    const qrY = Math.max(y + 4, pageHeight - frame - qrSize - 18);
    doc.addImage(dataUrl, 'PNG', cx - qrSize / 2, qrY, qrSize, qrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(t('invitation.qrCaption'), cx, qrY + qrSize + 5, { align: 'center' });
  } catch {
    // No network / compression support — invitation still prints without the QR.
  }

  doc.save(`${slug(state.eventName)}-invitation.pdf`);
}
