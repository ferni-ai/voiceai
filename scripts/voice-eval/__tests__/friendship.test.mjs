import { describe, expect, it } from 'vitest';
import { parseChecks, scoreCall, scoreSeries } from '../friendship/friendship.mjs';

const checks = parseChecks(
  [
    '# a comment',
    '#@fact bit:mastermind \\bmastermind\\b',
    '#@fact ans:fern \\bfern\\b',
    '#@avoid decoy:dog \\bbeagle\\b',
    '#@avoid life:wife \\bwife\\b.*\\btea\\b',
    '#@ask help:name \\bany ideas\\b',
    '#@other nope \\bnope\\b',
  ].join('\n')
);

const run = (lines) => ({ events: lines.map(([who, text], i) => ({ who, text, t: i })) });

describe('friendship parseChecks', () => {
  it('reads fact, avoid and ask lines and ignores the rest', () => {
    expect(checks.map((c) => `${c.kind}:${c.id}`)).toEqual([
      'fact:bit:mastermind',
      'fact:ans:fern',
      'avoid:decoy:dog',
      'avoid:life:wife',
      'ask:help:name',
    ]);
  });
});

describe('friendship scoreCall', () => {
  it('counts a fact only when Ferni says it before the caller does', () => {
    const r = scoreCall(run([['user', 'the mastermind again'], ['agent', 'The Mastermind! Still casing it?']]), checks);
    expect(r.facts.find((f) => f.id === 'bit:mastermind').recalled).toBe(false);
    const r2 = scoreCall(run([['agent', 'How is the mastermind?'], ['user', 'Good']]), checks);
    expect(r2.facts.find((f) => f.id === 'bit:mastermind').recalled).toBe(true);
  });

  it('counts laughs and asks', () => {
    const r = scoreCall(run([['agent', 'Ha, any ideas for a name?'], ['user', 'Oh, Fern.']]), checks);
    expect(r.asks.map((a) => a.id)).toEqual(['help:name']);
    expect(r.laughs).toBe(1);
  });
});

describe('friendship scoreSeries', () => {
  const seed = run([['user', 'my cat is a mastermind'], ['agent', 'I will call her The Mastermind']]);
  const recallGood = run([
    ['user', 'it is me again'],
    ['agent', 'Is The Mastermind still casing the treat cabinet?'],
    ['user', 'yes'],
  ]);
  const recallMiss = run([['user', 'hi'], ['agent', 'Hi there, how are you?']]);

  it('does not score the seed for facts and pools recall calls', () => {
    const s = scoreSeries([seed, recallGood, recallMiss], checks);
    expect(s.metrics.recallCalls).toBe(2);
    expect(s.metrics.jokeRecall).toBe(0.5);
    expect(s.metrics.callbacksPerCall).toBe(0.5);
    expect(s.gates.fabricated.ok).toBe(true);
  });

  it('fails the fabricated gate on a decoy and the life gate on a contradiction', () => {
    const bad = run([['user', 'hi'], ['agent', 'Your beagle must miss you, and your wife would say tea']]);
    const s = scoreSeries([seed, bad], checks);
    expect(s.metrics.fabricated).toBe(1);
    expect(s.metrics.lifeContradictions).toBe(1);
    expect(s.gates.fabricated.ok).toBe(false);
    expect(s.gates.lifeContradictions.ok).toBe(false);
  });

  it('keeps the ask rate under one call in five', () => {
    const asker = run([['user', 'hi'], ['agent', 'Any ideas for a name?']]);
    const quiet = run([['user', 'hi'], ['agent', 'Good to hear.']]);
    const s = scoreSeries([seed, asker, quiet, quiet, quiet, quiet], checks);
    expect(s.metrics.askRate).toBe(0.2);
    expect(s.gates.askRate.ok).toBe(true);
  });
});

describe('friendship review fixes', () => {
  const seed = run([['user', 'my cat is a mastermind'], ['agent', 'I will call her The Mastermind']]);

  it('does not judge the ask gate on a series shorter than five recall calls', () => {
    const asker = run([['user', 'hi'], ['agent', 'Any ideas for a name?']]);
    const s = scoreSeries([seed, asker], checks);
    expect(s.metrics.askRate).toBe(1);
    expect(s.gates.askRate.ok).toBe(null);
  });

  it('rejects a file that is not a call recording', () => {
    expect(() => scoreSeries([seed, { meta: {} }], checks)).toThrow(/not a call recording/);
  });

  it('rejects a recording with no agent turns', () => {
    expect(() => scoreSeries([seed, { events: [] }], checks)).toThrow(/no agent turns/);
  });

  it('reads scenario files with CRLF line endings', () => {
    const crlf = parseChecks('#@fact bit:x \\bx\\b\r\n#@avoid decoy:y \\by\\b\r\n');
    expect(crlf.map((c) => c.id)).toEqual(['bit:x', 'decoy:y']);
  });
});
