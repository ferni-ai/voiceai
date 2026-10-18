/**
 * CRISIS_CLASSIFIER_EVERYDAY_DISTRESS: a rough day or week is everyday business.
 *
 * Prod smoke 2026-10-18 12:29Z: "Hey Ferni, rough couple of days over here."
 * matched no pattern and held no risk-list word, so the ruled read alone
 * decided; when it read crisis, the gate regenerated the reply with crisis
 * guidance and the caller heard the 988 line. These tests pin both flag
 * states, the backstop that keeps risk words from being lowered, and that
 * real risk still escalates with both flags on.
 */
import { llm } from '@livekit/agents';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { startCrisisGate } from '../../../agents/personas/crisis-gate.js';
import { hasRiskContent } from '../crisis-agreement.js';
import {
  CRISIS_CLASSIFIER_PROMPT,
  CRISIS_EVERYDAY_RULES,
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import {
  CRISIS_EVERYDAY_DISTRESS_RULES,
  everydayRulesFor,
  resolveCrisisEverydayDistress,
} from '../crisis-everyday.js';

const ROUGH = 'Hey Ferni, rough couple of days over here.';
const GRIEF = 'my dad died last month and I miss him';
const RULES = { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' };
const BOTH = { ...RULES, CRISIS_CLASSIFIER_EVERYDAY_DISTRESS: 'on' };
const LIVE = { CRISIS_GUARD_MODE: 'live', CRISIS_CLASSIFIER_MODE: 'live' };

function request(...turns: Array<['user' | 'assistant', string]>): llm.ChatContext {
  const ctx = llm.ChatContext.empty();
  ctx.addMessage({ role: 'system', content: 'You are Ferni.' });
  for (const [role, content] of turns) ctx.addMessage({ role, content });
  return ctx;
}

/** A model that reads the turn as `ruled` with the distress rule in its prompt, `plain` otherwise. */
const byPrompt =
  (ruled: string, plain: string): CrisisGenerateFn =>
  async (prompt) =>
    `{"risk":"${prompt.includes(CRISIS_EVERYDAY_DISTRESS_RULES) ? ruled : plain}","subject":"self"}`;

beforeEach(() => resetCrisisClassifierCache());

describe('flag off', () => {
  it('leaves the everyday prompt exactly as it was', () => {
    for (const value of [undefined, '', 'off', 'true', '1']) {
      const env = { ...RULES, CRISIS_CLASSIFIER_EVERYDAY_DISTRESS: value };
      expect(resolveCrisisEverydayDistress(env)).toBe(false);
      expect(everydayRulesFor(env)).toBe(CRISIS_EVERYDAY_RULES);
      expect(crisisClassifierPrompt(env)).toBe(crisisClassifierPrompt(RULES));
      expect(crisisClassifierPrompt(env)).not.toContain(CRISIS_EVERYDAY_DISTRESS_RULES);
    }
  });

  it('does nothing without the everyday rules', () => {
    const env = { CRISIS_CLASSIFIER_EVERYDAY_DISTRESS: 'on' };
    expect(crisisClassifierPrompt(env)).toBe(CRISIS_CLASSIFIER_PROMPT);
  });
});

describe('flag on', () => {
  it('adds the distress rule as the last everyday item, before the farewell rules', () => {
    expect(resolveCrisisEverydayDistress({ CRISIS_CLASSIFIER_EVERYDAY_DISTRESS: ' On ' })).toBe(
      true
    );
    const rules = everydayRulesFor(BOTH);
    expect(rules).toContain(CRISIS_EVERYDAY_DISTRESS_RULES);
    expect(rules.indexOf('everyday plans and numbers')).toBeLessThan(
      rules.indexOf(CRISIS_EVERYDAY_DISTRESS_RULES)
    );
    expect(rules.indexOf(CRISIS_EVERYDAY_DISTRESS_RULES)).toBeLessThan(
      rules.indexOf('A last request or final goodbye')
    );
    expect(rules.replace(CRISIS_EVERYDAY_DISTRESS_RULES, '')).toBe(CRISIS_EVERYDAY_RULES);
    const prompt = crisisClassifierPrompt(BOTH);
    expect(prompt).toContain(rules);
    expect(prompt.indexOf(rules)).toBeLessThan(prompt.indexOf('Return JSON only'));
  });

  it('keeps risk in the caller words, now or earlier, out of "none"', () => {
    expect(CRISIS_EVERYDAY_DISTRESS_RULES).toMatch(
      /risk is the caller's own words about dying, not being around, hurting themselves/
    );
    expect(CRISIS_EVERYDAY_DISTRESS_RULES).toMatch(/judged as above$/);
  });
});

describe('the 12:29Z turn', () => {
  it('has no risk-list word, so the ruled read alone decides it', () => {
    expect(hasRiskContent(ROUGH)).toBe(false);
  });

  it('a crisis read of it regenerates the reply with 988 guidance (the path prod took)', async () => {
    const gate = startCrisisGate(request(['user', ROUGH]), undefined, {
      env: { ...LIVE, ...RULES },
      generate: async () => '{"risk":"crisis","subject":"self"}',
    });
    expect(gate?.decision.action).toBe('pass');
    const escalation = await gate?.escalation;
    expect(escalation?.action).toBe('guide');
    expect(escalation && 'guidance' in escalation ? escalation.guidance : '').toMatch(/988/);
  });

  it('with the flag on, is read once, with the distress rule', async () => {
    const generate = vi.fn(byPrompt('none', 'crisis'));
    const run = startCrisisClassifier(
      { latest: ROUGH, earlier: [] },
      { pattern: 'none', generate, env: { CRISIS_CLASSIFIER_MODE: 'live', ...BOTH } }
    );
    expect(await run?.verdict).toEqual({ risk: 'none', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).toContain(CRISIS_EVERYDAY_DISTRESS_RULES);
  });
});

describe('the rule never lowers a turn with risk words', () => {
  it('reads a grief line without the rules too, and the more severe read wins', async () => {
    expect(hasRiskContent(GRIEF)).toBe(true);
    const generate = vi.fn(byPrompt('none', 'crisis'));
    const run = startCrisisClassifier(
      { latest: GRIEF, earlier: [] },
      { pattern: 'none', generate, env: { CRISIS_CLASSIFIER_MODE: 'live', ...BOTH } }
    );
    expect((await run?.verdict)?.risk).toBe('crisis');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(([p]) => p.includes(CRISIS_EVERYDAY_DISTRESS_RULES))).toEqual([
      true,
      false,
    ]);
  });

  it.each([
    ['I want to kill myself', 'replace'],
    ["I don't want to be here anymore", 'guide'],
  ])('"%s" still escalates from the patterns (%s)', (latest, action) => {
    const gate = startCrisisGate(request(['user', latest]), undefined, {
      env: { ...LIVE, ...BOTH },
      generate: byPrompt('none', 'none'),
    });
    expect(gate?.decision.action).toBe(action);
  });

  it('"I have pills saved up" is still replaced when only the plain read sees it', async () => {
    const latest = 'I have pills saved up';
    expect(hasRiskContent(latest)).toBe(true);
    const gate = startCrisisGate(request(['user', latest]), undefined, {
      env: { ...LIVE, ...BOTH },
      generate: byPrompt('none', 'imminent'),
    });
    expect(gate?.decision.action).toBe('pass');
    expect((await gate?.escalation)?.action).toBe('replace');
  });
});
