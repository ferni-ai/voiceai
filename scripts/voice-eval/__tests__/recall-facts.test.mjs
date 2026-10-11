import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkRun, parseChecks, poolRuns } from '../recall-facts.mjs';

const checks = parseChecks(
  [
    '# a comment',
    '#@fact interview \\bstripe\\b|interview',
    '#@fact mochi \\bmochi\\b',
    '#@avoid ex \\bex\\b',
    'Hey Ferni.',
  ].join('\n')
);

const run = (events) => ({ events: events.map(([who, text], i) => ({ who, text, t: i })) });

describe('recall-facts', () => {
  it('reads only the #@fact and #@avoid lines', () => {
    expect(checks.map((c) => `${c.kind}:${c.id}`)).toEqual(['fact:interview', 'fact:mochi', 'avoid:ex']);
  });

  it('counts a fact Ferni brings up on its own, greeting included', () => {
    const r = checkRun(run([['agent', 'Hey! How did the Stripe thing go?'], ['user', 'Good.']]), checks);
    expect(r.facts.find((f) => f.id === 'interview')).toMatchObject({ recalled: true });
    expect(r.facts.find((f) => f.id === 'mochi')).toMatchObject({ recalled: false });
    expect(r.rate).toBe(0.5);
  });

  it('does not count a fact the caller said first', () => {
    const r = checkRun(run([['user', 'Mochi is back.'], ['agent', 'Mochi! That cat loves you.']]), checks);
    expect(r.facts.find((f) => f.id === 'mochi')).toMatchObject({ recalled: false });
  });

  it('flags every avoid Ferni says, matching whole words', () => {
    const r = checkRun(run([['agent', 'Next week, any news?'], ['agent', 'Is your ex still around?']]), checks);
    expect(r.slips).toEqual([{ id: 'ex', quote: 'Is your ex still around?' }]);
  });

  it('pools per-fact hits and the per-call rate', () => {
    const a = checkRun(run([['agent', 'Stripe! And Mochi?']]), checks);
    const b = checkRun(run([['agent', 'Hi there.']]), checks);
    const p = poolRuns([a, b]);
    expect(p.mean).toBe(0.5);
    expect(p.perFact.interview).toEqual({ hits: 1, n: 2 });
    expect(p.lo).toBeLessThan(p.mean);
  });

  it('every #@fact line in the shipped scenarios compiles', () => {
    const text = readFileSync(new URL('../scenarios/facts-recall.txt', import.meta.url), 'utf8');
    expect(parseChecks(text).filter((c) => c.kind === 'fact')).toHaveLength(4);
  });
});
