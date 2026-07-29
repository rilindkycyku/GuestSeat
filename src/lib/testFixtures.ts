import type { EventState, Guest, Table, TableTag } from '../types';

/**
 * A state that exercises *every* persisted field, used by the round-trip suites. Anything the app
 * can store belongs here: a field missing from this fixture is a field no test would notice being
 * dropped by an exporter, an importer or the share-link codec — which is exactly how guest tags and
 * meal choices went missing from share links in the first place.
 */
export function fullFixture(): EventState {
  const tags: TableTag[] = [
    { id: 'tag1', label: "Bride's family", color: 'rose' },
    { id: 'tag2', label: 'Work friends', color: 'sky' },
  ];

  const tables: Table[] = [
    { id: 't1', name: 'Table A', capacity: 4, side: 'bride', autoSuffix: 'A', tagIds: ['tag1'] },
    { id: 't2', name: 'Long table', capacity: 10, side: 'groom', shape: 'long', tagIds: ['tag1', 'tag2'] },
    { id: 't3', name: 'Spare', capacity: 2 },
  ];

  const guests: Guest[] = [
    {
      id: 'g1',
      name: 'Elira',
      surname: 'Hoxha',
      tableId: 't1',
      notes: 'Vegetarian, no nuts',
      group: 'H',
      rsvp: 'confirmed',
      meal: 'Vegetarian',
      arrived: true,
      tagIds: ['tag1'],
      linkedGuestIds: ['g2'],
      apartGuestIds: ['g4'],
    },
    {
      id: 'g2',
      name: 'Arben',
      surname: 'Hoxha',
      tableId: 't1',
      rsvp: 'confirmed',
      meal: 'Fish',
      tagIds: ['tag1', 'tag2'],
      linkedGuestIds: ['g1'],
    },
    { id: 'g3', name: 'Besa', tableId: 't2', rsvp: 'declined' },
    { id: 'g4', name: 'Dritan', surname: 'Krasniqi', tableId: null, apartGuestIds: ['g1'] },
  ];

  return {
    eventName: 'Demo Wedding',
    guests,
    tables,
    tags,
    details: {
      eventType: 'wedding',
      brideName: 'Elira',
      groomName: 'Arben',
      venue: 'Emerald Hall',
      address: 'Rr. Dëshmorët e Kombit 12',
      date: '2026-08-15',
      time: '17:30',
      introMessage: 'With joy in our hearts',
      invitationNote: 'We would be honored by your presence.',
      hostFamily: 'Familja Hoxha',
      dressCode: 'Formal',
      rsvpPhone: '+383 44 000 000',
      invitationTemplate: 'romantic',
      agenda: [
        { id: 'a1', time: '17:30', title: 'Ceremony' },
        { id: 'a2', title: 'Dinner' },
      ],
    },
    updatedAt: '2026-07-01T10:00:00.000Z',
  };
}

/** The fixture as it comes back off disk / out of a file: plain JSON, no live object identity. */
export function fullFixtureJson(): unknown {
  return JSON.parse(JSON.stringify(fullFixture()));
}
