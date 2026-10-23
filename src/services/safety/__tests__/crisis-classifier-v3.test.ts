/**
 * #2534: the second read. Prompt v3 reads the same turn and can only raise the base read.
 * Every test uses a fake generate function; nothing touches the network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRISIS_CLASSIFIER_PROMPT,
  type CrisisGenerateFn,
  type CrisisVerdict,
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
} from '../crisis-classifier.js';
import {
  V3_ANCHORS,
  escalateOnly,
  resolveCrisisSecondRead,
  withPromptV3,
} from '../crisis-classifier-v3.js';

const PROD = {
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  CRISIS_AGREEMENT_GATE: 'on',
};
const V3 = /Quiet preparation is often said as plain logistics/;
const reply = (risk: string) => JSON.stringify({ risk, subject: 'self' });

/** Answers the base prompt and the v3 prompt separately; null never answers (a timeout). */
function twoPrompts(base: string | null, v3: string | null) {
  return vi.fn<CrisisGenerateFn>((prompt) => {
    const answer = V3.test(prompt) ? v3 : base;
    return answer === null ? new Promise<string>(() => {}) : Promise.resolve(answer);
  });
}

const turn = { latest: 'my neighbor is taking the dog from now on', earlier: [] };

async function run(env: Record<string, string>, generate: CrisisGenerateFn) {
  return startCrisisClassifier(turn, { pattern: 'none', generate, env: { ...PROD, ...env } })
    ?.verdict;
}

describe('CRISIS_CLASSIFIER_SECOND_READ', () => {
  beforeEach(() => resetCrisisClassifierCache());

  it('is off unless on or shadow', () => {
    for (const value of [undefined, '', 'off', 'true', 'v3', 'live']) {
      expect(resolveCrisisSecondRead({ CRISIS_CLASSIFIER_SECOND_READ: value })).toBe('off');
    }
    expect(resolveCrisisSecondRead({ CRISIS_CLASSIFIER_SECOND_READ: ' On ' })).toBe('on');
    expect(resolveCrisisSecondRead({ CRISIS_CLASSIFIER_SECOND_READ: 'shadow' })).toBe('shadow');
  });

  it('never lowers the base read and keeps the more severe one', () => {
    const v = (risk: CrisisVerdict['risk']): CrisisVerdict => ({ risk, subject: 'self' });
    const reads = [null, v('none'), v('crisis'), v('imminent')];
    const rank = (r: CrisisVerdict | null) =>
      r ? ['none', 'crisis', 'imminent'].indexOf(r.risk) : -1;
    for (const base of reads) {
      for (const second of reads) {
        const kept = escalateOnly(base, second);
        expect(rank(kept)).toBe(Math.max(rank(base), second?.risk === 'none' ? -1 : rank(second)));
        // A tie or a weaker second read with the same subject is the base itself.
        if (rank(second) <= rank(base)) expect(kept).toEqual(base);
      }
    }
    // A second read that found nothing never turns a failed base read into a clear none.
    expect(escalateOnly(null, v('none'))).toBeNull();
  });

  it("never moves the caller's own risk to someone else's, and lifts someone else's to theirs", () => {
    const self = (risk: CrisisVerdict['risk']): CrisisVerdict => ({ risk, subject: 'self' });
    const other = (risk: CrisisVerdict['risk']): CrisisVerdict => ({
      risk,
      subject: 'third_party',
    });
    expect(escalateOnly(self('crisis'), other('crisis'))).toEqual(self('crisis'));
    expect(escalateOnly(self('crisis'), other('imminent'))).toEqual(self('imminent'));
    expect(escalateOnly(other('crisis'), self('crisis'))).toEqual(self('crisis'));
    expect(escalateOnly(other('imminent'), self('crisis'))).toEqual(self('imminent'));
    expect(escalateOnly(other('crisis'), other('imminent'))).toEqual(other('imminent'));
    expect(escalateOnly(other('crisis'), other('crisis'))).toEqual(other('crisis'));
    // A base that read none takes the second read whole.
    expect(escalateOnly(self('none'), other('crisis'))).toEqual(other('crisis'));
  });

  it('off: one read with the base prompt, as before', async () => {
    const generate = twoPrompts(reply('none'), reply('crisis'));
    expect(await run({}, generate)).toEqual({ risk: 'none', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).not.toMatch(V3);
  });

  it('on: v3 lifts a missed read and never lowers one', async () => {
    expect(
      await run({ CRISIS_CLASSIFIER_SECOND_READ: 'on' }, twoPrompts(reply('none'), reply('crisis')))
    ).toEqual({ risk: 'crisis', subject: 'self' });
    resetCrisisClassifierCache();
    expect(
      await run(
        { CRISIS_CLASSIFIER_SECOND_READ: 'on' },
        twoPrompts(reply('imminent'), reply('none'))
      )
    ).toEqual({ risk: 'imminent', subject: 'self' });
    resetCrisisClassifierCache();
    expect(
      await run(
        { CRISIS_CLASSIFIER_SECOND_READ: 'on' },
        twoPrompts(reply('imminent'), reply('crisis'))
      )
    ).toEqual({ risk: 'imminent', subject: 'self' });
  });

  it('on: both reads go out at once, the v3 one on the same prompt plus v3', async () => {
    const generate = twoPrompts(reply('none'), reply('none'));
    const pending = run({ CRISIS_CLASSIFIER_SECOND_READ: 'on' }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0]).toBe(withPromptV3(generate.mock.calls[0][0]));
    expect(generate.mock.calls[1][1]).toBe(generate.mock.calls[0][1]);
    await pending;
  });

  it('on: a v3 read that times out leaves the base read as it was', async () => {
    const env = { CRISIS_CLASSIFIER_SECOND_READ: 'on', CRISIS_CLASSIFIER_TIMEOUT_MS: '20' };
    expect(await run(env, twoPrompts(reply('crisis'), null))).toEqual({
      risk: 'crisis',
      subject: 'self',
    });
  });

  it('shadow: v3 is read but never used, and the turn never waits on it', async () => {
    const lifted = twoPrompts(reply('none'), reply('crisis'));
    expect(await run({ CRISIS_CLASSIFIER_SECOND_READ: 'shadow' }, lifted)).toEqual({
      risk: 'none',
      subject: 'self',
    });
    expect(lifted).toHaveBeenCalledTimes(2);
    resetCrisisClassifierCache();
    // v3 never answers; the base read resolves on its own.
    const hung = twoPrompts(reply('none'), null);
    const verdict = run({ CRISIS_CLASSIFIER_SECOND_READ: 'shadow' }, hung);
    expect(
      await Promise.race([verdict, new Promise((r) => setTimeout(() => r('waited'), 200))])
    ).toEqual({ risk: 'none', subject: 'self' });
  });

  it('a turn read with the second read off and on never shares one cached run', async () => {
    const generate = twoPrompts(reply('none'), reply('crisis'));
    expect(await run({}, generate)).toEqual({ risk: 'none', subject: 'self' });
    expect(await run({ CRISIS_CLASSIFIER_SECOND_READ: 'on' }, generate)).toEqual({
      risk: 'crisis',
      subject: 'self',
    });
  });
});

describe('prompt v3', () => {
  it('adds its three parts to the prompt prod builds, with or without the everyday rules', () => {
    for (const env of [PROD, { ...PROD, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'off' }, {}]) {
      const base = crisisClassifierPrompt(env);
      const v3 = withPromptV3(base);
      expect(v3).toMatch(V3);
      expect(v3).toMatch(/LATEST must carry the risk itself/);
      expect(v3).toMatch(/a pen pal, a thank-you card/);
      expect(v3.indexOf('LATEST must carry the risk itself')).toBeLessThan(
        v3.indexOf('Return JSON only')
      );
      for (const line of base.split('\n').filter(Boolean)) expect(v3).toContain(line.slice(0, 60));
    }
  });

  it('the anchors v3 relies on are in the prompt, so it cannot silently do nothing', () => {
    expect(CRISIS_CLASSIFIER_PROMPT).toContain(V3_ANCHORS.rules);
    expect(CRISIS_CLASSIFIER_PROMPT).toContain(V3_ANCHORS.none);
    expect(withPromptV3(CRISIS_CLASSIFIER_PROMPT)).not.toBe(CRISIS_CLASSIFIER_PROMPT);
    expect(withPromptV3('no anchors here')).toBe('no anchors here');
  });
});
