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
