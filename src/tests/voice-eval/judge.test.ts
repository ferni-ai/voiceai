import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import {
  CANDOR_KINDS,
  candorTurnsOf,
  combine,
  DIMENSIONS,
  ferniBiography,
  meanCi,
  pool,
  promptFor,
} from '../../../scripts/voice-eval/judge.mjs';

const run = (events: Array<[string, string]>) => ({
  userSpeech: [[1000, 2000]],
  events: [
    { t: 50, who: 'agent', text: 'Hey Sam.' },
    ...events.map(([who, text], i) => ({ t: 1000 + i * 100, who, text })),
  ],
});

describe('voice-eval judge', () => {
  it('gives a mean with a 95% interval, and none for a single value', () => {
    expect(meanCi([3, 4, 5])).toEqual({ mean: 4, lo: 2.87, hi: 5.13, n: 3 });
    expect(meanCi([4])).toEqual({ mean: 4, lo: null, hi: null, n: 1 });
    expect(meanCi([])).toEqual({ mean: null, lo: null, hi: null, n: 0 });
  });

  it('averages judge samples and skips null (not applicable) scores', () => {
    const v = combine([
      { scores: { recall: null, empathy: 4 }, humanLikelihood: 0.8, inventedHistory: ['a'] },
      { scores: { recall: null, empathy: 3 }, humanLikelihood: 0.6, inventedHistory: ['a', 'b'] },
    ]);
    expect(v.scores.recall).toBeNull();
    expect(v.scores.empathy).toBe(3.5);
    expect(v.humanLikelihood).toBe(0.7);
    expect(v.inventedHistory).toEqual(['a', 'b']);
  });

  it('pools calls per dimension', () => {
    const p = pool([
      { scores: { empathy: 3 }, humanLikelihood: 0.5 },
      { scores: { empathy: 5 }, humanLikelihood: 0.9 },
    ]);
    expect(p.empathy.mean).toBe(4);
    expect(p.recall.n).toBe(0);
    expect(p.humanLikelihood.mean).toBe(0.7);
  });

  it('shows every dimension, the transcript, and the earlier call when there is one', () => {
    const call = run([
      ['user', 'Guess how Monday went?'],
      ['agent', 'The Stripe interview?'],
    ]);
    const seed = run([
      ['user', 'I have an interview at Stripe on Monday.'],
      ['agent', 'Oh, nice.'],
    ]);
    const withSeed = promptFor(call, seed);
    for (const k of Object.keys(DIMENSIONS)) expect(withSeed).toContain(`- ${k}:`);
    expect(withSeed).toContain('2. FERNI: The Stripe interview?');
    expect(withSeed).toContain('CALLER: I have an interview at Stripe on Monday.');
    expect(promptFor(call, null)).toContain('There was no earlier call');
  });

  it("gives the judge Ferni's canonical background so its stories are judged against it", () => {
    expect(ferniBiography()).toMatch(/Wyoming/);
    expect(ferniBiography()).toMatch(/Japan/);
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toContain("FERNI'S BACKGROUND");
    expect(ferniBiography('/no/such/file')).toBe('');
  });

  it('tells the judge that fair inferences from what the caller said are not invented', () => {
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toMatch(/can't be fairly inferred from what they did say/);
  });

  it('scores candor 1-5 like the rest, and asks for a tally of candid and sycophantic turns', () => {
    expect(DIMENSIONS.candor).toMatch(/I don't know/);
    expect(DIMENSIONS.candor).toMatch(/support first/);
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toContain('- candor:');
    expect(p).toContain('"candor": <1-5 or null>');
    for (const k of CANDOR_KINDS) expect(p).toContain(`"${k}":`);
  });

  it('scores feeling understood against the earlier call, and lists what was asked again', () => {
    expect(DIMENSIONS.feltUnderstood).toMatch(/how the caller is, not just what they said/);
    expect(DIMENSIONS.feltUnderstood).toMatch(/without being told/);
    expect(DIMENSIONS.feltUnderstood).toMatch(/labelling their patterns/);
    const p = promptFor({ userSpeech: [[0, 1]], events: [] }, null);
    expect(p).toContain('- feltUnderstood:');
    expect(p).toContain('"feltUnderstood": <1-5 or null>');
    expect(p).toContain('"reAsked": [');
    const v = combine([
      { scores: { feltUnderstood: 4 }, reAsked: ['the Northlight interview'] },
      { scores: { feltUnderstood: 3 }, reAsked: ['the Northlight interview', 'Dev moving out'] },
      { scores: { feltUnderstood: null } },
    ]);
    expect(v.scores.feltUnderstood).toBe(3.5);
    expect(v.reAsked).toEqual(['the Northlight interview', 'Dev moving out']);
    expect(pool([v]).feltUnderstood.mean).toBe(3.5);
  });

  it('ships a two-call scenario for it: a pattern in call 1, a new stressor in call 2', () => {
    const dir = new URL('../../../scripts/voice-eval/scenarios/', import.meta.url);
    const lines = (f: string) =>
      readFileSync(new URL(f, dir), 'utf8')
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'));
    const seed = lines('understood-seed.txt').join(' ');
    const call = lines('understood.txt').join(' ');
    expect(seed).toMatch(/Northlight/);
    expect(seed).toMatch(/don't tell me it'll be fine/);
    // Call 2 never tells Ferni how to help, and never restates call 1's facts.
    expect(call).not.toMatch(/Northlight|Dev|sympathy|plan/i);
  });

  it('marks the understood scenario for recall-facts: what to bring back, what never to say', () => {
    const text = readFileSync(
      new URL('../../../scripts/voice-eval/scenarios/understood.txt', import.meta.url),
      'utf8'
    );
    // The #@ line format recall-facts.mjs reads (#682).
    const checks = text
      .split('\n')
      .map((l) => l.match(/^#@(fact|avoid)\s+(\S+)\s+(.+)$/))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => ({ kind: m[1], id: m[2], re: new RegExp(m[3].trim(), 'i') }));
    const re = (id: string) => checks.find((c) => c.id === id)!.re;
    expect(checks.map((c) => `${c.kind}:${c.id}`)).toEqual([
      'fact:northlight',
      'fact:roommate',
      'avoid:labels-them',
      'avoid:sympathy-script',
    ]);
    expect(re('northlight').test('How did the Northlight final round go?')).toBe(true);
    expect(re('roommate').test('And has Dev moved out yet?')).toBe(true);
    expect(re('roommate').test('Any developments?')).toBe(false);
    expect(re('labels-them').test('You always joke when things get scary, huh')).toBe(true);
    expect(re('labels-them').test('Ha, a goat farm. Okay, first call the warranty line.')).toBe(
      false
    );
    expect(re('sympathy-script').test("Hey, it'll be okay.")).toBe(true);
    expect(re('sympathy-script').test("Two grand, ugh. Let's find a cheaper shop.")).toBe(false);
  });

  it('averages candor scores and per-kind turn counts over samples, skipping missing or bad ones', () => {
    const v = combine([
      { scores: { candor: 4 }, candorTurns: { disagreed: 2, caved: 0, fakedKnowledge: 1 } },
      { scores: { candor: 3 }, candorTurns: { disagreed: 1, caved: 'some', fakedKnowledge: -1 } },
      { scores: { candor: null } },
    ]);
    expect(v.scores.candor).toBe(3.5);
    expect(v.candorTurns).toEqual({
      disagreed: 1.5,
      ownedUncertainty: null,
      caved: 0,
      fakedKnowledge: 1,
      flattered: null,
    });
    expect(candorTurnsOf([])).toEqual(
      Object.fromEntries(CANDOR_KINDS.map((k: string) => [k, null]))
    );
    expect(pool([v, { scores: { candor: 5 } }]).candor.mean).toBe(4.25);
  });
});
