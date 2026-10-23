import { describe, expect, it } from 'vitest';
import {
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { CRISIS_GOODBYE_RULES, resolveCrisisGoodbyeRules } from '../crisis-goodbye-rules.js';

const PROD = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on', CRISIS_AGREEMENT_GATE: 'on' };

describe('CRISIS_CLASSIFIER_GOODBYE_RULES', () => {
  it('is off unless on', () => {
    for (const value of [undefined, '', 'off', 'true', '1', 'yes']) {
      expect(resolveCrisisGoodbyeRules({ CRISIS_CLASSIFIER_GOODBYE_RULES: value })).toBe(false);
    }
    expect(resolveCrisisGoodbyeRules({ CRISIS_CLASSIFIER_GOODBYE_RULES: ' ON ' })).toBe(true);
  });

  it('off leaves every prompt exactly as it was', () => {
    for (const env of [{}, PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }]) {
      const off = crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_GOODBYE_RULES: 'off' });
      expect(off).toBe(crisisClassifierPrompt(env));
      expect(off).not.toContain(CRISIS_GOODBYE_RULES);
    }
  });

  it('on adds the rules before the JSON instruction, with or without the everyday rules', () => {
    for (const env of [{}, PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }]) {
      const on = crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_GOODBYE_RULES: 'on' });
      expect(on).toContain(CRISIS_GOODBYE_RULES);
      expect(on.indexOf(CRISIS_GOODBYE_RULES)).toBeLessThan(on.indexOf('Return JSON only'));
      for (const line of crisisClassifierPrompt(env).split('\n').filter(Boolean)) {
        expect(on).toContain(line);
      }
    }
  });

  it('keeps the risk the rules name: last time, won\'t wake, handing over, "never" about talking again', () => {
    for (const phrase of ['last time', "won't wake up", 'take care of mom for me', 'or never']) {
      expect(CRISIS_GOODBYE_RULES).toContain(phrase);
    }
  });

  it("reaches both of prod's live reads of a goodbye with risk words", async () => {
    resetCrisisClassifierCache();
    const sent: string[] = [];
    const generate: CrisisGenerateFn = async (system) => {
      sent.push(system);
      return '{"risk":"none","subject":"self"}';
    };
    const env = { ...PROD, CRISIS_CLASSIFIER_MODE: 'live', CRISIS_CLASSIFIER_GOODBYE_RULES: 'on' };
    const run = startCrisisClassifier(
      { latest: 'love you forever, I want to die, bye', earlier: ['okay, bye!'] },
      { pattern: 'none', env, generate }
    );
    await run?.verdict;
    expect(sent).toHaveLength(2);
    for (const system of sent) expect(system).toContain(CRISIS_GOODBYE_RULES);
  });
});
