import { type KeyboardCoordinateGetter, type ClientRect } from '@dnd-kit/core';

/**
 * Keyboard drag-and-drop for the seating board.
 *
 * dnd-kit's built-in keyboard coordinate getter nudges the dragged item 25px per arrow key, which
 * suits a canvas but not this board: getting a guest from the unseated column to table 14 would
 * take dozens of presses, and on the list view the tables aren't laid out by pixel distance at all.
 * This getter instead hops between *drop targets* — one press, one table — in reading order (top to
 * bottom, then left to right), which matches how the tables are read on screen in both views.
 *
 * Down/Right go to the next target, Up/Left to the previous, and the ends don't wrap: a keyboard
 * user who holds an arrow key lands on the last table rather than cycling forever past it.
 */

const NEXT_KEYS = new Set(['ArrowDown', 'ArrowRight']);
const PREVIOUS_KEYS = new Set(['ArrowUp', 'ArrowLeft']);

/** Reading order: whichever target starts higher, breaking near-ties by horizontal position. */
function inReadingOrder(a: ClientRect, b: ClientRect): number {
  // A row of table cards is never perfectly pixel-aligned, so tops within 8px count as one row.
  if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
  return a.left - b.left;
}

export const boardCoordinateGetter: KeyboardCoordinateGetter = (
  event,
  { context: { active, droppableRects, droppableContainers, collisionRect } }
) => {
  const forward = NEXT_KEYS.has(event.code);
  if (!forward && !PREVIOUS_KEYS.has(event.code)) return undefined;
  if (!collisionRect || !active) return undefined;
  event.preventDefault();

  // Only enabled targets that have actually been measured can be jumped to.
  const targets = droppableContainers
    .getEnabled()
    .flatMap((container) => {
      const rect = droppableRects.get(container.id);
      return rect ? [{ id: container.id, rect }] : [];
    })
    .sort((a, b) => inReadingOrder(a.rect, b.rect));
  if (targets.length === 0) return undefined;

  // Where the chip sits now decides what "next" means: the target it is inside, or failing that the
  // one whose centre is closest. Deriving it from the chip's own position (rather than remembering
  // the last target) keeps repeated presses moving in one direction even where targets overlap, as
  // the floor plan's tables do.
  const centre = {
    x: collisionRect.left + collisionRect.width / 2,
    y: collisionRect.top + collisionRect.height / 2,
  };
  const inside = targets.findIndex(
    ({ rect }) =>
      centre.x >= rect.left && centre.x <= rect.right && centre.y >= rect.top && centre.y <= rect.bottom
  );
  const from =
    inside !== -1
      ? inside
      : targets.reduce((best, { rect }, i) => {
          const distance = Math.hypot(rect.left + rect.width / 2 - centre.x, rect.top + rect.height / 2 - centre.y);
          const bestRect = targets[best].rect;
          const bestDistance = Math.hypot(
            bestRect.left + bestRect.width / 2 - centre.x,
            bestRect.top + bestRect.height / 2 - centre.y
          );
          return distance < bestDistance ? i : best;
        }, 0);
  const next = targets[forward ? Math.min(from + 1, targets.length - 1) : Math.max(from - 1, 0)];

  // Coordinates are the *item's* new top-left, so centre the chip on the target it's moving to.
  return {
    x: next.rect.left + next.rect.width / 2 - collisionRect.width / 2,
    y: next.rect.top + next.rect.height / 2 - collisionRect.height / 2,
  };
};
