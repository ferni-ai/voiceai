import { describe, expect, it } from 'vitest';

import {
  aaGap,
  armEnv,
  compareArms,
  copiedNgrams,
  copyStats,
  maskNames,
  median,
  ngramSet,
  noiseFloor,
  parseCompanion,
  parsePick,
  parseSets,
  parseUse,
  rate,
  samplingGap,
  shuffled,
  verdictFor,
  words,
  type Metrics,
} from '../bar-lib.js';

const metrics = (d: number, i: number, c: number): Metrics => ({
  distinctness: rate(d, 100),
  insight: rate(i, 100),
  copy: { ...rate(c, 100), top: [] },
  medianWords: 10,
});

describe('arm flags', () => {
  it('lays the overrides over the prod file, as strings', () => {
    const env = armEnv(
      { PERSONA_VOICE: 'off', TURN_LENGTH: 'off', MAX: 3, ON: true },
      parseSets(['PERSONA_VOICE=on', 'TURN_LENGTH=learned'])
    );
    expect(env).toEqual({ PERSONA_VOICE: 'on', TURN_LENGTH: 'learned', MAX: '3', ON: 'true' });
  });

  it('keeps an "=" inside a value and adds flags the file does not have', () => {
    expect(parseSets(['NOTE=a=b', 'NEW_FLAG=on'])).toEqual({ NOTE: 'a=b', NEW_FLAG: 'on' });
    expect(armEnv({}, { NEW_FLAG: 'on' })).toEqual({ NEW_FLAG: 'on' });
  });

  it('rejects a malformed override or flags file instead of running the baseline', () => {
    expect(() => parseSets(['PERSONA_VOICE'])).toThrow(/KEY=value/);
    expect(() => parseSets(['persona_voice=on'])).toThrow(/UPPER_CASE/);
    expect(() => parseSets(['=on'])).toThrow();
    expect(() => armEnv([1, 2], {})).toThrow(/flat JSON object/);
    expect(() => armEnv({ A: { nested: 1 } }, {})).toThrow(/not a scalar/);
  });
});

describe('judge output', () => {
  it('reads a companion letter, fenced or bare, as an index', () => {
    expect(parseCompanion('{"companion":"C"}', 6)).toBe(2);
    expect(parseCompanion('```json\n{"companion": "f"}\n```', 6)).toBe(5);
  });

  it('refuses a letter past the choices, a non-letter, or no JSON', () => {
    expect(parseCompanion('{"companion":"G"}', 6)).toBeNull();
    expect(parseCompanion('{"companion":"AB"}', 6)).toBeNull();
    expect(parseCompanion('{"companion":3}', 6)).toBeNull();
    expect(parseCompanion('It was A.', 6)).toBeNull();
    expect(parseCompanion('{"companion":"A"', 6)).toBeNull();
  });

  it('reads a pick of 1 or 2, as a string or a number, and nothing else', () => {
    expect(parsePick('{"pick":"1"}')).toBe(1);
    expect(parsePick('{"pick":2}')).toBe(2);
    expect(parsePick('{"pick":"3"}')).toBeNull();
    expect(parsePick('{"pick":"both"}')).toBeNull();
    expect(parsePick('{}')).toBeNull();
  });

  it('reads the insight verdict', () => {
    expect(parseUse('{"use":"Natural"}')).toBe('natural');
    expect(parseUse('{"use":"forced"}')).toBe('forced');
    expect(parseUse('{"use":"none"}')).toBe('none');
    expect(parseUse('{"use":"yes"}')).toBeNull();
  });

  it('blanks every persona name as a whole word only', () => {
    expect(maskNames('Alex here. Ferni says hi to alexandra.', ['ferni', 'alex'])).toBe(
      '___ here. ___ says hi to alexandra.'
    );
  });
});

describe('rates and order', () => {
  it('gives the Wilson interval, not the normal one', () => {
    const r = rate(0, 10);
    expect(r.p).toBe(0);
    expect(r.lo).toBe(0);
    // Wilson at 0/10 is [0, 0.278]; the normal approximation collapses to [0, 0].
    expect(r.hi).toBeCloseTo(0.2775, 3);
    const half = rate(50, 100);
    expect(half.lo).toBeCloseTo(0.4038, 3);
    expect(half.hi).toBeCloseTo(0.5962, 3);
    expect(rate(0, 0)).toEqual({ k: 0, n: 0, p: 0, lo: 0, hi: 0 });
  });

  it('shuffles the same way for the same seed and keeps every item', () => {
    const xs = ['a', 'b', 'c', 'd', 'e', 'f'];
    const one = shuffled(xs, 'line:ferni:0');
    expect(shuffled(xs, 'line:ferni:0')).toEqual(one);
    expect([...one].sort()).toEqual(xs);
    expect(xs).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffled(xs, `s${i}`).join('')));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('puts a two-way order first about half the time over many seeds', () => {
    const firsts = Array.from({ length: 1000 }, (_, i) => shuffled([true, false], `k${i}`)[0]);
    const share = firsts.filter(Boolean).length / firsts.length;
    expect(share).toBeGreaterThan(0.44);
    expect(share).toBeLessThan(0.56);
  });

  it('takes the middle, or the mean of the two middles', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});

describe('copy check', () => {
  const instructions = ngramSet(
    "Keep it short. Don't say I hear you; say what a friend would say. Pick up the small thing they almost didn't say."
  );

  it('splits words with apostrophes kept and curly quotes folded', () => {
    expect(words("Don’t   STOP, it's fine!")).toEqual(["don't", 'stop', "it's", 'fine']);
  });

  it('finds a 4-word run the reply took from its instructions', () => {
    const copied = copiedNgrams('oh man. what a friend would say is go to bed.', [instructions]);
    expect(copied).toEqual(expect.arrayContaining(['what a friend would', 'a friend would say']));
  });

  it('ignores runs shorter than four words, punctuation and markup between words', () => {
    expect(copiedNgrams('keep it short, friend.', [instructions])).toEqual([]);
    // "the small thing they" is in the instructions; markup and case do not hide it.
    expect(copiedNgrams('<break time="50ms"/>The SMALL thing, they said?', [instructions])).toEqual(
      ['the small thing they']
    );
    // A [laughter] tag between the words is not a word, so it does not hide a copy.
    expect(copiedNgrams('pick up [laughter] the small', [instructions])).toEqual([
      'pick up the small',
    ]);
  });

  it('checks every instruction text it is given', () => {
    const reminder = ngramSet('(One or two short sentences. No question this turn.)');
    expect(copiedNgrams('no question this turn, ok', [instructions, reminder])).toEqual([
      'no question this turn',
    ]);
    expect(copiedNgrams('no question this turn, ok', [instructions])).toEqual([]);
  });

  it('counts replies, not occurrences, and ranks the most-copied runs', () => {
    const stats = copyStats([
      ['a friend would say', 'what a friend would'],
      ['a friend would say', 'a friend would say'],
      [],
      [],
    ]);
    expect(stats.k).toBe(2);
    expect(stats.n).toBe(4);
    expect(stats.p).toBe(0.5);
    expect(stats.top).toEqual([
      { ngram: 'a friend would say', replies: 2 },
      { ngram: 'what a friend would', replies: 1 },
    ]);
  });
});

describe('A/A floor and comparison', () => {
  it('measures the A/A gap as the absolute gap, and pairwise as the distance from 50%', () => {
    const gap = aaGap(metrics(24, 40, 10), metrics(30, 35, 12), rate(45, 100));
    expect(gap.distinctness).toBeCloseTo(0.06, 10);
    expect(gap.insight).toBeCloseTo(0.05, 10);
    expect(gap.copy).toBeCloseTo(0.02, 10);
    expect(gap.humanness).toBeCloseTo(0.05, 10);
  });

  it('gives the 95% half-width of a difference of two independent rates', () => {
    // 1.96 * sqrt(.24*.76/100 + .30*.70/100) = 0.1227
    expect(samplingGap(rate(24, 100), rate(30, 100))).toBeCloseTo(0.1227, 3);
    expect(samplingGap(rate(0, 0), rate(0, 0))).toBe(0);
  });

  it('never lets a lucky-close A/A pair set a floor below what sampling allows', () => {
    // The two runs landed 6 points apart, but n=100 allows 12.3: the floor is 12.3.
    const close = noiseFloor(metrics(24, 40, 10), metrics(30, 35, 12), rate(45, 100));
    expect(close.distinctness).toBeCloseTo(0.1227, 3);
    // A pairwise rate against 0.5 at n=100: 1.96 * sqrt(.25/100) = 0.098.
    expect(close.humanness).toBeCloseTo(0.098, 3);
    // The pairwise variance is taken at 0.5 (no difference), not at the observed win rate:
    // 1/4 wins gives 1.96 * sqrt(.25/4) = 0.49, where the observed rate would give 0.424.
    expect(noiseFloor(metrics(0, 0, 0), metrics(0, 0, 0), rate(1, 4)).humanness).toBeCloseTo(
      0.49,
      3
    );
  });

  it('keeps the observed A/A gap when it is wider than sampling allows', () => {
    const wide = noiseFloor(metrics(20, 40, 10), metrics(50, 40, 10), rate(20, 100));
    expect(wide.distinctness).toBeCloseTo(0.3, 10);
    expect(wide.humanness).toBeCloseTo(0.3, 10);
  });

  it('calls a gap inside the floor noise, and reads copy as lower-is-better', () => {
    expect(verdictFor(0.05, 0.06)).toBe('noise');
    expect(verdictFor(0.06, 0.06)).toBe('noise');
    expect(verdictFor(0.1, 0.06)).toBe('better');
    expect(verdictFor(-0.1, 0.06)).toBe('worse');
    expect(verdictFor(-0.1, 0.06, true)).toBe('better');
    expect(verdictFor(0.1, 0.06, true)).toBe('worse');
    expect(verdictFor(0.5, null)).toBe('no A/A');
  });

  it('compares each metric against the baseline and its floor', () => {
    const floor = { distinctness: 0.05, insight: 0.05, copy: 0.05, humanness: 0.05 };
    const rows = compareArms(metrics(24, 40, 30), metrics(40, 42, 10), rate(70, 100), floor);
    expect(rows.map((r) => [r.metric, r.verdict])).toEqual([
      ['distinctness', 'better'],
      ['humanness', 'better'],
      ['insight', 'noise'],
      ['copy', 'better'],
    ]);
    const human = rows.find((r) => r.metric === 'humanness');
    expect(human?.baseline).toBe(0.5);
    expect(human?.delta).toBeCloseTo(0.2, 10);
    expect(
      compareArms(metrics(24, 40, 30), metrics(40, 42, 10), null, null).map((r) => r.verdict)
    ).toEqual(['no A/A', 'no A/A', 'no A/A']);
  });
});
