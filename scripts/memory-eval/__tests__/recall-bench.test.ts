/**
 * The recall bench's scoring, with a fake embedder: each text becomes a
 * vector over a small vocabulary, so "dog" turns land on the dog memory.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { embedCallers, flag } from '../recall-bench.js';
import { scoreAt, sweepTable, type BenchCaller } from '../recall-bench-lib.js';

const VOCAB = [
  'dog',
  'vet',
  'paw',
  'flights',
  'lisbon',
  'pottery',
  'clay',
  'mom',
  'knee',
  'weather',
];
const fakeEmbed = async (texts: string[]): Promise<number[][]> =>
  texts.map((t) => {
    const words = t.toLowerCase().split(/\W+/);
    return [...VOCAB.map((v) => (words.includes(v) ? 1 : 0)), 0.2];
  });

const sam: BenchCaller = {
  name: 'Sam',
  items: [
    ['biscuit', 'Biscuit: dog, vet on Monday for his paw'],
    ['flights', 'Sam: book flights to Lisbon'],
    ['pottery', 'Sam: pottery class, clay'],
    ['mom', 'mom: recovering from knee surgery'],
    ['other', 'Sam: likes trains'],
  ],
  turns: [
    ['the vet looked at his paw', ['biscuit']],
    ['I booked the flights to Lisbon', ['flights']],
    ['my clay bowl cracked again', ['pottery']],
    ['my mom is walking again', ['flights']],
    ['the weather is nice today', []],
    ['my knee hurts after soccer', []],
    ['okay', []],
  ],
};

describe('recall bench scoring', () => {
  it('counts hits, wrong matches, misses, false recall and quiet turns', async () => {
    const s = scoreAt(await embedCallers([sam], fakeEmbed), 0.07);
    const by = Object.fromEntries(s.results.map((r) => [r.text, r.outcome]));
    expect(by['the vet looked at his paw']).toBe('hit');
    expect(by['I booked the flights to Lisbon']).toBe('hit');
    expect(by['my clay bowl cracked again']).toBe('hit');
    expect(by['my mom is walking again']).toBe('wrong');
    expect(by['my knee hurts after soccer']).toBe('false-recall');
    expect(by['the weather is nice today']).toBe('quiet');
    expect(by.okay).toBe('quiet'); // too short to search with
    expect(s.hitRate).toBeCloseTo(3 / 4);
    expect(s.precision).toBeCloseTo(3 / 5);
    expect(s.falseRecallRate).toBeCloseTo(1 / 3);
  });

  it('a higher margin recalls less: fewer false recalls, no more hits', async () => {
    const e = await embedCallers([sam], fakeEmbed);
    const low = scoreAt(e, 0.01);
    const high = scoreAt(e, 0.9);
    expect(high.counts['false-recall']).toBeLessThan(low.counts['false-recall']);
    expect(high.counts.hit).toBeLessThanOrEqual(low.counts.hit);
    expect(sweepTable(e, [0.1]).at(-1)).toContain('<- MIN_MARGIN');
  });

  it('the shipped cases are well formed: every expected id is one of the caller’s items', () => {
    const file = new URL('../recall-cases.json', import.meta.url);
    const { callers } = JSON.parse(readFileSync(file, 'utf8')) as { callers: BenchCaller[] };
    expect(callers.length).toBeGreaterThanOrEqual(3);
    for (const c of callers) {
      const ids = new Set(c.items.map(([id]) => id));
      expect(ids.size).toBe(c.items.length);
      for (const [, expectIds] of c.turns) for (const id of expectIds) expect(ids).toContain(id);
      expect(c.turns.filter(([, e]) => e.length === 0).length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('threshold flags', () => {
  it('reads 0 to 1 and rejects a missing or malformed value instead of passing silently', () => {
    expect(flag(['--min-hit', '0.8'], '--min-hit')).toBe(0.8);
    expect(flag([], '--min-hit')).toBeUndefined();
    for (const bad of [['--min-hit'], ['--min-hit', 'x'], ['--min-hit', '80']])
      expect(() => flag(bad, '--min-hit')).toThrow(/0 to 1/);
  });
});
