/**
 * Shared-moment retention (Seth, 2026-10-26): 80 characters of the caller's words per moment, a
 * year to live. The clamp itself, then the in-process writers that keep moments inside one
 * document (relationship engine, trust-systems inside jokes) through their real functions. The
 * Firestore writers, readers, export and erasure run on the emulator
 * (context-builders/relationship/__tests__/shared-moment-retention.emulator.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { RelationshipEngine } from '../../intelligence/relationship/engine.js';
import {
  detectCallbackMoment,
  exportInsideJokesProfile,
  getSharedMoments,
  importInsideJokesProfile,
} from '../../services/trust-systems/inside-jokes.js';
import {
  clampMomentWords,
  isMomentExpired,
  MOMENT_TTL_MS,
  MOMENT_WORDS_MAX,
  momentExpireAt,
  unexpiredMoments,
} from '../shared-moment-retention.js';

const DAY = 24 * 60 * 60 * 1000;
const LONG =
  'one time my brother and I drove all the way to the coast just to see the herons, and the ' +
  'car broke down twice before we even got past the county line, which was honestly the best';

/** A year from now, give or take the test's own runtime */
const expectAYearOut = (at: Date | undefined, before: number) => {
  expect(at).toBeInstanceOf(Date);
  expect(at!.getTime()).toBeGreaterThanOrEqual(before + MOMENT_TTL_MS);
  expect(at!.getTime()).toBeLessThanOrEqual(Date.now() + MOMENT_TTL_MS);
};

describe('clampMomentWords', () => {
  it('keeps 79 and 80 characters whole', () => {
    const w79 = 'a'.repeat(79);
    const w80 = 'b'.repeat(80);
    expect(clampMomentWords(w79)).toBe(w79);
    expect(clampMomentWords(w80)).toBe(w80);
  });

  it('cuts 81 characters to at most 80 with an ellipsis', () => {
    const out = clampMomentWords('c'.repeat(81));
    expect(out.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect(out).toBe('c'.repeat(79) + '…');
  });

  it('cuts 500 characters on a word boundary', () => {
    const out = clampMomentWords(LONG + ' ' + LONG + ' ' + LONG);
    expect(out.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(out.endsWith('…')).toBe(true);
    const kept = out.slice(0, -1);
    expect(LONG.startsWith(kept)).toBe(true);
    expect(LONG.charAt(kept.length)).toBe(' '); // the next word starts where it was cut
  });

  it('never splits an emoji at the boundary (surrogate pair or ZWJ family)', () => {
    for (const emoji of ['😀', '👨‍👩‍👧‍👦', '🏳️‍🌈']) {
      const out = clampMomentWords('x'.repeat(77) + emoji + 'yyyy');
      expect(out.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
      expect(out).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/); // no lone high surrogate
      expect(out).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/); // no lone low surrogate
      expect(out.endsWith('…')).toBe(true);
      expect(out.slice(0, -1).endsWith(emoji) || out === 'x'.repeat(77) + '…').toBe(true);
    }
  });

  it('cuts multi-byte text with no spaces on a character boundary', () => {
    const out = clampMomentWords('猫が好きです。'.repeat(20));
    expect(out.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(out.endsWith('…')).toBe(true);
    expect('猫が好きです。'.repeat(20).startsWith(out.slice(0, -1))).toBe(true);
    expect(clampMomentWords('  café à la crème  ')).toBe('café à la crème');
  });

  it('handles missing words', () => {
    expect(clampMomentWords(undefined)).toBe('');
    expect(clampMomentWords(null)).toBe('');
  });
});

describe('expiry', () => {
  it('expires a year after it was written, whatever form the stored expireAt takes', () => {
    const now = Date.UTC(2026, 9, 26);
    expect(momentExpireAt(now).getTime()).toBe(now + 365 * DAY);
    const past = now - 1;
    for (const expireAt of [
      new Date(past),
      past,
      new Date(past).toISOString(),
      { toMillis: () => past },
      { _seconds: Math.floor(past / 1000), _nanoseconds: 0 },
    ])
      expect(isMomentExpired({ expireAt }, now)).toBe(true);
    expect(isMomentExpired({ expireAt: new Date(now + DAY) }, now)).toBe(false);
    expect(isMomentExpired({}, now)).toBe(false); // written before the policy: kept
    const stored: Array<{ id: string; expireAt?: Date }> = [
      { id: 'gone', expireAt: new Date(past) },
      { id: 'keep', expireAt: new Date(now + DAY) },
      { id: 'old' },
    ];
    expect(unexpiredMoments(stored, now).map((m) => m.id)).toEqual(['keep', 'old']);
  });
});

describe('relationship engine moments', () => {
  it('recordMoment keeps 80 characters of what they said and a year to live', () => {
    const engine = new RelationshipEngine(`rel-${Date.now()}`, 'ferni');
    const before = Date.now();
    const moment = engine.recordMoment('breakthrough', LONG, { userPhrase: LONG });
    expect(moment.summary.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(moment.userPhrase!.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(LONG.startsWith(moment.userPhrase!.slice(0, -1))).toBe(true);
    expectAYearOut(moment.expireAt, before);
  });
});

describe('trust-systems inside jokes', () => {
  it('a detected moment keeps 80 characters, everywhere it repeats them, and a year to live', () => {
    const userId = `ij-${Date.now()}`;
    const before = Date.now();
    const moment = detectCallbackMoment(userId, LONG)!;
    expect(moment).not.toBeNull();
    expect(moment.content.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(moment.origin.whatTheySaid.length).toBeLessThanOrEqual(MOMENT_WORDS_MAX);
    expect(JSON.stringify(exportInsideJokesProfile(userId))).not.toContain('county line');
    expectAYearOut(moment.expireAt, before);
  });

  it('a read profile drops its expired moments and keeps the rest', () => {
    const userId = `ij-read-${Date.now()}`;
    const moment = (id: string, expireAt?: Date) => ({
      id,
      type: 'phrase' as const,
      content: id,
      triggers: [],
      origin: { timestamp: new Date(), whatTheySaid: id },
      callbackCount: 0,
      callbackReception: 'unknown' as const,
      safety: 'always_safe' as const,
      expireAt,
    });
    importInsideJokesProfile({
      userId,
      moments: [
        moment('expired', new Date(Date.now() - DAY)),
        moment('live', new Date(Date.now() + DAY)),
        moment('before-policy'),
      ],
      signaturePhrases: [],
      opinionTopics: [],
      characterTraits: [],
    } as never);
    expect(getSharedMoments(userId).map((m) => m.id)).toEqual(['live', 'before-policy']);
    expect(exportInsideJokesProfile(userId)!.moments.map((m) => m.id)).toEqual([
      'live',
      'before-policy',
    ]);
  });
});
