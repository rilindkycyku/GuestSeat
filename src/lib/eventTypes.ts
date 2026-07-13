import type { EventType } from '../types';

/** How many honoree name fields an event type shows, and what to call them. */
export interface EventTypeConfig {
  id: EventType;
  emoji: string;
  /** i18n key for the type's display name (e.g. "Wedding", "Birthday"). */
  labelKey: string;
  /**
   * i18n keys for the honoree name field(s). Two keys = a couple (bride & groom / two names),
   * one key = a single celebrant, none = no name fields (a generic party carried by the event name).
   */
  nameLabelKeys: string[];
  /** Fallback intro line printed above the names when the couple hasn't written their own. */
  introKey: string;
  /** Default schedule seeded on a fresh invitation — keys resolve to `invitation.defaults.*`. */
  agenda: { key: string; time: string }[];
}

/**
 * Every event type GuestSeat can plan, in the order shown in the picker. Wedding stays first as
 * the default. Each preset reuses the existing schedule glyphs (see `iconForAgenda`), so no event
 * type needs a bespoke icon — the keywords already resolve to a fitting mark.
 */
export const EVENT_TYPES: EventTypeConfig[] = [
  {
    id: 'wedding',
    emoji: '💒',
    labelKey: 'eventType.wedding',
    nameLabelKeys: ['invitation.brideName', 'invitation.groomName'],
    introKey: 'invitation.intro',
    agenda: [
      { key: 'cocktail', time: '16:00' },
      { key: 'entrance', time: '16:30' },
      { key: 'traditional', time: '' },
      { key: 'ceremony', time: '17:00' },
      { key: 'dinner', time: '19:00' },
      { key: 'cake', time: '21:00' },
      { key: 'party', time: '22:00' },
    ],
  },
  {
    id: 'engagement',
    emoji: '💍',
    labelKey: 'eventType.engagement',
    nameLabelKeys: ['invitation.brideName', 'invitation.groomName'],
    introKey: 'invitation.intro',
    agenda: [
      { key: 'cocktail', time: '17:00' },
      { key: 'rings', time: '18:00' },
      { key: 'toast', time: '18:30' },
      { key: 'dinner', time: '19:30' },
      { key: 'cake', time: '21:00' },
      { key: 'party', time: '22:00' },
    ],
  },
  {
    id: 'anniversary',
    emoji: '💞',
    labelKey: 'eventType.anniversary',
    nameLabelKeys: ['invitation.person1', 'invitation.person2'],
    introKey: 'invitation.intro',
    agenda: [
      { key: 'toast', time: '19:00' },
      { key: 'dinner', time: '19:30' },
      { key: 'cake', time: '21:00' },
      { key: 'firstDance', time: '' },
      { key: 'photo', time: '' },
    ],
  },
  {
    id: 'henna',
    emoji: '🖐️',
    labelKey: 'eventType.henna',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'gettingReady', time: '' },
      { key: 'henna', time: '18:00' },
      { key: 'traditional', time: '' },
      { key: 'flowers', time: '' },
      { key: 'candles', time: '' },
      { key: 'photo', time: '' },
      { key: 'party', time: '20:00' },
    ],
  },
  {
    id: 'birthday',
    emoji: '🎂',
    labelKey: 'eventType.birthday',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'cocktail', time: '' },
      { key: 'dinner', time: '19:00' },
      { key: 'cake', time: '20:00' },
      { key: 'toast', time: '' },
      { key: 'gifts', time: '' },
      { key: 'party', time: '21:00' },
    ],
  },
  {
    id: 'bachelorette',
    emoji: '👰',
    labelKey: 'eventType.bachelorette',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'gettingReady', time: '' },
      { key: 'cocktail', time: '' },
      { key: 'photo', time: '' },
      { key: 'dinner', time: '' },
      { key: 'party', time: '' },
      { key: 'fireworks', time: '' },
    ],
  },
  {
    id: 'bachelor',
    emoji: '🤵',
    labelKey: 'eventType.bachelor',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'cocktail', time: '' },
      { key: 'dinner', time: '' },
      { key: 'toast', time: '' },
      { key: 'party', time: '' },
      { key: 'fireworks', time: '' },
    ],
  },
  {
    id: 'babyShower',
    emoji: '🍼',
    labelKey: 'eventType.babyShower',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'cocktail', time: '' },
      { key: 'gifts', time: '' },
      { key: 'cake', time: '' },
      { key: 'photo', time: '' },
      { key: 'party', time: '' },
    ],
  },
  {
    id: 'graduation',
    emoji: '🎓',
    labelKey: 'eventType.graduation',
    nameLabelKeys: ['invitation.honoreeName'],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'ceremony', time: '17:00' },
      { key: 'toast', time: '' },
      { key: 'photo', time: '' },
      { key: 'dinner', time: '19:00' },
      { key: 'party', time: '21:00' },
    ],
  },
  {
    id: 'party',
    emoji: '🎉',
    labelKey: 'eventType.party',
    nameLabelKeys: [],
    introKey: 'invitation.introGeneric',
    agenda: [
      { key: 'cocktail', time: '' },
      { key: 'dinner', time: '' },
      { key: 'cake', time: '' },
      { key: 'party', time: '' },
    ],
  },
];

const BY_ID = new Map(EVENT_TYPES.map((c) => [c.id, c]));

/** The config for an event type, falling back to wedding for absent/unknown values. */
export function eventTypeConfig(type: EventType | undefined): EventTypeConfig {
  return (type && BY_ID.get(type)) || EVENT_TYPES[0];
}
