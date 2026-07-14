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

export function fullName(g: Guest): string {
  return g.surname ? `${g.name} ${g.surname}` : g.name;
}

export function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'event';
}

/** The app name stamped onto every export, so a printed sheet says where it came from. */
export const BRAND = 'GuestSeat';

/** The host the export was generated from (e.g. "guestseat.app"), or the bare brand when off-web. */
export function generatedHost(): string {
  if (typeof window === 'undefined' || !window.location?.hostname) return BRAND.toLowerCase();
  return window.location.hostname.replace(/^www\./, '');
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

// ── Excel palette: an elegant charcoal-and-gold theme echoing the invitation ──────────────
const XL = {
  titleBg: 'FF2A2620', // deep warm charcoal
  titleFg: 'FFF7F1E6', // cream
  headerBg: 'FF3A3428', // info-block bg
  labelFg: 'FFCBB489', // muted gold label
  valueFg: 'FFF5EFE3', // cream value
  gold: 'FFB08D57',
  goldSoft: 'FFD8C39B',
  tableHead: 'FFB08D57', // gold header band
  tableHeadFg: 'FF2A2620',
  rowEven: 'FFFFFFFF',
  rowAlt: 'FFF7F2E9', // warm cream stripe
  bodyInk: 'FF3A342B',
  border: 'FFE6DCC8',
  totBg: 'FF2A2620',
  totFg: 'FFF7F1E6',
} as const;

/**
 * A styled, print-ready `.xlsx` workbook of the seating plan, replacing the old plain CSV.
 * Sheet 1 lists every guest; sheet 2 summarises each table. Both carry a charcoal-and-gold
 * header (event, couple, venue, date) and a footer stamped with where the file was generated.
 * ExcelJS is imported lazily so it never weighs down the initial app load.
 */
export async function exportAsExcel(state: EventState, t: Translator, lang: Language): Promise<void> {
  const { default: ExcelJS } = await import('exceljs');

  const details = state.details ?? {};
  const tableById = new Map(state.tables.map((tb) => [tb.id, tb]));
  const guestById = new Map(state.guests.map((g) => [g.id, g]));
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));

  const fill = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } });
  const border = (argb: string = XL.border) => ({
    top: { style: 'thin' as const, color: { argb } },
    left: { style: 'thin' as const, color: { argb } },
    bottom: { style: 'thin' as const, color: { argb } },
    right: { style: 'thin' as const, color: { argb } },
  });
  const font = (opts: { bold?: boolean; color?: string; size?: number; italic?: boolean } = {}) => ({
    name: 'Calibri',
    size: opts.size ?? 11,
    bold: opts.bold ?? false,
    italic: opts.italic ?? false,
    color: { argb: opts.color ?? XL.bodyInk },
  });

  const dateStr = details.date ? formatEventDate(details.date, lang) : '';
  const whenLine = [dateStr, details.time?.trim()].filter(Boolean).join(' · ') || '–';
  const couple = [details.brideName?.trim(), details.groomName?.trim()].filter(Boolean).join('  &  ') || '–';
  const genLine = `${new Date().toLocaleString(lang === 'sq' ? 'sq-AL' : 'en-GB')} · ${generatedHost()}`;
  const confirmed = state.guests.filter((g) => g.rsvp === 'confirmed').length;
  const declined = state.guests.filter((g) => g.rsvp === 'declined').length;
  const summaryLine = `${t('export.summary', {
    guests: state.guests.length,
    tables: state.tables.length,
    date: new Date().toLocaleDateString(),
  })}${confirmed || declined ? `  ·  ${t('export.rsvpSummary', { confirmed, declined, pending: state.guests.length - confirmed - declined })}` : ''}`;

  const wb = new ExcelJS.Workbook();
  wb.creator = BRAND;
  wb.created = new Date();

  // A framed header block + branded footer, shared by both sheets. Returns the next free row.
  const buildChrome = (ws: import('exceljs').Worksheet, colCount: number, sheetTitle: string) => {
    const last = ws.getColumn(colCount).letter;
    // Title band.
    ws.mergeCells(`A1:${last}1`);
    const title = ws.getCell('A1');
    title.value = sheetTitle;
    title.font = font({ bold: true, color: XL.titleFg, size: 16 });
    title.fill = fill(XL.titleBg);
    title.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 34;
    ws.addRow([]).height = 5;

    // Two info rows, each split into three merged label/value cells.
    const third = Math.max(1, Math.floor(colCount / 3));
    const spans: [number, number][] = [
      [1, third],
      [third + 1, third * 2],
      [third * 2 + 1, colCount],
    ];
    const infoRows: [string, string][][] = [
      [
        [t('export.xlsx.couple'), couple],
        [t('export.xlsx.venue'), details.venue?.trim() || '–'],
        [t('export.xlsx.dateTime'), whenLine],
      ],
      [
        [t('export.xlsx.generated'), genLine],
        [t('export.fields.side'), summaryLine],
        [BRAND, generatedHost()],
      ],
    ];
    // The second info row is really "generated + summary"; collapse its middle/right sensibly.
    infoRows[1] = [
      [t('export.xlsx.generated'), genLine],
      [t('rsvp.label'), summaryLine],
      ['', ''],
    ];

    for (const cells of infoRows) {
      const r = ws.addRow([]);
      r.height = 20;
      spans.forEach(([s, e], i) => {
        if (e > s) ws.mergeCells(r.number, s, r.number, e);
        const cell = ws.getCell(r.number, s);
        const [label, value] = cells[i];
        cell.value = label ? { richText: [{ font: { bold: true, color: { argb: XL.labelFg }, name: 'Calibri', size: 9 }, text: `${label}:  ` }, { font: { color: { argb: XL.valueFg }, name: 'Calibri', size: 9 }, text: value }] } : '';
        cell.fill = fill(XL.headerBg);
        cell.alignment = { vertical: 'middle', horizontal: i === 2 ? 'right' : i === 1 ? 'center' : 'left', indent: 1 };
        for (let c = s; c <= e; c++) ws.getCell(r.number, c).fill = fill(XL.headerBg);
      });
    }
    ws.addRow([]).height = 6;
    return ws.lastRow!.number + 1;
  };

  const brandFooter = (ws: import('exceljs').Worksheet, colCount: number) => {
    ws.addRow([]);
    const r = ws.addRow([]);
    r.height = 20;
    const mid = Math.max(1, Math.floor(colCount * 0.6));
    if (colCount > 1) ws.mergeCells(r.number, 1, r.number, mid);
    const leftCell = ws.getCell(r.number, 1);
    leftCell.value = t('export.madeWith', { brand: `${BRAND} — Wedding Seating Planner` });
    leftCell.font = font({ italic: true, size: 9, color: 'FF9C8A6A' });
    leftCell.alignment = { horizontal: 'left', vertical: 'middle' };
    if (colCount > mid) {
      ws.mergeCells(r.number, mid + 1, r.number, colCount);
      const rightCell = ws.getCell(r.number, mid + 1);
      rightCell.value = generatedHost().toUpperCase();
      rightCell.font = font({ bold: true, size: 9, color: XL.gold });
      rightCell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  };

  // ── Sheet 1: Guests ────────────────────────────────────────────────────────────────────
  const gCols = [
    { header: t('export.xlsx.nr'), width: 6 },
    { header: t('export.fields.name'), width: 20 },
    { header: t('export.fields.surname'), width: 18 },
    { header: t('export.fields.table'), width: 16 },
    { header: t('export.fields.side'), width: 12 },
    { header: t('export.fields.tags'), width: 20 },
    { header: t('export.fields.rsvp'), width: 14 },
    { header: t('export.fields.meal'), width: 16 },
    { header: t('export.fields.linkedWith'), width: 24 },
    { header: t('export.fields.notes'), width: 28 },
  ];
  const guests = wb.addWorksheet(t('export.xlsx.guestsSheet'), { properties: { tabColor: { argb: XL.gold } } });
  guests.columns = gCols.map((c) => ({ width: c.width }));
  const gHeadRow = buildChrome(guests, gCols.length, state.eventName);
  guests.views = [{ state: 'frozen', ySplit: gHeadRow }];

  const gHead = guests.getRow(gHeadRow);
  gHead.height = 22;
  gCols.forEach((c, i) => {
    const cell = gHead.getCell(i + 1);
    cell.value = c.header;
    cell.fill = fill(XL.tableHead);
    cell.font = font({ bold: true, color: XL.tableHeadFg });
    cell.border = border(XL.gold);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const sortedGuests = [...state.guests].sort((a, b) => fullName(a).localeCompare(fullName(b)));
  sortedGuests.forEach((g, idx) => {
    const table = g.tableId ? tableById.get(g.tableId) : undefined;
    const linked = (g.linkedGuestIds ?? [])
      .map((id) => guestById.get(id))
      .filter((p): p is Guest => !!p)
      .map((p) => fullName(p))
      .join('; ');
    const row = guests.addRow([
      idx + 1,
      g.name,
      g.surname ?? '',
      g.tableId ? (table ? tableDisplayName(table, t) : t('export.fields.unknownTable')) : t('export.fields.unseated'),
      sideLabel(table, t),
      tagLabels(table, tagsById).join(', '),
      rsvpLabel(g, t),
      g.meal ?? '',
      linked,
      g.notes ?? '',
    ]);
    row.height = 18;
    const bg = idx % 2 === 0 ? XL.rowEven : XL.rowAlt;
    for (let c = 1; c <= gCols.length; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(bg);
      cell.font = font();
      cell.border = border();
      cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left', indent: c === 1 ? 0 : 1, wrapText: c >= 9 };
    }
  });
  brandFooter(guests, gCols.length);

  // ── Sheet 2: Tables ────────────────────────────────────────────────────────────────────
  const tCols = [
    { header: t('export.xlsx.nr'), width: 6 },
    { header: t('export.fields.table'), width: 18 },
    { header: t('export.fields.side'), width: 12 },
    { header: t('export.fields.tags'), width: 20 },
    { header: t('export.xlsx.seated'), width: 12 },
    { header: t('export.xlsx.guestsCol'), width: 52 },
  ];
  const tablesWs = wb.addWorksheet(t('export.xlsx.tablesSheet'), { properties: { tabColor: { argb: XL.gold } } });
  tablesWs.columns = tCols.map((c) => ({ width: c.width }));
  const tHeadRow = buildChrome(tablesWs, tCols.length, state.eventName);
  tablesWs.views = [{ state: 'frozen', ySplit: tHeadRow }];

  const tHead = tablesWs.getRow(tHeadRow);
  tHead.height = 22;
  tCols.forEach((c, i) => {
    const cell = tHead.getCell(i + 1);
    cell.value = c.header;
    cell.fill = fill(XL.tableHead);
    cell.font = font({ bold: true, color: XL.tableHeadFg });
    cell.border = border(XL.gold);
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  const guestsByTableId = new Map<string, Guest[]>();
  for (const g of state.guests) {
    if (g.tableId) {
      const list = guestsByTableId.get(g.tableId) ?? [];
      list.push(g);
      guestsByTableId.set(g.tableId, list);
    }
  }
  const sortedTables = [...state.tables].sort((a, b) =>
    tableDisplayName(a, t).localeCompare(tableDisplayName(b, t), undefined, { numeric: true })
  );
  let seatedSum = 0;
  let capSum = 0;
  sortedTables.forEach((tb, idx) => {
    const list = (guestsByTableId.get(tb.id) ?? []).sort((a, b) => fullName(a).localeCompare(fullName(b)));
    seatedSum += list.length;
    capSum += tb.capacity;
    const row = tablesWs.addRow([
      idx + 1,
      tableDisplayName(tb, t),
      sideLabel(tb, t),
      tagLabels(tb, tagsById).join(', '),
      `${list.length}/${tb.capacity}`,
      list.map((g) => fullName(g)).join(', '),
    ]);
    row.height = list.length > 6 ? 30 : 18;
    const bg = idx % 2 === 0 ? XL.rowEven : XL.rowAlt;
    for (let c = 1; c <= tCols.length; c++) {
      const cell = row.getCell(c);
      cell.fill = fill(bg);
      cell.font = font();
      cell.border = border();
      cell.alignment = { vertical: 'middle', horizontal: c === 1 || c === 5 ? 'center' : 'left', indent: c === 1 || c === 5 ? 0 : 1, wrapText: c === 6 };
    }
  });
  // Totals row.
  const totRow = tablesWs.addRow([t('export.xlsx.total'), '', '', '', `${seatedSum}/${capSum}`, '']);
  totRow.height = 22;
  tablesWs.mergeCells(totRow.number, 1, totRow.number, 4);
  for (let c = 1; c <= tCols.length; c++) {
    const cell = totRow.getCell(c);
    cell.fill = fill(XL.totBg);
    cell.font = font({ bold: true, color: XL.totFg });
    cell.alignment = { vertical: 'middle', horizontal: c === 5 ? 'center' : 'left', indent: c === 1 ? 1 : 0 };
  }
  brandFooter(tablesWs, tCols.length);

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    buffer,
    `${slug(state.eventName)}-seating.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
}

/**
 * A print-ready seating list, styled to echo the physical invitation. Every A4 page sits
 * inside a cream sheet with a gold double frame. Each part — the groom's tables, the bride's
 * tables, and the unseated guests — begins on its own page led by a full-width header (the
 * event title, the couple's names, the venue and date, a summary and a QR code that opens the
 * live list on a phone), so the parts can be printed separately and each stands on its own.
 * The list then flows through three columns; any overflow continues onto further framed pages
 * that carry a compact running header (title and couple's names).
 */
export async function exportAsPdf(state: EventState, t: Translator, lang: Language): Promise<void> {
  // Load jsPDF on demand so the ~250 kB library stays out of the initial bundle — it's only
  // needed the moment someone actually exports a PDF.
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
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
  const bottomLimit = pageHeight - frameInner - 9; // leaves room for the branded footer

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

  const dateStr = details.date ? formatEventDate(details.date, lang) : '';
  const whenLine = [dateStr, details.time?.trim()].filter(Boolean).join(' · ');
  const whereLine = [details.venue?.trim(), details.address?.trim()].filter(Boolean).join(', ');
  const metaLine = [whereLine, whenLine].filter(Boolean).join('   ·   ');

  // The full-width header — title, couple, venue & date, summary and share QR. It leads the
  // very first page, and also the first page of every part below, so each part (groom / bride
  // / unseated) can be printed on its own and still stand as a complete, titled document.
  const drawFullHeader = () => {
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
  };

  drawFrame();
  drawFullHeader();

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
    // Re-assert the heading font here: if the fit check above triggered newPage(), the running
    // header left the font as a large serif title, which would otherwise render this heading
    // oversized and spill it across into the next column.
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
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

  // Each part opens on its own fresh, full-header page (the first part reuses page 1), so the
  // groom, bride and unseated lists can each be printed as a stand-alone stack.
  let firstPart = true;
  const startPart = () => {
    if (!firstPart) {
      doc.addPage();
      drawFrame();
      drawFullHeader();
    }
    firstPart = false;
  };

  for (const section of sections) {
    if (section.tables.length === 0) continue;
    startPart();
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
    startPart();
    drawSectionHeading(t('unseated.title'));
    drawBlock(t('export.unseatedHeading', { count: unseated.length }), unseated);
  }

  // Branded footer on every page: says where the sheet was generated, plus page numbers, so a
  // printout always shows its origin (GuestSeat + the host it came from).
  const footerLabel = `${t('export.madeWith', { brand: BRAND })}  ·  ${generatedHost()}`;
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageHeight - frameInner - 2;
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.15);
    doc.line(marginX, fy - 3.2, pageWidth - marginX, fy - 3.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(footerLabel, marginX, fy);
    doc.setTextColor(...gold);
    doc.text(`${p} / ${totalPages}`, pageWidth - marginX, fy, { align: 'right' });
  }

  doc.save(`${slug(state.eventName)}-seating.pdf`);
}

/**
 * A "cut-out" seating export: one self-contained card per table, laid out four to an A4 sheet
 * (2×2) with cut guides down the gutters, so a host can print, cut them apart and drop a card on
 * each table. Every card repeats the event name and carries the table's own guest list, so each
 * one stands alone once separated. Only tables with at least one seated guest get a card.
 */
export async function exportAsTableCards(state: EventState, t: Translator, lang: Language): Promise<void> {
  const [{ default: jsPDF }] = await Promise.all([import('jspdf')]);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const details = state.details ?? {};
  const tagsById = new Map((state.tags ?? []).map((tag) => [tag.id, tag]));
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const ink: [number, number, number] = [51, 51, 51];
  const muted: [number, number, number] = [120, 120, 120];
  const body: [number, number, number] = [60, 55, 45];
  const gold: [number, number, number] = [176, 141, 87];
  const goldSoft: [number, number, number] = [206, 183, 142];
  const cream: [number, number, number] = [250, 247, 241];
  const cutGuide: [number, number, number] = [180, 180, 180];

  // Seated guests, bucketed by table.
  const guestsByTable = new Map<string, Guest[]>();
  for (const g of state.guests) {
    if (g.tableId && state.tables.some((tb) => tb.id === g.tableId)) {
      const list = guestsByTable.get(g.tableId) ?? [];
      list.push(g);
      guestsByTable.set(g.tableId, list);
    }
  }
  const cards = [...state.tables]
    .filter((tb) => (guestsByTable.get(tb.id)?.length ?? 0) > 0)
    .sort((a, b) => tableDisplayName(a, t).localeCompare(tableDisplayName(b, t), undefined, { numeric: true }));

  // 2×2 grid geometry: four A6-ish cards per A4, with a gutter between them to cut along.
  const outer = 10;
  const gutter = 10;
  const cardW = (pageWidth - outer * 2 - gutter) / 2;
  const cardH = (pageHeight - outer * 2 - gutter) / 2;
  const slotX = [outer, outer + cardW + gutter];
  const slotY = [outer, outer + cardH + gutter];
  const pad = 7;

  // Event-detail line for each card's header (venue · date · time), so a card still explains
  // itself once cut away from the sheet. Built once; degrades gracefully when details are absent.
  const cardDateStr = details.date ? formatEventDate(details.date, lang) : '';
  const cardWhen = [cardDateStr, details.time?.trim()].filter(Boolean).join(' · ');
  const cardMeta = [details.venue?.trim(), cardWhen].filter(Boolean).join('  ·  ');

  const drawCutGuides = () => {
    doc.setDrawColor(...cutGuide);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.3, 1.3], 0);
    const cx = outer + cardW + gutter / 2;
    const cy = outer + cardH + gutter / 2;
    doc.line(cx, 5, cx, pageHeight - 5);
    doc.line(5, cy, pageWidth - 5, cy);
    doc.setLineDashPattern([], 0);
  };

  const drawCard = (table: Table, x: number, y: number) => {
    const guests = [...(guestsByTable.get(table.id) ?? [])].sort((a, b) => fullName(a).localeCompare(fullName(b)));

    // Card sheet: cream fill with a gold double border — the border doubles as the cut line.
    doc.setFillColor(...cream);
    doc.setDrawColor(...gold);
    doc.setLineWidth(0.5);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, 'FD');
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.15);
    doc.roundedRect(x + 1.4, y + 1.4, cardW - 2.8, cardH - 2.8, 2, 2, 'S');

    const innerW = cardW - pad * 2;
    const centerX = x + cardW / 2;
    let cy = y + pad + 1;

    // --- Header: event name and details, so a card still identifies its event once separated. ---
    if (state.eventName?.trim()) {
      doc.setFont('times', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(...gold);
      const line = (doc.splitTextToSize(state.eventName, innerW) as string[])[0] ?? '';
      doc.text(line, centerX, cy + 3, { align: 'center' });
      cy += 5.5;
    }
    if (cardMeta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...muted);
      for (const line of doc.splitTextToSize(cardMeta, innerW) as string[]) {
        doc.text(line, centerX, cy + 2, { align: 'center' });
        cy += 3.5;
      }
    }
    cy += 1.5;
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.25);
    doc.line(x + pad + 5, cy, x + cardW - pad - 5, cy);
    cy += 5;

    // --- Table name — the hero of the card. ---
    doc.setFont('times', 'normal');
    doc.setFontSize(21);
    doc.setTextColor(...gold);
    for (const line of doc.splitTextToSize(tableDisplayName(table, t), innerW) as string[]) {
      doc.text(line, centerX, cy + 6, { align: 'center' });
      cy += 8.2;
    }
    cy += 0.5;

    // Side + custom tags, then the fill count.
    const meta = [sideLabel(table, t), ...tagLabels(table, tagsById)].filter(Boolean).join(' · ');
    if (meta) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...ink);
      for (const line of doc.splitTextToSize(meta, innerW) as string[]) {
        doc.text(line, centerX, cy + 3, { align: 'center' });
        cy += 4.6;
      }
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(`${guests.length}/${table.capacity}`, centerX, cy + 2.5, { align: 'center' });
    cy += 5;

    // Divider before the guest list.
    doc.setDrawColor(...goldSoft);
    doc.setLineWidth(0.3);
    doc.line(x + pad, cy, x + cardW - pad, cy);
    cy += 3;

    // --- Guest list — enlarged to fill the free space so names read from across the table. ---
    // Manual layout keeps every card inside its slot (never page-breaking); the font grows to fill
    // the remaining height within sensible bounds, and the block is vertically centred.
    const listTop = cy;
    const listBottom = y + cardH - pad - 1;
    const availH = listBottom - listTop;
    const n = Math.max(guests.length, 1);
    const lineH = Math.max(4.6, Math.min(9.5, availH / n));
    const fontSize = Math.max(9, Math.min(16, lineH / 0.5));
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(fontSize);
    let gy = listTop + Math.max(0, (availH - n * lineH) / 2);
    for (let i = 0; i < guests.length; i++) {
      const g = guests[i];
      const marker = g.rsvp === 'declined' ? ` (${t('rsvp.declinedShort')})` : '';
      const wrapped = doc.splitTextToSize(`${i + 1}. ${fullName(g)}${marker}`, innerW - 1) as string[];
      if (gy + wrapped.length * lineH > listBottom + 0.5) {
        doc.setFontSize(9);
        doc.setTextColor(...muted);
        doc.text(`… +${guests.length - i}`, x + pad + 1, gy + 3);
        break;
      }
      doc.setTextColor(...body);
      for (const sub of wrapped) {
        doc.text(sub, x + pad + 1, gy + lineH * 0.72);
        gy += lineH;
      }
    }
  };

  if (cards.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...muted);
    doc.text(t('export.noGuestsSeated'), pageWidth / 2, pageHeight / 2, { align: 'center' });
  } else {
    cards.forEach((table, idx) => {
      const slot = idx % 4;
      if (slot === 0) {
        if (idx > 0) doc.addPage();
        drawCutGuides();
      }
      drawCard(table, slotX[slot % 2], slotY[Math.floor(slot / 2)]);
    });
  }

  // Branded footer with page numbers, in the outer margin below the bottom row of cards.
  const dateStr = details.date ? formatEventDate(details.date, lang) : new Date().toLocaleDateString();
  const footerLabel = `${t('export.madeWith', { brand: BRAND })}  ·  ${dateStr}`;
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const fy = pageHeight - 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...muted);
    doc.text(footerLabel, outer, fy);
    doc.setTextColor(...gold);
    doc.text(`${p} / ${totalPages}`, pageWidth - outer, fy, { align: 'right' });
  }

  doc.save(`${slug(state.eventName)}-table-cards.pdf`);
}

/** Format an ISO `YYYY-MM-DD` date into a long, localized, human string. */
export function formatEventDate(iso: string, lang: Language): string {
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
