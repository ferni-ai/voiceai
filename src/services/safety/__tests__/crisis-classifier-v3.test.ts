/**
 * #2534: the second read. Prompt v3 reads the same turn and fills only a base read that found nothing.
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
  mayFill,
  withPromptV3,
  withSecondRead,
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

const turn = {
  latest: 'my neighbor is taking the dog from now on',
  earlier: [],
  companion: 'At this rate mine is going to grow roots.',
};

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

  it('fills only a base read that found nothing, with the second read whole', () => {
    const read = (
      risk: CrisisVerdict['risk'],
      subject: CrisisVerdict['subject']
    ): CrisisVerdict => ({
      risk,
      subject,
    });
    const reads: Array<CrisisVerdict | null> = [null];
    for (const risk of ['none', 'crisis', 'imminent'] as const) {
      for (const subject of ['self', 'third_party'] as const) reads.push(read(risk, subject));
    }
    for (const base of reads) {
      for (const second of reads) {
        const kept = escalateOnly(base, second);
        // A base that found risk is kept exactly: never raised, never mixed.
        if (base && base.risk !== 'none') expect(kept).toBe(base);
        // Otherwise the second read whole, if it found risk; else the base as it was.
        else if (second && second.risk !== 'none') expect(kept).toBe(second);
        else expect(kept).toBe(base);
      }
    }
    // Never a verdict neither read gave (#2548 round 1: crisis/self + imminent/third party).
    expect(escalateOnly(read('crisis', 'self'), read('imminent', 'third_party'))).toEqual(
      read('crisis', 'self')
    );
    // A second read that found nothing never turns a failed base read into a clear none.
    expect(escalateOnly(null, read('none', 'self'))).toBeNull();
  });

  it('off: one read with the base prompt, as before', async () => {
    const generate = twoPrompts(reply('none'), reply('crisis'));
    expect(await run({}, generate)).toEqual({ risk: 'none', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0]).not.toMatch(V3);
  });

  it('on: v3 fills a missed read and never changes one that found risk', async () => {
    const on = { CRISIS_CLASSIFIER_SECOND_READ: 'on' };
    expect(await run(on, twoPrompts(reply('none'), reply('crisis')))).toEqual({
      risk: 'crisis',
      subject: 'self',
    });
    for (const [base, v3] of [
      ['imminent', 'none'],
      ['imminent', 'crisis'],
      ['crisis', 'imminent'],
    ]) {
      resetCrisisClassifierCache();
      expect(await run(on, twoPrompts(reply(base), reply(v3))), `${base}+${v3}`).toEqual({
        risk: base,
        subject: 'self',
      });
    }
  });

  it('on: a base read that found risk never waits for v3', async () => {
    // v3 never answers: the turn resolves on the base read alone.
    const verdict = run({ CRISIS_CLASSIFIER_SECOND_READ: 'on' }, twoPrompts(reply('crisis'), null));
    expect(
      await Promise.race([verdict, new Promise((r) => setTimeout(() => r('waited'), 200))])
    ).toEqual({ risk: 'crisis', subject: 'self' });
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
    expect(await run(env, twoPrompts(reply('none'), null))).toEqual({
      risk: 'none',
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

describe('a run shared between the gate and the pipeline', () => {
  it("never carries a fill across the patterns' outcomes", async () => {
    resetCrisisClassifierCache();
    const env = { ...PROD, CRISIS_CLASSIFIER_SECOND_READ: 'on' };
    const generate = twoPrompts(reply('none'), reply('imminent'));
    const filled = startCrisisClassifier(turn, { pattern: 'none', generate, env });
    expect(await filled?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
    // The same words, read where the patterns found risk (a worry about someone else).
    const held = startCrisisClassifier(turn, { pattern: 'crisis', generate, env });
    expect(await held?.verdict).toEqual({ risk: 'none', subject: 'self' });
  });
});

const NONE_TURN = { pattern: 'none' as const, lines: [] };

describe('mayFill: one turn-level decision', () => {
  it('fills only where the patterns found nothing and no caller line carries any signal', () => {
    const clean = ['my neighbor is taking the dog from now on', 'we went hiking'];
    expect(mayFill({ pattern: 'none', lines: clean })).toBe(true);
    expect(mayFill({ pattern: 'crisis', lines: clean })).toBe(false);
    expect(mayFill({ pattern: 'block', lines: clean })).toBe(false);
    // A worry about someone else, in any line, and the caller's own distress, in any line.
    for (const line of [
      'my friend keeps saying she wants to kill herself',
      'everything is too much right now.',
    ]) {
      expect(mayFill({ pattern: 'none', lines: [...clean, line] }), line).toBe(false);
      expect(mayFill({ pattern: 'none', lines: [line, ...clean] }), line).toBe(false);
    }
  });
});

describe('withSecondRead, directly', () => {
  const ON = { CRISIS_CLASSIFIER_SECOND_READ: 'on' };
  const v = (risk: CrisisVerdict['risk'], subject: CrisisVerdict['subject'] = 'self') => ({
    risk,
    subject,
  });

  it('fills only where the patterns found nothing too (#2548 round 2)', async () => {
    const second = v('imminent');
    for (const pattern of ['crisis', 'block'] as const) {
      const read = vi.fn(async () => second);
      expect(
        await withSecondRead(Promise.resolve(v('none')), read, 'p', { pattern, lines: [] }, ON),
        pattern
      ).toEqual(v('none'));
      expect(
        await withSecondRead(Promise.resolve(null), read, 'p', { pattern, lines: [] }, ON),
        pattern
      ).toBeNull();
    }
    expect(
      await withSecondRead(Promise.resolve(v('none')), async () => second, 'p', NONE_TURN, ON)
    ).toBe(second);
  });

  it('takes the second read whole, never a mix', async () => {
    const second = v('imminent', 'third_party');
    const kept = await withSecondRead(
      Promise.resolve(v('none')),
      async () => second,
      'p',
      NONE_TURN,
      ON
    );
    expect(kept).toBe(second);
  });

  it('a second read that throws or rejects is no read', async () => {
    const thrown = () => {
      throw new Error('boom');
    };
    const rejected = async () => {
      throw new Error('boom');
    };
    for (const read of [thrown, rejected]) {
      expect(await withSecondRead(Promise.resolve(v('none')), read, 'p', NONE_TURN, ON)).toEqual(
        v('none')
      );
    }
  });

  it('shadow: the log never leaves an unhandled rejection', async () => {
    const seen: unknown[] = [];
    const onUnhandled = (reason: unknown) => seen.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      const base = Promise.reject(new Error('base failed'));
      const out = withSecondRead(base, async () => v('crisis'), 'p', NONE_TURN, {
        CRISIS_CLASSIFIER_SECOND_READ: 'shadow',
      });
      await expect(out).rejects.toThrow('base failed');
      await new Promise((r) => setTimeout(r, 20));
      expect(seen).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it("v3 sees exactly what the base read sees, Ferni's line included", async () => {
    resetCrisisClassifierCache();
    const generate = twoPrompts(reply('none'), reply('none'));
    await run({ CRISIS_CLASSIFIER_SECOND_READ: 'on' }, generate);
    const contents = generate.mock.calls.map(([, content]) => JSON.parse(content));
    expect(contents).toHaveLength(2);
    expect(contents[1]).toEqual(contents[0]);
    expect(contents[1].companion).toBe(turn.companion);
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
