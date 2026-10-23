import { describe, expect, it } from 'vitest';
import {
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { CRISIS_EVERYDAY_RULES } from '../crisis-everyday.js';
import { CRISIS_GOODBYE_RULES, resolveCrisisGoodbyeRules } from '../crisis-goodbye-rules.js';

const PROD = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on', CRISIS_AGREEMENT_GATE: 'on' };

describe('CRISIS_CLASSIFIER_GOODBYE_RULES', () => {
  it('is off unless on', () => {
    for (const value of [undefined, '', 'off', 'true', '1', 'yes']) {
      expect(resolveCrisisGoodbyeRules({ CRISIS_CLASSIFIER_GOODBYE_RULES: value })).toBe(false);
    }
    expect(resolveCrisisGoodbyeRules({ CRISIS_CLASSIFIER_GOODBYE_RULES: ' ON ' })).toBe(true);
  });

  it('off leaves every prompt exactly as it was, goodbye turn or not', () => {
    for (const env of [{}, PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }]) {
      for (const goodbye of [false, true]) {
        const off = crisisClassifierPrompt(
          { ...env, CRISIS_CLASSIFIER_GOODBYE_RULES: 'off' },
          { goodbye }
        );
        expect(off).toBe(crisisClassifierPrompt(env));
        expect(off).not.toContain(CRISIS_GOODBYE_RULES);
      }
    }
  });

  it('on adds the rules only on a goodbye turn, and only beside the everyday rules', () => {
    const on = { ...PROD, CRISIS_CLASSIFIER_GOODBYE_RULES: 'on' };
    const ruled = crisisClassifierPrompt(on, { goodbye: true });
    expect(ruled).toContain(CRISIS_GOODBYE_RULES);
    expect(ruled.indexOf(CRISIS_GOODBYE_RULES)).toBeLessThan(ruled.indexOf('Return JSON only'));
    for (const line of crisisClassifierPrompt(PROD).split('\n').filter(Boolean)) {
      expect(ruled).toContain(line);
    }
    // Mid-call: the base prompt.
    expect(crisisClassifierPrompt(on, { goodbye: false })).toBe(crisisClassifierPrompt(PROD));
    expect(crisisClassifierPrompt(on)).toBe(crisisClassifierPrompt(PROD));
    // The plain backstop read (no everyday rules) never carries them.
    const plain = { ...on, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' };
    expect(crisisClassifierPrompt(plain, { goodbye: true })).not.toContain(CRISIS_GOODBYE_RULES);
  });

  it('never lowers imminent or clears finality, a plan, a means or a time', () => {
    expect(CRISIS_GOODBYE_RULES).toContain(
      'These rules never lower imminent, and never clear a line that names finality, a plan, a means or a time.'
    );
  });

  it('keeps the risk the rules name: last time, won\'t wake, handing over, "never" about talking again', () => {
    for (const phrase of ['last time', "won't wake up", 'take care of mom for me', 'or never']) {
      expect(CRISIS_GOODBYE_RULES).toContain(phrase);
    }
  });

  async function sentFor(latest: string, goodbye: boolean | undefined): Promise<string[]> {
    resetCrisisClassifierCache();
    const sent: string[] = [];
    const generate: CrisisGenerateFn = async (system) => {
      sent.push(system);
      return '{"risk":"none","subject":"self"}';
    };
    const env = { ...PROD, CRISIS_CLASSIFIER_MODE: 'live', CRISIS_CLASSIFIER_GOODBYE_RULES: 'on' };
    await startCrisisClassifier(
      { latest, earlier: [] },
      { pattern: 'none', env, generate, goodbye }
    )?.verdict;
    return sent;
  }

  it('on a goodbye turn: the ruled read carries the rules, the plain backstop never does', async () => {
    const sent = await sentFor('love you forever, I want to die, bye', true);
    expect(sent).toHaveLength(2);
    expect(sent.filter((system) => system.includes(CRISIS_GOODBYE_RULES))).toHaveLength(1);
    const plain = sent.find((system) => !system.includes(CRISIS_EVERYDAY_RULES));
    expect(plain).toBeDefined();
    expect(plain).not.toContain(CRISIS_GOODBYE_RULES);
  });

  it('a read with the rules always has the backstop, risk words or not', async () => {
    const sent = await sentFor('the match is over, ciao', true);
    expect(sent).toHaveLength(2);
    expect(sent.some((system) => !system.includes(CRISIS_EVERYDAY_RULES))).toBe(true);
    // Not a goodbye turn: one read, no rules, as on main.
    const mid = await sentFor('the match is over', false);
    expect(mid).toHaveLength(1);
    expect(mid[0]).not.toContain(CRISIS_GOODBYE_RULES);
    expect(await sentFor('the match is over', undefined)).toEqual(mid);
  });
});
