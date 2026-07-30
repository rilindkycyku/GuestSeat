import { useMemo } from 'react';
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { EventState } from '../types';
import { boardCoordinateGetter } from '../lib/keyboardDnd';
import { tableDisplayName, type Translator } from '../lib/tableDisplay';

/**
 * Drag-and-drop for the seating board: which inputs can start a drag, and what a screen reader
 * hears while one is happening.
 *
 * Space picks a guest up and puts them down; Enter is deliberately left alone, because a guest chip
 * is a real button whose Enter opens the guest editor. Arrow keys hop between tables (see
 * {@link boardCoordinateGetter}) rather than nudging the chip by pixels, which is dnd-kit's default
 * and would take dozens of presses to cross a board.
 *
 * dnd-kit's own announcements are English-only, so they come from the app's dictionary instead.
 */
export function useBoardDnd(state: EventState | null, t: Translator) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: boardCoordinateGetter,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    })
  );

  const accessibility = useMemo(() => {
    const nameOf = (id: string | number) => {
      const guest = state?.guests.find((g) => g.id === String(id));
      return guest ? (guest.surname ? `${guest.name} ${guest.surname}` : guest.name) : String(id);
    };
    /** The table a drop target stands for, or null for the unseated list. */
    const targetOf = (id: string | number | undefined) => {
      if (id == null || id === 'unseated') return null;
      const table = state?.tables.find((tb) => tb.id === String(id));
      return table ? tableDisplayName(table, t) : String(id);
    };
    return {
      screenReaderInstructions: { draggable: t('dnd.instructions') },
      announcements: {
        onDragStart: ({ active }: { active: { id: string | number } }) =>
          t('dnd.pickedUp', { guest: nameOf(active.id) }),
        onDragOver: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
          if (!over) return undefined;
          const table = targetOf(over.id);
          return table
            ? t('dnd.overTable', { guest: nameOf(active.id), table })
            : t('dnd.overUnseated', { guest: nameOf(active.id) });
        },
        onDragEnd: ({ active, over }: { active: { id: string | number }; over: { id: string | number } | null }) => {
          const guest = nameOf(active.id);
          if (!over) return t('dnd.droppedNowhere', { guest });
          const table = targetOf(over.id);
          return table ? t('dnd.seated', { guest, table }) : t('dnd.unseatedGuest', { guest });
        },
        onDragCancel: ({ active }: { active: { id: string | number } }) =>
          t('dnd.cancelled', { guest: nameOf(active.id) }),
      },
    };
  }, [state, t]);

  return { sensors, accessibility };
}
