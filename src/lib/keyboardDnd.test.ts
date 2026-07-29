import { describe, expect, it } from 'vitest';
import { boardCoordinateGetter } from './keyboardDnd';
import type { ClientRect, UniqueIdentifier } from '@dnd-kit/core';

function rect(left: number, top: number, width = 100, height = 50): ClientRect {
  return { top, left, width, height, right: left + width, bottom: top + height };
}

/**
 * The slice of dnd-kit's context the getter reads. Building it by hand keeps the test on the
 * hop-between-targets logic instead of on dnd-kit's internals.
 */
function context(targets: Record<string, ClientRect>, chip: ClientRect) {
  const ids = Object.keys(targets);
  return {
    active: { id: 'g1' },
    collisionRect: chip,
    droppableRects: new Map<UniqueIdentifier, ClientRect>(Object.entries(targets)),
    droppableContainers: {
      getEnabled: () => ids.map((id) => ({ id })),
    },
  } as never;
}

function move(code: string, targets: Record<string, ClientRect>, chip: ClientRect) {
  return boardCoordinateGetter({ code, preventDefault() {} } as never, { context: context(targets, chip) } as never);
}

/** Which target's centre a returned coordinate lands on, given the chip's size. */
function landedOn(
  coords: { x: number; y: number } | void,
  targets: Record<string, ClientRect>,
  chip: ClientRect
): string | undefined {
  if (!coords) return undefined;
  const centre = { x: coords.x + chip.width / 2, y: coords.y + chip.height / 2 };
  return Object.entries(targets).find(
    ([, r]) => Math.abs(r.left + r.width / 2 - centre.x) < 1 && Math.abs(r.top + r.height / 2 - centre.y) < 1
  )?.[0];
}

// A board like the list view: the unseated column on the left, then three table cards stacked.
const board = {
  unseated: rect(0, 0, 200, 400),
  t1: rect(240, 0),
  t2: rect(360, 0), // same row as t1
  t3: rect(240, 120),
};
const chipOn = (target: ClientRect, size: ClientRect = rect(0, 0, 80, 30)) => ({
  ...size,
  left: target.left + target.width / 2 - size.width / 2,
  top: target.top + target.height / 2 - size.height / 2,
  right: target.left + target.width / 2 + size.width / 2,
  bottom: target.top + target.height / 2 + size.height / 2,
});

describe('boardCoordinateGetter', () => {
  it('steps to the next target in reading order', () => {
    const chip = chipOn(board.unseated);
    expect(landedOn(move('ArrowDown', board, chip), board, chip)).toBe('t1');
    expect(landedOn(move('ArrowRight', board, chip), board, chip)).toBe('t1');
  });

  it('reads a row left to right before moving down', () => {
    const onT1 = chipOn(board.t1);
    expect(landedOn(move('ArrowRight', board, onT1), board, onT1)).toBe('t2');
    const onT2 = chipOn(board.t2);
    expect(landedOn(move('ArrowRight', board, onT2), board, onT2)).toBe('t3');
  });

  it('steps backwards on the reverse keys', () => {
    const onT3 = chipOn(board.t3);
    expect(landedOn(move('ArrowUp', board, onT3), board, onT3)).toBe('t2');
    expect(landedOn(move('ArrowLeft', board, onT3), board, onT3)).toBe('t2');
  });

  it('stops at the ends instead of wrapping around', () => {
    const onLast = chipOn(board.t3);
    expect(landedOn(move('ArrowDown', board, onLast), board, onLast)).toBe('t3');
    const onFirst = chipOn(board.unseated);
    expect(landedOn(move('ArrowUp', board, onFirst), board, onFirst)).toBe('unseated');
  });

  it('ignores keys that are not arrows', () => {
    const chip = chipOn(board.t1);
    expect(move('Space', board, chip)).toBeUndefined();
    expect(move('KeyA', board, chip)).toBeUndefined();
  });

  it('starts from the nearest target when the chip is over nothing', () => {
    const floating = rect(1000, 1000, 80, 30);
    // Nothing contains the chip, so the closest target (t2, the right-most) is the starting point.
    expect(landedOn(move('ArrowUp', board, floating), board, floating)).toBe('t2');
  });

  it('has nowhere to go with no drop targets', () => {
    expect(move('ArrowDown', {}, rect(0, 0))).toBeUndefined();
  });

  it('treats tables in a nearly-aligned row as one row', () => {
    // Two cards whose tops differ by a few pixels are still read left to right.
    const jittery = { a: rect(0, 0, 100, 50), b: rect(120, 4, 100, 50), c: rect(0, 200, 100, 50) };
    const onA = chipOn(jittery.a);
    expect(landedOn(move('ArrowRight', jittery, onA), jittery, onA)).toBe('b');
  });
});
