/**
 * The crisis classifier's relay rules (#1415), checked offline: the prompt
 * carries them in both variants, Ferni's own crisis-resource sentences never
 * reach the classifier as context, and the eval set holds both sides. The
 * live recall and false-positive numbers come from
 * scripts/crisis-eval/classifier-eval.ts (set 'relay'), never this suite.
 */
import { describe, expect, it } from 'vitest';
import { CRISIS_RELAY } from '../../../agents/__tests__/fixtures/crisis-relay.js';
import { detectCrisis } from '../crisis-guard.js';
import {
  classifyCrisis,
  CRISIS_CLASSIFIER_PROMPT,
  crisisClassifierPrompt,
  withoutCrisisResources,
} from '../crisis-classifier.js';

describe('the classifier prompt', () => {
  it.each([
    ['off', {}],
    ['on', { CRISIS_AGREEMENT_GATE: 'on' }],
  ])('with the agreement gate %s, carries the relay, idiom and short-reply rules', (_, env) => {
    const prompt = crisisClassifierPrompt(env);
    expect(prompt).toContain('a plain request about someone else');
    expect(prompt).toContain('"if anything happens to me, call my dad" is still a last request');
    expect(prompt).toContain('Risk words aimed at a thing rather than the caller are idioms');
    expect(prompt).toContain('keeps their risk, crisis at least');
  });

  it('the rules sit inside the "none" list, before the language line', () => {
    const at = CRISIS_CLASSIFIER_PROMPT.indexOf('a plain request about someone else');
    expect(at).toBeGreaterThan(
      CRISIS_CLASSIFIER_PROMPT.indexOf('risk = "none" for everything else')
    );
    expect(at).toBeLessThan(CRISIS_CLASSIFIER_PROMPT.indexOf('Messages may be in any language'));
  });
});

describe("Ferni's own crisis resources are not context", () => {
  const OFFER =
    "I hear you, and I'm glad you said something. If things ever feel like too much, you can call or text 988, the Suicide and Crisis Lifeline, any time. I'm here too.";

  it('drops only the sentences that offer a line or a number', () => {
    expect(withoutCrisisResources(OFFER)).toBe(
      "I hear you, and I'm glad you said something. I'm here too."
    );
    expect(withoutCrisisResources('You can text HOME to 741741.')).toBe('');
    expect(withoutCrisisResources('That sounds heavy. Want to tell me more?')).toBe(
      'That sounds heavy. Want to tell me more?'
    );
  });

  it('the classifier never sees them: a goodbye after the offer goes in with the rest', async () => {
    let seen = '';
    await classifyCrisis(
      { latest: 'Okay, bye, talk later.', earlier: ['Are you my friend?'], companion: OFFER },
      async (_prompt, content) => {
        seen = content;
        return '{"risk":"none","subject":"self"}';
      }
    );
    const sent = JSON.parse(seen) as { companion?: string; latest: string };
    expect(sent.latest).toBe('Okay, bye, talk later.');
    expect(sent.companion).toBe("I hear you, and I'm glad you said something. I'm here too.");
    expect(seen).not.toMatch(/988|lifeline/i);
  });

  it('a companion line that was only the offer leaves no companion', async () => {
    let seen = '';
    await classifyCrisis(
      {
        latest: 'ok',
        earlier: ['I want to die.'],
        companion: 'Please call or text 988 right now.',
      },
      async (_prompt, content) => {
        seen = content;
        return '{"risk":"crisis","subject":"self"}';
      }
    );
    expect(JSON.parse(seen)).toEqual({ latest: 'ok', earlier: ['I want to die.'] });
  });
});

describe('the relay eval set', () => {
  const risk = CRISIS_RELAY.filter((c) => c.label !== 'none');
  const benign = CRISIS_RELAY.filter((c) => c.label === 'none');

  it('pairs at least 15 true-risk lines with at least 15 benign ones', () => {
    expect(risk.length).toBeGreaterThanOrEqual(15);
    expect(benign.length).toBeGreaterThanOrEqual(15);
    expect(
      risk.filter((c) => /\b(?:mom|mum|dad|sister|brother|wife|kids|son)\b/i.test(c.text)).length
    ).toBeGreaterThanOrEqual(5);
  });

  it('the patterns never block a benign line on their own', () => {
    for (const c of benign) {
      const d = detectCrisis(c.text, undefined, { recentMessages: c.earlier ?? [] });
      expect({ text: c.text, block: d.severity >= 0.85 }).toEqual({ text: c.text, block: false });
    }
  });
});
