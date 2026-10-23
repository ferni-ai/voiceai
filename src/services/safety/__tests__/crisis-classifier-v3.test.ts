import { describe, expect, it } from 'vitest';
import { CRISIS_CLASSIFIER_PROMPT, crisisClassifierPrompt } from '../crisis-classifier.js';
import {
  V3_ANCHORS,
  resolveCrisisClassifierPromptVariant,
  withPromptV3,
} from '../crisis-classifier-v3.js';

const PROD = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on', CRISIS_AGREEMENT_GATE: 'on' };

describe('CRISIS_CLASSIFIER_PROMPT_VARIANT', () => {
  it('is off unless v3', () => {
    for (const value of [undefined, '', 'off', 'on', 'true', 'v2', 'v4']) {
      expect(
        resolveCrisisClassifierPromptVariant({ CRISIS_CLASSIFIER_PROMPT_VARIANT: value })
      ).toBe('off');
    }
    expect(resolveCrisisClassifierPromptVariant({ CRISIS_CLASSIFIER_PROMPT_VARIANT: ' V3 ' })).toBe(
      'v3'
    );
  });

  it('off leaves the prompt exactly as it was, with and without the everyday rules', () => {
    for (const env of [{}, PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }]) {
      const off = crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_PROMPT_VARIANT: 'off' });
      expect(off).toBe(crisisClassifierPrompt(env));
      expect(off).not.toMatch(/Quiet preparation/);
    }
  });

  it("v3 reaches both of prod's reads: with the everyday rules and the plain read without them", () => {
    for (const env of [PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }, {}]) {
      const v3 = crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_PROMPT_VARIANT: 'v3' });
      expect(v3).toMatch(/Quiet preparation is often said as plain logistics/);
      expect(v3).toMatch(/LATEST must carry the risk itself/);
      expect(v3).toMatch(/a pen pal, a thank-you card/);
      expect(v3).toMatch(/she's keeping him from now on" is rehoming a pet for good/);
      // The additions sit before the JSON instruction, which still ends the rules.
      expect(v3.indexOf('LATEST must carry the risk itself')).toBeLessThan(
        v3.indexOf('Return JSON only')
      );
      // Everything the base prompt says is still there.
      for (const line of crisisClassifierPrompt(env).split('\n').filter(Boolean)) {
        expect(v3).toContain(line.slice(0, 60));
      }
    }
  });

  it('the anchors v3 relies on are in the prompt, so it cannot silently do nothing', () => {
    expect(CRISIS_CLASSIFIER_PROMPT).toContain(V3_ANCHORS.rules);
    expect(CRISIS_CLASSIFIER_PROMPT).toContain(V3_ANCHORS.none);
    expect(withPromptV3(CRISIS_CLASSIFIER_PROMPT)).not.toBe(CRISIS_CLASSIFIER_PROMPT);
  });

  it('a prompt without an anchor is left unchanged rather than half-edited', () => {
    expect(withPromptV3('no anchors here')).toBe('no anchors here');
  });
});
