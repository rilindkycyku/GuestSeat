import type { EventState } from '../types';

/**
 * A fully-featured demo event. Unlike the plain import example (which only shows the
 * accepted file format), this is a complete EventState that exercises every part of the
 * app at once — custom colored tags, groom/bride table sides, linked couples & families,
 * unseated guests, per-guest notes, RSVP statuses, and full invitation details
 * (bride/groom, venue, date, schedule). It lets a first-time user click one button and
 * immediately see what a finished list looks like, without building anything first.
 *
 * IDs only need to be unique within this one event, so we use readable literals. A fresh
 * deep copy is returned on every call (with a current updatedAt) so callers never mutate
 * the shared template.
 */
const DEMO: EventState = {
  eventName: 'Elira & Arben — Demo Wedding',
  updatedAt: '',
  tags: [
    { id: 'tag_family', label: 'Family', color: 'rose' },
    { id: 'tag_friends', label: 'Friends', color: 'sky' },
    { id: 'tag_prishtina', label: 'Prishtina', color: 'emerald' },
    { id: 'tag_colleagues', label: 'Colleagues', color: 'amber' },
  ],
  details: {
    brideName: 'Elira',
    groomName: 'Arben',
    venue: 'Emerald Hall',
    address: 'Rr. Nëna Terezë 12, Prishtina',
    date: '2026-09-19',
    time: '17:00',
    invitationNote: 'Together with their families, we would be honored by your presence.',
    invitationTemplate: 'classic',
    agenda: [
      { id: 'ag_1', time: '16:30', title: 'Cocktail' },
      { id: 'ag_2', time: '17:00', title: 'Ceremony' },
      { id: 'ag_3', time: '18:00', title: "Bride's entrance" },
      { id: 'ag_4', time: '19:30', title: 'Dinner' },
      { id: 'ag_5', time: '21:00', title: 'Party' },
    ],
  },
  tables: [
    { id: 't_head', name: 'Head Table', capacity: 6, tagIds: ['tag_family'] },
    { id: 't_g1', name: 'Table 1', capacity: 8, side: 'groom', autoSuffix: '1', tagIds: ['tag_family'] },
    { id: 't_g2', name: 'Table 2', capacity: 8, side: 'groom', autoSuffix: '2', tagIds: ['tag_friends', 'tag_colleagues'] },
    { id: 't_b1', name: 'Table 3', capacity: 8, side: 'bride', autoSuffix: '3', tagIds: ['tag_family'] },
    { id: 't_b2', name: 'Table 4', capacity: 8, side: 'bride', autoSuffix: '4', tagIds: ['tag_friends', 'tag_prishtina'] },
    // A long banquet ("imperial") table — one shared row where several groups sit
    // together, color-coded by their group tags. Shows off the `long` table shape.
    { id: 't_long', name: 'Long Table', capacity: 12, shape: 'long', tagIds: ['tag_family', 'tag_prishtina'] },
  ],
  guests: [
    // Head table — the couple, linked together, both confirmed.
    { id: 'g_bride', name: 'Elira', surname: 'Krasniqi', tableId: 't_head', rsvp: 'confirmed', meal: 'Fish', linkedGuestIds: ['g_groom'] },
    { id: 'g_groom', name: 'Arben', surname: 'Berisha', tableId: 't_head', rsvp: 'confirmed', meal: 'Chicken', linkedGuestIds: ['g_bride'] },

    // Groom's family — a linked married couple + their child, notes for dietary needs.
    { id: 'g_gf1', name: 'Ramadan', surname: 'Berisha', notes: "Groom's father", tableId: 't_g1', rsvp: 'confirmed', meal: 'Chicken', linkedGuestIds: ['g_gf2'] },
    { id: 'g_gf2', name: 'Fatime', surname: 'Berisha', notes: "Groom's mother", tableId: 't_g1', rsvp: 'confirmed', meal: 'Fish', linkedGuestIds: ['g_gf1'] },
    { id: 'g_gf3', name: 'Drin', surname: 'Berisha', notes: 'Vegetarian', tableId: 't_g1', rsvp: 'confirmed', meal: 'Vegetarian' },
    { id: 'g_gf4', name: 'Blerta', surname: 'Berisha', tableId: 't_g1' },

    // Groom's friends & colleagues.
    { id: 'g_gc1', name: 'Besnik', surname: 'Gashi', notes: '+1', tableId: 't_g2', rsvp: 'confirmed', meal: 'Chicken', linkedGuestIds: ['g_gc2'] },
    { id: 'g_gc2', name: 'Vlora', surname: 'Gashi', tableId: 't_g2', rsvp: 'confirmed', meal: 'Fish', linkedGuestIds: ['g_gc1'] },
    { id: 'g_gc3', name: 'Agron', surname: 'Hoxha', notes: 'Works with the groom', tableId: 't_g2', rsvp: 'declined' },
    { id: 'g_gc4', name: 'Rina', surname: 'Krasniqi', tableId: 't_g2', rsvp: 'confirmed' },

    // Bride's family — linked couple.
    { id: 'g_bf1', name: 'Ismail', surname: 'Krasniqi', notes: "Bride's father", tableId: 't_b1', rsvp: 'confirmed', linkedGuestIds: ['g_bf2'] },
    { id: 'g_bf2', name: 'Shqipe', surname: 'Krasniqi', notes: "Bride's mother", tableId: 't_b1', rsvp: 'confirmed', linkedGuestIds: ['g_bf1'] },
    { id: 'g_bf3', name: 'Endrit', surname: 'Krasniqi', tableId: 't_b1', rsvp: 'confirmed' },

    // Bride's friends from Prishtina.
    { id: 'g_bp1', name: 'Adelina', surname: 'Morina', tableId: 't_b2', rsvp: 'confirmed', linkedGuestIds: ['g_bp2'] },
    { id: 'g_bp2', name: 'Fisnik', surname: 'Morina', notes: 'No nuts (allergy)', tableId: 't_b2', rsvp: 'confirmed', linkedGuestIds: ['g_bp1'] },
    { id: 'g_bp3', name: 'Kaltrina', surname: 'Berisha', tableId: 't_b2' },

    // Long banquet table — two groups share the one long row, color-coded by their
    // group tags (family vs. Prishtina friends) so it's clear who's who.
    { id: 'g_l1', name: 'Skender', surname: 'Krasniqi', notes: "Bride's uncle", tableId: 't_long', tagIds: ['tag_family'], rsvp: 'confirmed', linkedGuestIds: ['g_l2'] },
    { id: 'g_l2', name: 'Mirlinda', surname: 'Krasniqi', notes: "Bride's aunt", tableId: 't_long', tagIds: ['tag_family'], rsvp: 'confirmed', linkedGuestIds: ['g_l1'] },
    { id: 'g_l3', name: 'Petrit', surname: 'Krasniqi', tableId: 't_long', tagIds: ['tag_family'], rsvp: 'confirmed' },
    { id: 'g_l4', name: 'Donika', surname: 'Rexhepi', notes: 'Childhood friend', tableId: 't_long', tagIds: ['tag_prishtina'], rsvp: 'confirmed', linkedGuestIds: ['g_l5'] },
    { id: 'g_l5', name: 'Burim', surname: 'Rexhepi', tableId: 't_long', tagIds: ['tag_prishtina'], rsvp: 'confirmed', linkedGuestIds: ['g_l4'] },
    { id: 'g_l6', name: 'Flaka', surname: 'Zeqiri', notes: 'Vegetarian', tableId: 't_long', tagIds: ['tag_prishtina'], meal: 'Vegetarian' },

    // Unseated — not yet assigned to a table, so users see the Unseated panel in action.
    { id: 'g_u1', name: 'Liridon', surname: 'Shala', notes: 'Cousin — table TBD', tableId: null, rsvp: 'confirmed' },
    { id: 'g_u2', name: 'Teuta', surname: 'Dedaj', tableId: null, linkedGuestIds: ['g_u3'] },
    { id: 'g_u3', name: 'Valon', surname: 'Dedaj', notes: 'Seat next to Teuta', tableId: null, linkedGuestIds: ['g_u2'] },
    { id: 'g_u4', name: 'Gentiana', surname: 'Ahmeti', notes: 'Might bring +1', tableId: null },
  ],
};

export function getDemoEventState(): EventState {
  const clone = structuredClone(DEMO) as EventState;
  return { ...clone, updatedAt: new Date().toISOString() };
}
