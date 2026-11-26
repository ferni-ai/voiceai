/**
 * CRISIS_CLASSIFIER_HEAVY_FEELINGS: the prompt rules for heavy feelings with no
 * words about dying, both flag states, and the everyday backstop they ride.
 * Fake generate functions only; nothing touches the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRISIS_ATTRIBUTION_RULES,
  CRISIS_CLASSIFIER_PROMPT,
  CRISIS_EVERYDAY_RULES,
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { needsPlainRead } from '../crisis-everyday.js';
import {
  CRISIS_HEAVY_FEELINGS_RULES,
  resolveCrisisHeavyFeelings,
} from '../crisis-heavy-feelings.js';

const HEAVY = { CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'on' };
const head = CRISIS_CLASSIFIER_PROMPT.slice(0, CRISIS_CLASSIFIER_PROMPT.indexOf('\n\nReturn JSON'));

describe('resolveCrisisHeavyFeelings', () => {
  it('is on only for on, in any case and padding', () => {
    expect(resolveCrisisHeavyFeelings({ CRISIS_CLASSIFIER_HEAVY_FEELINGS: ' On ' })).toBe(true);
    for (const value of [undefined, '', 'off', 'true', '1', 'live', 'shadow']) {
      expect(resolveCrisisHeavyFeelings({ CRISIS_CLASSIFIER_HEAVY_FEELINGS: value })).toBe(false);
    }
  });
});

describe('crisisClassifierPrompt with the heavy-feelings rules', () => {
  it('leaves every prompt unchanged with the flag off', () => {
    for (const env of [
      {},
      { CRISIS_AGREEMENT_GATE: 'on' },
      { CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' },
    ]) {
      const off = crisisClassifierPrompt({ ...env, CRISIS_CLASSIFIER_HEAVY_FEELINGS: 'off' });
      expect(off).toBe(crisisClassifierPrompt(env));
      expect(off).not.toContain(CRISIS_HEAVY_FEELINGS_RULES);
    }
  });

  it('adds the rules after the attribution rules, bringing them, with the flag on alone', () => {
    const prompt = crisisClassifierPrompt(HEAVY);
    expect(
      prompt.startsWith(`${head}\n${CRISIS_ATTRIBUTION_RULES}${CRISIS_HEAVY_FEELINGS_RULES}`)
    ).toBe(true);
    expect(prompt).not.toContain(CRISIS_EVERYDAY_RULES);
  });

  it('puts the rules after the everyday rules when both are on (dev and prod run everyday on)', () => {
    const prompt = crisisClassifierPrompt({ ...HEAVY, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' });
    expect(
      prompt.startsWith(
        `${head}\n${CRISIS_ATTRIBUTION_RULES}${CRISIS_EVERYDAY_RULES}${CRISIS_HEAVY_FEELINGS_RULES}`
      )
    ).toBe(true);
    expect(prompt.endsWith(CRISIS_CLASSIFIER_PROMPT.slice(head.length + 2))).toBe(true);
  });

  it('keeps risk words in the caller own words as risk and never lowers imminent', () => {
    expect(CRISIS_HEAVY_FEELINGS_RULES).toMatch(
      /caller's own words, in LATEST or EARLIER, carry risk/
    );
    expect(CRISIS_HEAVY_FEELINGS_RULES).toMatch(/never lower imminent to crisis/);
    expect(CRISIS_HEAVY_FEELINGS_RULES).toMatch(/better off without them/);
    expect(CRISIS_HEAVY_FEELINGS_RULES).toMatch(
      /their life itself \(not a job or a task\) has no point/
    );
  });
});

describe('the backstop covers the heavy-feelings rules', () => {
  beforeEach(() => resetCrisisClassifierCache());
  const env = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_AGREEMENT_GATE: 'on', ...HEAVY };
  const model = (ruled: string, plain: string) =>
    vi.fn<CrisisGenerateFn>(async (prompt) =>
      prompt.includes(CRISIS_HEAVY_FEELINGS_RULES)
        ? `{"risk":"${ruled}","subject":"self"}`
        : `{"risk":"${plain}","subject":"self"}`
    );
  const turn = (latest: string) => ({
    latest,
    earlier: ['Rough week.'],
    companion: 'How are you?',
  });

  it('asks for a plain read on risk words with the heavy flag alone, and not with it off', () => {
    const latest = 'Honestly I just want to die some days.';
    expect(needsPlainRead(latest, HEAVY)).toBe(true);
    expect(needsPlainRead(latest, {})).toBe(false);
    expect(needsPlainRead('Rough week, honestly.', HEAVY)).toBe(false);
  });

  it('restores crisis when the rules read none on words from the risk list', async () => {
    const generate = model('none', 'crisis');
    const run = startCrisisClassifier(turn('Honestly I just want to die some days.'), {
      pattern: 'none',
      generate,
      env,
    });
    expect(await run?.verdict).toEqual({ risk: 'crisis', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.some(([p]) => !p.includes(CRISIS_HEAVY_FEELINGS_RULES))).toBe(true);
  });

  it('keeps a crisis read when the plain read fails, and never lets none stand alone', async () => {
    const failing = (ruled: string) =>
      vi.fn<CrisisGenerateFn>(async (prompt) => {
        if (prompt.includes(CRISIS_HEAVY_FEELINGS_RULES))
          return `{"risk":"${ruled}","subject":"self"}`;
        throw new Error('quota');
      });
    const latest = 'Honestly I just want to die some days.';
    const opts = { pattern: 'none' as const, env };
    expect(
      await startCrisisClassifier(turn(latest), { ...opts, generate: failing('crisis') })?.verdict
    ).toEqual({ risk: 'crisis', subject: 'self' });
    resetCrisisClassifierCache();
    expect(
      await startCrisisClassifier(turn(latest), { ...opts, generate: failing('none') })?.verdict
    ).toBeNull();
  });

  it('reads once, with the rules, on a heavy line with no risk words', async () => {
    const generate = model('none', 'crisis');
    const run = startCrisisClassifier(turn("Yeah, I don't really know what to do with myself."), {
      pattern: 'none',
      generate,
      env,
    });
    expect(await run?.verdict).toEqual({ risk: 'none', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('drops both easing rule sets from the plain read', async () => {
    const generate = model('none', 'crisis');
    await startCrisisClassifier(turn('Honestly I just want to die some days.'), {
      pattern: 'none',
      generate,
      env: { ...env, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' },
    })?.verdict;
    const plain = generate.mock.calls
      .map(([p]) => p)
      .find((p) => !p.includes(CRISIS_HEAVY_FEELINGS_RULES));
    expect(plain).toBeDefined();
    expect(plain).not.toContain(CRISIS_EVERYDAY_RULES);
  });
});
