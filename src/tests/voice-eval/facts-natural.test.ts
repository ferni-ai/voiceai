import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error -- plain .mjs script, no types
import { checkRun, parseChecks } from '../../../scripts/voice-eval/recall-facts.mjs';

const scenario = (name: string) =>
  readFileSync(
    new URL(`../../../scripts/voice-eval/scenarios/${name}.txt`, import.meta.url),
    'utf8'
  );
const checks = parseChecks(scenario('facts-natural'));
const lines = scenario('facts-natural')
  .split('\n')
  .filter((l) => l.trim() && !l.startsWith('#'));
const run = (turns: Array<[string, string]>) => ({
  events: turns.map(([who, text], i) => ({ t: i * 1000, who, text })),
});

describe('facts-natural recall scenario', () => {
  it('counts the four seeded facts and never names one in the caller lines', () => {
    expect(
      checks.filter((c: { kind: string }) => c.kind === 'fact').map((c: { id: string }) => c.id)
    ).toEqual(['interview', 'wedding', 'pottery', 'mochi']);
    for (const c of checks.filter((x: { kind: string }) => x.kind === 'fact'))
      for (const line of lines) expect(c.re.test(line), `${c.id} in "${line}"`).toBe(false);
  });

  it('credits a fact Ferni brings up on its own', () => {
    const r = checkRun(
      run([
        ['agent', 'Hey you.'],
        ['user', "This week's been a lot, honestly."],
        ['agent', 'Was that the Stripe interview? How did it go?'],
      ]),
      checks
    );
    expect(r.facts.find((f: { id: string }) => f.id === 'interview').recalled).toBe(true);
    expect(r.rate).toBe(0.25);
    expect(r.slips).toEqual([]);
  });

  it('flags reciting the seeded facts back as a list', () => {
    const r = checkRun(
      run([
        ['agent', 'So the Stripe interview, Priya in Lisbon, pottery Thursday and Mochi, right?'],
      ]),
      checks
    );
    expect(r.slips.map((s: { id: string }) => s.id)).toEqual(['listdump']);
  });
});
