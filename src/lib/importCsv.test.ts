import { describe, expect, it } from 'vitest';
import { parseImportedCsv } from './importCsv';
import type { Guest } from '../types';

function byName(guests: Guest[], name: string): Guest {
  const found = guests.find((g) => g.name === name);
  if (!found) throw new Error(`no guest named ${name}`);
  return found;
}

const HEADER = 'Name,Surname,Table,Table capacity,Side,Tags,Attendance,Meal,Linked with,Notes';

describe('parseImportedCsv', () => {
  it('reads the columns the workbook exports, meals and tags included', () => {
    const csv = [
      HEADER,
      'Elira,Hoxha,Table A,4,Bride,"Bride\'s family, Work friends",Coming,Vegetarian,Arben Hoxha,"No nuts"',
      'Arben,Hoxha,Table A,4,Bride,Work friends,Coming,Fish,Elira Hoxha,',
      'Besa,,Unseated,,,,Not coming,,,',
    ].join('\n');

    const result = parseImportedCsv(csv);
    const elira = byName(result.guests, 'Elira');

    expect(elira.surname).toBe('Hoxha');
    expect(elira.meal).toBe('Vegetarian');
    expect(elira.rsvp).toBe('confirmed');
    expect(elira.notes).toBe('No nuts');
    expect(result.tags?.map((t) => t.label)).toEqual(["Bride's family", 'Work friends']);
    expect(elira.tagIds).toEqual(result.tags!.map((t) => t.id));
    expect(byName(result.guests, 'Arben').tagIds).toEqual([result.tags![1].id]);

    const tableA = result.tables.find((t) => t.name === 'Table A')!;
    expect(tableA.capacity).toBe(4);
    expect(tableA.side).toBe('bride');
    expect(elira.tableId).toBe(tableA.id);
    expect(byName(result.guests, 'Besa').tableId).toBeNull();
    expect(byName(result.guests, 'Besa').rsvp).toBe('declined');
  });

  it('resolves mutual links by full name and ignores ambiguous ones', () => {
    const csv = [
      HEADER,
      'Ana,Doe,Table A,2,,,,,Beni Doe,',
      'Beni,Doe,Table A,2,,,,,Ana Doe,',
      'Cimi,,Table A,2,,,,,Twin Name,',
      'Twin,Name,Table A,2,,,,,,',
      'Twin,Name,Table A,2,,,,,,',
    ].join('\n');

    const result = parseImportedCsv(csv);
    const ana = byName(result.guests, 'Ana');
    const beni = byName(result.guests, 'Beni');
    expect(ana.linkedGuestIds).toEqual([beni.id]);
    expect(beni.linkedGuestIds).toEqual([ana.id]);
    // Two guests share "Twin Name", so the reference is dropped rather than guessed.
    expect(byName(result.guests, 'Cimi').linkedGuestIds).toBeUndefined();
  });

  it('reads a header written in Albanian', () => {
    const csv = [
      'Emri,Mbiemri,Tavolina,Kapaciteti i tavolinës,Pala,Etiketat,Pjesëmarrja,Menyja,I lidhur me,Shënime',
      'Ana,Doe,Tavolina 1,6,Nusja,Familja,Vjen,Peshk,,',
    ].join('\n');
    const result = parseImportedCsv(csv);
    const ana = byName(result.guests, 'Ana');
    expect(ana.meal).toBe('Peshk');
    expect(ana.rsvp).toBe('confirmed');
    expect(result.tables[0].side).toBe('bride');
    expect(result.tags?.[0].label).toBe('Familja');
  });

  it('falls back to the historical column order when the header is unrecognized', () => {
    const csv = ['first,last,tbl,cap,which,links,note', 'Ana,Doe,Table A,3,Groom,,Front row'].join('\n');
    const result = parseImportedCsv(csv);
    const ana = byName(result.guests, 'Ana');
    expect(ana.surname).toBe('Doe');
    expect(ana.notes).toBe('Front row');
    expect(result.tables[0].capacity).toBe(3);
    expect(result.tables[0].side).toBe('groom');
  });

  it('handles quoted fields, embedded commas, doubled quotes and CRLF', () => {
    const csv = 'Name,Surname,Table,Table capacity,Side,Tags,Attendance,Meal,Linked with,Notes\r\n"Ana ""The Boss""",Doe,"Table A, main",8,,,,,,"Note, with comma"\r\n';
    const result = parseImportedCsv(csv);
    expect(result.guests[0].name).toBe('Ana "The Boss"');
    expect(result.guests[0].notes).toBe('Note, with comma');
    expect(result.tables[0].name).toBe('Table A, main');
  });

  it('sizes a table by its occupants when no capacity column survived', () => {
    const csv = [HEADER, 'Ana,,Table A,,,,,,,', 'Beni,,Table A,,,,,,,'].join('\n');
    expect(parseImportedCsv(csv).tables[0].capacity).toBe(2);
  });

  it('throws on a CSV with no data rows', () => {
    expect(() => parseImportedCsv(HEADER)).toThrow();
    expect(() => parseImportedCsv('')).toThrow();
  });
});
