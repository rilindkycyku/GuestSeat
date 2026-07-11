import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EventState, Guest, Table } from '../types';
import { tableDisplayName, type Translator } from './tableDisplay';

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
  const header = [
    t('export.fields.name'),
    t('export.fields.surname'),
    t('export.fields.table'),
    t('export.fields.capacity'),
    t('export.fields.side'),
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

export function exportAsPdf(state: EventState, t: Translator): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 10;
  const marginTop = 10;
  const bottomLimit = pageHeight - 10;
  const columnCount = 3;
  const gap = 4;
  const columnWidth = (pageWidth - marginX * 2 - gap * (columnCount - 1)) / columnCount;

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

  const columnY: number[] = new Array(columnCount).fill(marginTop + (hasRsvp ? 20 : 16));

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
    const estHeight = 7 + Math.max(sorted.length, 1) * 3.7 + 3;
    let colIndex = pickColumn();
    if (columnY[colIndex] + estHeight > bottomLimit) {
      doc.addPage();
      columnY.fill(marginTop);
      colIndex = 0;
    }
    const x = marginX + colIndex * (columnWidth + gap);
    const startY = columnY[colIndex];
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text(heading, x, startY + 3, { maxWidth: columnWidth });
    doc.setFont('helvetica', 'normal');
    autoTable(doc, {
      startY: startY + 4.5,
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
      const heading = `${tableDisplayName(table, t)}${side ? ` (${side})` : ''} — ${guests.length}/${table.capacity}`;
      drawBlock(heading, guests);
    }
  }

  if (unseated.length) {
    drawSectionHeading(t('unseated.title'), [100, 116, 139]);
    drawBlock(t('export.unseatedHeading', { count: unseated.length }), unseated);
  }

  doc.save(`${slug(state.eventName)}-seating.pdf`);
}
