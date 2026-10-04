/**
 * Crisis Classifier — parsing, failure handling, modes and the merge rules.
 * Every test uses a fake generate function; nothing touches the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRISIS_CLASSIFIER_PROMPT,
  DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS,
  classifyCrisis,
  resetCrisisClassifierCache,
  parseClassifierReply,
  resolveCrisisClassifierMode,
  resolveCrisisClassifierTimeoutMs,
  startCrisisClassifier,
  verdictOutcome,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { applyClassifierVerdict, detectCrisis, guardFromDetection } from '../crisis-guard.js';

const replying =
  (reply: string): CrisisGenerateFn =>
  async () =>
    reply;

describe('parseClassifierReply', () => {
  it('reads a plain JSON verdict', () => {
    expect(parseClassifierReply('{"risk":"imminent","subject":"self"}')).toEqual({
      risk: 'imminent',
      subject: 'self',
    });
  });

  it('reads a verdict wrapped in prose or a code fence', () => {
    expect(parseClassifierReply('```json\n{"risk":"crisis","subject":"third_party"}\n```')).toEqual(
      {
        risk: 'crisis',
        subject: 'third_party',
      }
    );
  });

  it('defaults a missing or unknown subject to self', () => {
    expect(parseClassifierReply('{"risk":"crisis"}')).toEqual({ risk: 'crisis', subject: 'self' });
    expect(parseClassifierReply('{"risk":"crisis","subject":"unclear"}')?.subject).toBe('self');
  });

  it.each(['', 'none', '{"risk":"high"}', '{"risk":', '[1,2]', '{"subject":"self"}'])(
    'rejects an unusable reply: %j',
    (reply) => {
      expect(parseClassifierReply(reply)).toBeNull();
    }
  );
});

describe('classifyCrisis', () => {
  it('sends the prompt and the latest plus earlier messages', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    await classifyCrisis(
      { latest: ' hi ', earlier: ['a', '', 'b', 'c', 'd', 'e', 'f', 'hi'] },
      generate
    );
    const [prompt, content] = generate.mock.calls[0];
    expect(prompt).toBe(CRISIS_CLASSIFIER_PROMPT);
    expect(JSON.parse(content)).toEqual({ latest: 'hi', earlier: ['b', 'c', 'd', 'e', 'f'] });
  });

  it('returns null for an empty message without calling the model', async () => {
    const generate = vi.fn<CrisisGenerateFn>();
    expect(await classifyCrisis({ latest: '   ', earlier: [] }, generate)).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('returns null and aborts the request on timeout', async () => {
    let aborted = false;
    const slow: CrisisGenerateFn = (_p, _c, signal) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        setTimeout(() => resolve('{"risk":"imminent","subject":"self"}'), 200);
      });
    expect(await classifyCrisis({ latest: 'x', earlier: [] }, slow, 10)).toBeNull();
    expect(aborted).toBe(true);
  });

  it('returns null when the model call throws', async () => {
    const failing: CrisisGenerateFn = async () => {
      throw new Error('quota');
    };
    expect(await classifyCrisis({ latest: 'x', earlier: [] }, failing)).toBeNull();
  });

  it('returns null for an unparseable reply', async () => {
    expect(
      await classifyCrisis({ latest: 'x', earlier: [] }, replying('sorry, I cannot help'))
    ).toBeNull();
  });
});

describe('modes', () => {
  it('defaults to live in production and off under tests', () => {
    expect(resolveCrisisClassifierMode({})).toBe('live');
    expect(resolveCrisisClassifierMode({ VITEST: 'true' })).toBe('off');
    expect(resolveCrisisClassifierMode({ NODE_ENV: 'test' })).toBe('off');
  });

  it('honours an explicit mode, even under tests', () => {
    expect(resolveCrisisClassifierMode({ CRISIS_CLASSIFIER_MODE: 'LIVE', VITEST: 'true' })).toBe(
      'live'
    );
    expect(resolveCrisisClassifierMode({ CRISIS_CLASSIFIER_MODE: 'off' })).toBe('off');
    expect(resolveCrisisClassifierMode({ CRISIS_CLASSIFIER_MODE: 'shadow', VITEST: 'true' })).toBe(
      'shadow'
    );
  });

  it('falls back to the default timeout for a bad value', () => {
    expect(resolveCrisisClassifierTimeoutMs({ CRISIS_CLASSIFIER_TIMEOUT_MS: '900' })).toBe(900);
    expect(resolveCrisisClassifierTimeoutMs({ CRISIS_CLASSIFIER_TIMEOUT_MS: 'soon' })).toBe(
      DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS
    );
    expect(resolveCrisisClassifierTimeoutMs({ CRISIS_CLASSIFIER_TIMEOUT_MS: '-1' })).toBe(
      DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS
    );
  });
});

describe('startCrisisClassifier', () => {
  const input = { latest: 'x', earlier: [] };
  const imminent = replying('{"risk":"imminent","subject":"self"}');
  beforeEach(() => resetCrisisClassifierCache());

  it('shares one call between requests for the same turn', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"crisis","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    const first = startCrisisClassifier(input, { pattern: 'none', generate, env });
    const second = startCrisisClassifier(input, { pattern: 'none', generate, env });
    expect(await second?.verdict).toEqual(await first?.verdict);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('calls again for a different message', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    await startCrisisClassifier(input, { pattern: 'none', generate, env })?.verdict;
    await startCrisisClassifier({ latest: 'y', earlier: [] }, { pattern: 'none', generate, env })
      ?.verdict;
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('does nothing when off', () => {
    const generate = vi.fn<CrisisGenerateFn>();
    expect(
      startCrisisClassifier(input, {
        pattern: 'none',
        generate,
        env: { CRISIS_CLASSIFIER_MODE: 'off' },
      })
    ).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('skips the call in live mode when the patterns already block', () => {
    const generate = vi.fn<CrisisGenerateFn>();
    expect(
      startCrisisClassifier(input, {
        pattern: 'block',
        generate,
        env: { CRISIS_CLASSIFIER_MODE: 'live' },
      })
    ).toBeNull();
    expect(generate).not.toHaveBeenCalled();
  });

  it('still runs in shadow mode when the patterns block, to measure agreement', async () => {
    const run = startCrisisClassifier(input, {
      pattern: 'block',
      generate: imminent,
      env: { CRISIS_CLASSIFIER_MODE: 'shadow' },
    });
    expect(run?.mode).toBe('shadow');
    expect(await run?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
  });

  it('maps verdicts onto the guard outcomes', () => {
    expect(verdictOutcome({ risk: 'imminent', subject: 'self' })).toBe('block');
    expect(verdictOutcome({ risk: 'imminent', subject: 'third_party' })).toBe('crisis');
    expect(verdictOutcome({ risk: 'crisis', subject: 'self' })).toBe('crisis');
    expect(verdictOutcome({ risk: 'none', subject: 'self' })).toBe('none');
  });
});

describe('applyClassifierVerdict', () => {
  const missed = 'im parked on the bridge, engine off, just sitting here deciding';

  it('leaves the detection unchanged without a verdict or on none', () => {
    const base = detectCrisis(missed);
    expect(applyClassifierVerdict(base, null)).toBe(base);
    expect(applyClassifierVerdict(base, { risk: 'none', subject: 'self' })).toBe(base);
  });

  it('turns an imminent verdict into a 911-first replacement', () => {
    const merged = applyClassifierVerdict(detectCrisis(missed), {
      risk: 'imminent',
      subject: 'self',
    });
    expect(guardFromDetection(merged).shouldBlock).toBe(true);
    expect(merged.indicators).toContain('classifier_imminent');
    expect(merged.suggestedResponse).toContain('911');
  });

  it('turns a crisis verdict into guidance without replacing the reply', () => {
    const merged = applyClassifierVerdict(detectCrisis('nothing really matters lately'), {
      risk: 'crisis',
      subject: 'self',
    });
    expect(merged.isCrisis).toBe(true);
    expect(guardFromDetection(merged).shouldBlock).toBe(false);
  });

  it('never replaces the reply for a worry about someone else', () => {
    const merged = applyClassifierVerdict(
      detectCrisis('my ex texted me goodbye and is not answering'),
      {
        risk: 'imminent',
        subject: 'third_party',
      }
    );
    expect(merged.subject).toBe('third_party');
    expect(merged.isCrisis).toBe(true);
    expect(guardFromDetection(merged).shouldBlock).toBe(false);
  });

  it('never lowers what the patterns found', () => {
    const base = detectCrisis("I'm going to kill myself tonight");
    expect(guardFromDetection(base).shouldBlock).toBe(true);
    const merged = applyClassifierVerdict(base, { risk: 'crisis', subject: 'self' });
    expect(merged.severity).toBe(base.severity);
    expect(guardFromDetection(merged).shouldBlock).toBe(true);
  });

  it('keeps a self subject when the patterns already found self-risk', () => {
    const base = detectCrisis('sometimes I wish I would not wake up');
    const merged = applyClassifierVerdict(base, { risk: 'crisis', subject: 'third_party' });
    expect(merged.subject).toBe('self');
  });
});
