import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { EventState, Guest, Table } from '../types';

type Translator = (key: string, vars?: Record<string, string | number>) => string;

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

export function exportAsJson(state: EventState): void {
  downloadBlob(JSON.stringify(state, null, 2), `${slug(state.eventName)}-seating.json`, 'application/json');
}

export function exportAsCsv(state: EventState, t: Translator): void {
  const tableById = new Map(state.tables.map((tb) => [tb.id, tb]));
  const header = [
    t('export.fields.name'),
    t('export.fields.surname'),
    t('export.fields.table'),
    t('export.fields.side'),
    t('export.fields.notes'),
  ];
  const rows = [...state.guests]
    .sort((a, b) => fullName(a).localeCompare(fullName(b)))
    .map((g) => {
      const table = g.tableId ? tableById.get(g.tableId) : undefined;
      return [
        g.name,
        g.surname ?? '',
        g.tableId ? (table?.name ?? t('export.fields.unknownTable')) : t('export.fields.unseated'),
        sideLabel(table, t),
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

  doc.setFontSize(18);
  doc.text(state.eventName, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    t('export.summary', {
      guests: state.guests.length,
      tables: tables.length,
      date: new Date().toLocaleDateString(),
    }),
    14,
    25
  );
  doc.setTextColor(0);

  let y = 34;
  const pageHeight = doc.internal.pageSize.getHeight();

  const sortedTables = [...tables].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  for (const table of sortedTables) {
    const guests = (guestsByTable.get(table.id) ?? []).sort((a, b) => fullName(a).localeCompare(fullName(b)));
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(13);
    const side = sideLabel(table, t);
    doc.text(`${table.name}${side ? ` — ${side}` : ''}  (${guests.length}/${table.capacity})`, 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['#', t('export.fields.name'), t('export.fields.notes')]],
      body: guests.length
        ? guests.map((g, i) => [String(i + 1), fullName(g), g.notes ?? ''])
        : [['—', t('export.noGuestsSeated'), '']],
      styles: { fontSize: 9 },
      headStyles: { fillColor: table.side === 'bride' ? [219, 39, 119] : table.side === 'groom' ? [37, 99, 235] : [79, 70, 229] },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    });
    // @ts-expect-error autoTable attaches this at runtime
    y = doc.lastAutoTable.finalY + 10;
  }

  if (unseated.length) {
    if (y > pageHeight - 30) {
      doc.addPage();
      y = 20;
    }
    doc.setFontSize(13);
    doc.text(t('export.unseatedHeading', { count: unseated.length }), 14, y);
    y += 4;
    autoTable(doc, {
      startY: y,
      head: [['#', t('export.fields.name'), t('export.fields.notes')]],
      body: [...unseated]
        .sort((a, b) => fullName(a).localeCompare(fullName(b)))
        .map((g, i) => [String(i + 1), fullName(g), g.notes ?? '']),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [148, 163, 184] },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    });
  }

  doc.save(`${slug(state.eventName)}-seating.pdf`);
}
