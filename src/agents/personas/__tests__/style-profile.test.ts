import { describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  doc: { exists: true, data: () => ({ replyLength: 3, laugh: 0.2, opinion: 1.2 }) } as {
    exists: boolean;
    data: () => unknown;
  },
  fail: false,
  reads: 0,
}));

vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => {
              db.reads += 1;
              if (db.fail) throw new Error('unavailable');
              return db.doc;
            },
          }),
        }),
      }),
    }),
  }),
}));

import {
  biasShapeOdds,
  getStyleProfile,
  NEUTRAL_STYLE,
  scaled,
  toStyleProfile,
  type StyleProfile,
} from '../style-profile.js';
import { extrasFor, regexSignals } from '../turn-extras.js';
import { pickShape, turnShapeFor } from '../turn-shape.js';

/** Deterministic rng (mulberry32) so frequency checks are stable. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const style = (over: Partial<StyleProfile>): StyleProfile => ({ ...NEUTRAL_STYLE, ...over });
const funny = 'Ha, my cat stole the whole pizza off the counter today, unbelievable';
const flush = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe('toStyleProfile / scaled', () => {
  it('keeps every multiplier within 0.5..1.5 and fills missing ones with 1', () => {
    expect(toStyleProfile({ replyLength: 3, laugh: 0.2, filler: 'x' })).toEqual({
      replyLength: 1.5,
      laugh: 0.5,
      opinion: 1,
      filler: 1,
    });
    expect(scaled(0.8, 1.5)).toBe(1);
    expect(scaled(0.3, 0.5)).toBeCloseTo(0.15);
  });
});

describe('biasShapeOdds', () => {
  const odds = [
    ['react', 0.25],
    ['one', 0.4],
    ['answer', 0.35],
  ] as const;

  it('is unchanged at 1 and always sums to 1', () => {
    expect(biasShapeOdds(odds, 1).map(([, p]) => p)).toEqual([0.25, 0.4, 0.35]);
    for (const b of [0.5, 1.5]) {
      expect(biasShapeOdds(odds, b).reduce((s, [, p]) => s + p, 0)).toBeCloseTo(1);
    }
  });

  it('leans long above 1 and short below 1; a single-shape move never changes', () => {
    const answer = (b: number) => biasShapeOdds(odds, b).find(([s]) => s === 'answer')?.[1] ?? 0;
    expect(answer(1.5)).toBeGreaterThan(0.35);
    expect(answer(0.5)).toBeLessThan(0.35);
    expect(biasShapeOdds([['answer', 1]], 0.5)).toEqual([['answer', 1]]);
  });

  it('a shorter profile picks short replies more often', () => {
    const shortShare = (b: number) => {
      const rng = seeded(7);
      let n = 0;
      for (let i = 0; i < 4000; i++) if (['react', 'one'].includes(pickShape('share', rng, b))) n++;
      return n / 4000;
    };
    expect(shortShare(0.5)).toBeGreaterThan(shortShare(1) + 0.08);
    expect(shortShare(1.5)).toBeLessThan(shortShare(1) - 0.05);
  });
});

describe('extras with a style profile', () => {
  const fired = (env: Record<string, string>, s: StyleProfile, seed: number) => {
    const rng = seeded(seed);
    const counts: Record<string, number> = {};
    const sig = regexSignals(funny, 'share');
    for (let i = 0; i < 2000; i++) {
      for (const f of extrasFor(funny, 'share', 'answer', false, rng, env, sig, s).fired) {
        counts[f] = (counts[f] ?? 0) + 1;
      }
    }
    return counts;
  };

  it('never turns on what a global flag has off, even at 1.5x', () => {
    const max = style({ laugh: 1.5, opinion: 1.5, filler: 1.5 });
    const counts = fired({}, max, 1);
    expect(counts.laugh_spontaneous ?? 0).toBe(0);
    expect(counts.opinion ?? 0).toBe(0);
    expect(counts.filler ?? 0).toBe(0);
  });

  it('with HUMAN_TEXTURE on, the multipliers move how often each fires', () => {
    const env = { HUMAN_TEXTURE: 'on' };
    const low = fired(env, style({ opinion: 0.5, filler: 0.5 }), 3);
    const high = fired(env, style({ opinion: 1.5, filler: 1.5 }), 3);
    expect(high.opinion ?? 0).toBeGreaterThan((low.opinion ?? 0) * 2);
    expect(high.filler ?? 0).toBeGreaterThan((low.filler ?? 0) * 2);
  });
});

describe('turnShapeFor', () => {
  it('the neutral profile reproduces today exactly', () => {
    for (const text of [funny, 'can you tell me more about that?', 'yeah', 'what is the weather']) {
      expect(turnShapeFor(text, seeded(11), 'dice', undefined, NEUTRAL_STYLE)).toEqual(
        turnShapeFor(text, seeded(11), 'dice')
      );
    }
  });
});

describe('getStyleProfile', () => {
  const on = { STYLE_PROFILE: 'on' };

  it('is neutral when the flag is off, whatever is stored, and never reads it', async () => {
    const session = { userData: { userId: 'u-off' } };
    const before = db.reads;
    expect(getStyleProfile(session, {})).toEqual(NEUTRAL_STYLE);
    await flush();
    expect(getStyleProfile(session, {})).toEqual(NEUTRAL_STYLE);
    expect(db.reads).toBe(before);
  });

  it('is neutral on the first turn, then the stored (clamped) profile, read once', async () => {
    const session = { userData: { userId: 'u1' } };
    expect(getStyleProfile(session, on)).toEqual(NEUTRAL_STYLE);
    await flush();
    expect(getStyleProfile(session, on)).toEqual({
      replyLength: 1.5,
      laugh: 0.5,
      opinion: 1.2,
      filler: 1,
    });
  });

  it('stays neutral without a caller id or when the read fails', async () => {
    expect(getStyleProfile({ userData: {} }, on)).toEqual(NEUTRAL_STYLE);
    db.fail = true;
    const session = { userData: { userId: 'u2' } };
    getStyleProfile(session, on);
    await flush();
    expect(getStyleProfile(session, on)).toEqual(NEUTRAL_STYLE);
    db.fail = false;
  });
});
