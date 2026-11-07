/**
 * #3564: "i have the pills." needs ending words outside it, so the turn is read again with the
 * means sentences blanked. That re-read happens once per turn, however many such sentences a
 * pasted turn holds, so the crisis read stays fast on the turn path.
 */
import { describe, expect, it, vi } from 'vitest';

const floor = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../crisis-ending-floor.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../crisis-ending-floor.js')>();
  return {
    ...real,
    endingFloor: (...args: Parameters<typeof real.endingFloor>) => {
      floor.calls++;
      return real.endingFloor(...args);
    },
  };
});

import { detectCrisis } from '../crisis-guard.js';
import { meansInHandRead } from '../crisis-means-in-hand.js';
import { noteMeansInHandShadow } from '../crisis-means-shadow.js';

const pasted = `this is goodbye. ${'i have the pills. '.repeat(1000)}`;

describe('the means sentence re-read, once per turn', () => {
  it('blanks every free means sentence in one call', () => {
    const outside = vi.fn((_spans: ReadonlyArray<readonly [number, number]>) => true);
    const read = meansInHandRead(pasted, ['passive_ideation'], [], 'live', outside);
    expect(read).toEqual({ tag: 'suicidal', form: 'ending_beside_means' });
    expect(outside).toHaveBeenCalledTimes(1);
    expect(outside.mock.calls[0][0]).toHaveLength(1000);
  });

  it('reads a 1000-sentence pasted turn as 911 with at most two reads of the turn', () => {
    floor.calls = 0;
    const read = detectCrisis(pasted, undefined, { meansInHand: 'live' });
    expect(read.indicators).toContain('imminent_danger');
    expect(floor.calls).toBeGreaterThan(0);
    expect(floor.calls).toBeLessThanOrEqual(2);
  });

  // The costly case: no ending words outside, so a per-sentence re-read would run 1000 times.
  it('reads a 1000-sentence check-in as main under live, after one re-read', () => {
    const checkIn = `i can't handle this heat. ${'i have the pills. '.repeat(1000)}`;
    floor.calls = 0;
    const read = detectCrisis(checkIn, undefined, { meansInHand: 'live' });
    expect(read.indicators).not.toContain('imminent_danger');
    expect(read).toEqual(detectCrisis(checkIn, undefined, { meansInHand: 'off' }));
    expect(floor.calls).toBeGreaterThan(1);
  });

  it('a 1000-sentence check-in makes at most two reads of the turn', () => {
    const checkIn = `i can't handle this heat. ${'i have the pills. '.repeat(1000)}`;
    floor.calls = 0;
    detectCrisis(checkIn, undefined, { meansInHand: 'live' });
    expect(floor.calls).toBeLessThanOrEqual(2);
  });

  it('no means sentence, no re-read', () => {
    const outside = vi.fn((_spans: ReadonlyArray<readonly [number, number]>) => true);
    expect(meansInHandRead('this is goodbye.', ['passive_ideation'], [], 'live', outside)).toBe(
      null
    );
    expect(outside).not.toHaveBeenCalled();
  });
});

// r3: each means match finds the words before it in one pass per turn, not by splitting the whole
// text again (that was quadratic: 30 ms at 20k chars, main 1.5 ms). The bar is main + 5 ms at 20k;
// 'off' reads as main without the means forms, so it is the floor. Head and floor are timed in
// turn, median of 5, and the bound is generous (3x the floor, + 5 ms) so a slow CI box still
// passes while the quadratic shape (20x the floor) fails.
describe('a 20k-char pasted turn reads in linear time', () => {
  const sentences = (opening: string) =>
    `${opening} ${'i have the pills. '.repeat(1200)}`.slice(0, 20_000);
  const reads = {
    live: (text: string) => detectCrisis(text, undefined, { meansInHand: 'live' }),
    // Shadow, prod's default: the turn's read, then the shadow log's own read of every form.
    shadow: (text: string) => {
      const read = detectCrisis(text, undefined, { meansInHand: 'shadow' });
      noteMeansInHandShadow('s', read, { text }, { CRISIS_MEANS_IN_HAND: 'shadow' });
    },
  };
  const floors = {
    live: (text: string) => detectCrisis(text, undefined, { meansInHand: 'off' }),
    shadow: (text: string) => {
      detectCrisis(text, undefined, { meansInHand: 'off' });
      detectCrisis(text, undefined, { meansInHand: 'off' });
    },
  };
  const ms = (f: () => void) => {
    const at = performance.now();
    f();
    return performance.now() - at;
  };
  const median = (list: number[]) => [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)];

  it.each([
    ['check-in', "i can't handle this heat.", 'live'],
    ['check-in', "i can't handle this heat.", 'shadow'],
    ['goodbye', 'this is goodbye.', 'live'],
    ['goodbye', 'this is goodbye.', 'shadow'],
  ] as const)(
    'the %s shape ("%s") under %s: within the main floor + 5 ms',
    (_shape, opening, mode) => {
      const text = sentences(opening);
      expect(text).toHaveLength(20_000);
      reads[mode](text);
      floors[mode](text);
      const head: number[] = [];
      const floor: number[] = [];
      for (let run = 0; run < 5; run++) {
        head.push(ms(() => reads[mode](text)));
        floor.push(ms(() => floors[mode](text)));
      }
      expect(median(head)).toBeLessThan(3 * median(floor) + 5);
    }
  );
});
