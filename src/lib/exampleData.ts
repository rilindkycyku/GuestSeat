/**
 * Example guest list. Mirrors the "grouped by letter" shape a user's own
 * export tool might produce, so it's a realistic template to download.
 */
export const EXAMPLE_GROUPED_JSON = {
  A: ['Arben', 'Adriana', 'Agron'],
  B: ['Blerta', 'Besnik'],
  C: ['Cristina'],
};

/** Alternate, fully-detailed shape also accepted on import. */
export const EXAMPLE_DETAILED_JSON = [
  { name: 'Arben', surname: 'Krasniqi', table: 'Table 1' },
  { name: 'Adriana', surname: 'Berisha' },
  { name: 'Blerta' },
];

export const EXAMPLE_JSON_TEXT = JSON.stringify(EXAMPLE_GROUPED_JSON, null, 2);
