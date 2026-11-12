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

// Counts the lookbacks built (the linear-work check below).
const lookback = vi.hoisted(() => ({ builds: 0 }));
vi.mock('../crisis-means-lookback.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../crisis-means-lookback.js')>();
  return {
    ...real,
    meansLookback: (...args: Parameters<typeof real.meansLookback>) => {
      lookback.builds++;
      return real.meansLookback(...args);
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

// r3: each means match finds the words before it from breaks found once per turn
// (crisis-means-lookback.ts), not by slicing and splitting the whole text before every match. That
// was quadratic: 30 ms at 20k chars against main's 1.5 ms. This used to time the read against the
// 'off' floor, and the wall clock failed it under load (#3676), so it counts the work instead:
// - the lookback is built once per read, however many means matches the turn holds;
// - the strings the read slices out add up to a few characters per character of the turn
//   (about 7 at 20k chars). Slicing the text before every match, as the old split did, is over
//   500 per character at 20k, so the bound of 20 holds for linear work and fails the quadratic shape.
describe('a 20k-char pasted turn reads in linear work', () => {
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
  /** The lookbacks built and the characters sliced out of strings while the read runs. */
  const work = (read: () => void): { builds: number; sliced: number } => {
    const { slice } = String.prototype;
    let sliced = 0;
    const spy = vi.spyOn(String.prototype, 'slice').mockImplementation(function (
      this: string,
      ...args: [number?, number?]
    ) {
      const out = slice.apply(this, args);
      sliced += out.length;
      return out;
    });
    lookback.builds = 0;
    try {
      read();
    } finally {
      spy.mockRestore();
    }
    return { builds: lookback.builds, sliced };
  };

  it.each([
    ['check-in', "i can't handle this heat.", 'live'],
    ['check-in', "i can't handle this heat.", 'shadow'],
    ['goodbye', 'this is goodbye.', 'live'],
    ['goodbye', 'this is goodbye.', 'shadow'],
  ] as const)(
    'the %s shape ("%s") under %s: one lookback, at most 20 sliced chars per char',
    (_shape, opening, mode) => {
      const text = sentences(opening);
      expect(text).toHaveLength(20_000);
      const { builds, sliced } = work(() => reads[mode](text));
      expect(builds).toBe(1);
      expect(sliced).toBeGreaterThan(0);
      expect(sliced).toBeLessThan(20 * text.length);
    }
  );

  // One generous wall-clock backstop, for a blow-up the counts above don't model. The turn is 400k
  // chars because a quadratic read only stands clear of a linear one on a long turn: the old
  // per-match split took 0.09 s at 20k (too close to main to time) and 3.2 s at 200k, while main
  // took 0.12 s at 200k on a quiet box and 0.4 s at load 35. At 400k main stays well under 5 s on a
  // loaded runner, and the quadratic shape (30 s at load 30) fails it.
  it('a 400k-char pasted turn reads in under 5 s under live and shadow (backstop)', () => {
    const text = `i can't handle this heat. ${'i have the pills. '.repeat(22_300)}`.slice(
      0,
      400_000
    );
    expect(text).toHaveLength(400_000);
    const at = performance.now();
    reads.live(text);
    reads.shadow(text);
    expect(performance.now() - at).toBeLessThan(5_000);
  }, 60_000);
});
