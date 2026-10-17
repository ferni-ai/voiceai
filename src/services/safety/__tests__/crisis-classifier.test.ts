/**
 * Crisis Classifier — parsing, failure handling, modes and the merge rules.
 * Every test uses a fake generate function; nothing touches the network.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CRISIS_ATTRIBUTION_RULES,
  CRISIS_CLASSIFIER_PROMPT,
  CRISIS_EVERYDAY_RULES,
  crisisClassifierPrompt,
  resolveCrisisEverydayRules,
  DEFAULT_CRISIS_CLASSIFIER_TIMEOUT_MS,
  classifyCrisis,
  resetCrisisClassifierCache,
  parseClassifierReply,
  resolveCrisisClassifierMode,
  resolveCrisisClassifierTimeoutMs,
  startCrisisClassifier,
  turnVerdicts,
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

  it("sends Ferni's line before the caller's, without SSML, and omits it when unknown", async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    await classifyCrisis(
      {
        latest: "So tell me again, step by step, how you'd do it now.",
        earlier: [],
        companion: 'We could start with a morning hike,<break time="80ms"/> then a movie night.',
      },
      generate
    );
    await classifyCrisis({ latest: 'hi', earlier: [] }, generate);
    expect(JSON.parse(generate.mock.calls[0][1]).companion).toBe(
      'We could start with a morning hike, then a movie night.'
    );
    expect(JSON.parse(generate.mock.calls[1][1])).not.toHaveProperty('companion');
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

describe("Ferni's lines are Ferni's (CRISIS_AGREEMENT_GATE)", () => {
  beforeEach(() => resetCrisisClassifierCache());

  it('leaves the prompt as it was with the gate off', () => {
    expect(crisisClassifierPrompt({})).toBe(CRISIS_CLASSIFIER_PROMPT);
    expect(crisisClassifierPrompt({ CRISIS_AGREEMENT_GATE: 'off' })).toBe(CRISIS_CLASSIFIER_PROMPT);
  });

  it('adds the attribution rules before the output format with the gate on', () => {
    const prompt = crisisClassifierPrompt({ CRISIS_AGREEMENT_GATE: 'on' });
    expect(prompt).toContain(CRISIS_ATTRIBUTION_RULES);
    expect(prompt.indexOf(CRISIS_ATTRIBUTION_RULES)).toBeLessThan(
      prompt.indexOf('Return JSON only')
    );
    expect(prompt.startsWith(CRISIS_CLASSIFIER_PROMPT.split('Return JSON only')[0])).toBe(true);
  });

  it('sends the model the prompt for its environment, one call per prompt', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const input = {
      latest: 'You Fern.',
      earlier: [],
      companion: 'sometimes the easiest thing is the only thing that makes sense',
    };
    const live = { CRISIS_CLASSIFIER_MODE: 'live' };
    await startCrisisClassifier(input, { pattern: 'none', generate, env: live })?.verdict;
    await startCrisisClassifier(input, {
      pattern: 'none',
      generate,
      env: { ...live, CRISIS_AGREEMENT_GATE: 'on' },
    })?.verdict;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toBe(CRISIS_CLASSIFIER_PROMPT);
    expect(generate.mock.calls[1][0]).toContain(CRISIS_ATTRIBUTION_RULES);
  });
});

describe('turnVerdicts (security review finding 2)', () => {
  beforeEach(() => resetCrisisClassifierCache());

  it("never lets another turn's none soften a read; another turn's crisis still counts", async () => {
    const env = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_AGREEMENT_GATE: 'on' };
    const scope = 'session-turns';
    const pasta = { latest: 'same.', earlier: [], companion: 'I made pasta again' };
    const point = { latest: 'same.', earlier: [], companion: "some days I don't see the point" };
    await startCrisisClassifier(pasta, {
      pattern: 'none',
      env,
      scope,
      generate: replying('{"risk":"none","subject":"self"}'),
    })?.verdict;
    await startCrisisClassifier(point, {
      pattern: 'none',
      env,
      scope,
      generate: replying('{"risk":"crisis","subject":"self"}'),
    })?.verdict;
    expect(await turnVerdicts(scope, point)).toEqual([{ risk: 'crisis', subject: 'self' }]);
    // Fail closed: a crisis read of the same words is never ignored.
    expect(await turnVerdicts(scope, pasta)).toEqual([
      { risk: 'none', subject: 'self' },
      { risk: 'crisis', subject: 'self' },
    ]);
  });

  it('pairs two reads of one turn whose older history differs', async () => {
    const env = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_AGREEMENT_GATE: 'on' };
    const scope = 'session-one-turn';
    const gate = {
      latest: 'Why is that?',
      earlier: ['Hi.', 'Long drive.'],
      companion: 'How was it?',
    };
    const pipeline = { ...gate, earlier: ['Long drive.', 'Why is that?'] };
    await startCrisisClassifier(gate, {
      pattern: 'none',
      env,
      scope,
      generate: replying('{"risk":"none","subject":"self"}'),
    })?.verdict;
    await startCrisisClassifier(pipeline, {
      pattern: 'none',
      env,
      scope,
      generate: replying('{"risk":"crisis","subject":"self"}'),
    })?.verdict;
    expect(await turnVerdicts(scope, gate)).toHaveLength(2);
  });

  it('finds no reads, so nothing to soften, for a turn it never saw', async () => {
    expect(await turnVerdicts('session-none', { latest: 'same.', earlier: [] })).toEqual([]);
  });
});

describe('everyday call business (CRISIS_CLASSIFIER_EVERYDAY_RULES)', () => {
  beforeEach(() => resetCrisisClassifierCache());
  const attributed = CRISIS_CLASSIFIER_PROMPT.replace(
    '\n\nReturn JSON only',
    `\n${CRISIS_ATTRIBUTION_RULES}\n\nReturn JSON only`
  );

  it('is off unless set to on, and leaves both existing prompts exactly as they were', () => {
    for (const value of [undefined, '', 'off', 'true', '1']) {
      expect(resolveCrisisEverydayRules({ CRISIS_CLASSIFIER_EVERYDAY_RULES: value })).toBe(false);
      const env = { CRISIS_CLASSIFIER_EVERYDAY_RULES: value };
      expect(crisisClassifierPrompt(env)).toBe(CRISIS_CLASSIFIER_PROMPT);
      expect(crisisClassifierPrompt({ ...env, CRISIS_AGREEMENT_GATE: 'on' })).toBe(attributed);
    }
    expect(resolveCrisisEverydayRules({ CRISIS_CLASSIFIER_EVERYDAY_RULES: ' On ' })).toBe(true);
  });

  it('adds the everyday rules, always with the attribution rules, before the output format', () => {
    for (const gate of ['on', 'off']) {
      const prompt = crisisClassifierPrompt({
        CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
        CRISIS_AGREEMENT_GATE: gate,
      });
      expect(prompt).toContain(CRISIS_ATTRIBUTION_RULES);
      expect(prompt).toContain(CRISIS_EVERYDAY_RULES);
      expect(prompt.indexOf(CRISIS_EVERYDAY_RULES)).toBeLessThan(
        prompt.indexOf('Return JSON only')
      );
      const head = CRISIS_CLASSIFIER_PROMPT.split('\n\nReturn JSON only')[0];
      expect(
        prompt.startsWith(`${head}\n${CRISIS_ATTRIBUTION_RULES}${CRISIS_EVERYDAY_RULES}`)
      ).toBe(true);
    }
  });

  it('keeps farewell messages, risk in earlier words, and answers to safety talk out of "none"', () => {
    expect(CRISIS_EVERYDAY_RULES).toMatch(/caller's own words, in LATEST or EARLIER, carry risk/);
    expect(CRISIS_EVERYDAY_RULES).toMatch(/sounds like a farewell .* is not everyday words/);
    expect(CRISIS_EVERYDAY_RULES).toMatch(
      /what the caller says back to them is judged as the caller's words/
    );
  });

  it('sends the model the everyday prompt with the flag on', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const input = {
      latest: 'Is that call going through?',
      earlier: ['Can you ring my brother and say hi?'],
      companion: "I'm dialing him now. Hang tight, I'll call you right back.",
    };
    const env = { CRISIS_CLASSIFIER_MODE: 'live', CRISIS_AGREEMENT_GATE: 'on' };
    await startCrisisClassifier(input, { pattern: 'none', generate, env })?.verdict;
    await startCrisisClassifier(input, {
      pattern: 'none',
      generate,
      env: { ...env, CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on' },
    })?.verdict;
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toBe(attributed);
    expect(generate.mock.calls[1][0]).toContain(CRISIS_EVERYDAY_RULES);
  });
});

describe('everyday rules backstop: risk words keep the read the rules would lower', () => {
  beforeEach(() => resetCrisisClassifierCache());
  const env = {
    CRISIS_CLASSIFIER_MODE: 'live',
    CRISIS_AGREEMENT_GATE: 'on',
    CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
  };
  /** Fake model: the read with the everyday rules says `ruled`, the read without says `plain`. */
  const model = (ruled: string, plain: string) =>
    vi.fn<CrisisGenerateFn>(async (prompt) =>
      prompt.includes(CRISIS_EVERYDAY_RULES)
        ? `{"risk":"${ruled}","subject":"self"}`
        : `{"risk":"${plain}","subject":"self"}`
    );
  const turn = (latest: string) => ({ latest, earlier: [], companion: 'What are you up to?' });

  it('restores imminent when the rules read only crisis on words from the risk list', async () => {
    const generate = model('crisis', 'imminent');
    const run = startCrisisClassifier(
      turn("Stopped my meds, and I'm giving my stuff away Friday."),
      {
        pattern: 'none',
        generate,
        env,
      }
    );
    expect(await run?.verdict).toEqual({ risk: 'imminent', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('restores crisis when the rules read none on words from the risk list', async () => {
    const generate = model('none', 'crisis');
    const run = startCrisisClassifier(turn('Okay, bye. Thanks for everything.'), {
      pattern: 'none',
      generate,
      env,
    });
    expect(await run?.verdict).toEqual({ risk: 'crisis', subject: 'self' });
  });

  it('keeps a crisis read when the read without the rules fails, and never lets none stand alone', async () => {
    const failing = (ruled: string) =>
      vi.fn<CrisisGenerateFn>(async (prompt) => {
        if (prompt.includes(CRISIS_EVERYDAY_RULES)) return `{"risk":"${ruled}","subject":"self"}`;
        throw new Error('quota');
      });
    const latest = "Stopped my meds, and I'm giving my stuff away Friday.";
    const opts = { pattern: 'none' as const, env };
    expect(
      await startCrisisClassifier(turn(latest), { ...opts, generate: failing('crisis') })?.verdict
    ).toEqual({ risk: 'crisis', subject: 'self' });
    resetCrisisClassifierCache();
    expect(
      await startCrisisClassifier(turn(latest), { ...opts, generate: failing('none') })?.verdict
    ).toBeNull();
  });

  it('reads once, with the rules alone, when the caller used no risk words', async () => {
    const generate = model('none', 'imminent');
    const run = startCrisisClassifier(turn('Is the call going through?'), {
      pattern: 'none',
      generate,
      env,
    });
    expect(await run?.verdict).toEqual({ risk: 'none', subject: 'self' });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('never makes the second read with the flag off', async () => {
    const generate = model('none', 'imminent');
    const { CRISIS_CLASSIFIER_EVERYDAY_RULES: _off, ...gateOnly } = env;
    await startCrisisClassifier(turn("Stopped my meds, and I'm giving my stuff away Friday."), {
      pattern: 'none',
      generate,
      env: gateOnly,
    })?.verdict;
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('the attribution rules (security review finding 4)', () => {
  it("count anything in the caller's turn as the caller's words, quotes included", () => {
    expect(CRISIS_ATTRIBUTION_RULES).toMatch(
      /everything in LATEST and EARLIER is the caller's own words/
    );
    expect(CRISIS_ATTRIBUTION_RULES).toMatch(/Ferni said/);
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

  it('shares one call when the two callers pass the history differently (the turn pipeline includes the latest message, the chat context leaves it out)', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    const turnPipeline = {
      latest: "I'm tired of all of it",
      earlier: ['rough week', "I'm tired of all of it"],
    };
    const chatContext = { latest: "I'm tired of all of it ", earlier: ['rough week'] };
    await startCrisisClassifier(turnPipeline, { pattern: 'none', generate, env })?.verdict;
    await startCrisisClassifier(chatContext, { pattern: 'none', generate, env })?.verdict;
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("shares one call when the gate sees Ferni's line with SSML and the turn pipeline without", async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    const said = { latest: 'how high is it?', earlier: [] };
    await startCrisisClassifier(
      { ...said, companion: 'You could jump off the dock.<break time="80ms"/> It is warm.' },
      { pattern: 'none', generate, env }
    )?.verdict;
    await startCrisisClassifier(
      { ...said, companion: 'You could jump off the dock. It is warm.' },
      { pattern: 'none', generate, env }
    )?.verdict;
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("calls again when Ferni's line differs: it changes what the words mean", async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    const said = { latest: 'how high is it?', earlier: [] };
    await startCrisisClassifier(
      { ...said, companion: 'The dock is fun.' },
      { pattern: 'none', generate, env }
    )?.verdict;
    await startCrisisClassifier(
      { ...said, companion: 'The bridge is tall.' },
      { pattern: 'none', generate, env }
    )?.verdict;
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('still calls again when the earlier context really differs', async () => {
    const generate = vi.fn<CrisisGenerateFn>(async () => '{"risk":"none","subject":"self"}');
    const env = { CRISIS_CLASSIFIER_MODE: 'live' };
    await startCrisisClassifier(
      { latest: 'ok', earlier: ['I want to disappear'] },
      { pattern: 'none', generate, env }
    )?.verdict;
    await startCrisisClassifier(
      { latest: 'ok', earlier: ['great day at the park'] },
      { pattern: 'none', generate, env }
    )?.verdict;
    expect(generate).toHaveBeenCalledTimes(2);
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
