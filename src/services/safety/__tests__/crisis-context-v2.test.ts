/**
 * CRISIS_CONTEXT_V2 (crisis-context-v2.ts) through the real classifier run
 * (startCrisisClassifier): off is byte-identical to before; on, the only
 * changes are Ferni's check-in marked as his and, with SEXUAL_TOPIC_BOUNDARY
 * on, the sexual-content rule; a call where main's detector or the patterns
 * found risk is read exactly as off for the rest of the call; a turn gets
 * the narrowed prompt and Ferni's check-in marked as his, never as evidence.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { callNarrowingHeld, holdCallNarrowing, resetCrisisCallRisk } from '../crisis-call-risk.js';
import { contextNarrows, narrowedPrompt } from '../crisis-context-v2.js';

const BASE = {
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const OFF = { ...BASE, CRISIS_CONTEXT_V2: 'off' };
const ON = { ...BASE, CRISIS_CONTEXT_V2: 'on' };
const LINE_988 =
  'That sounds like a lot to carry. If it ever feels like too much, you can call or text 988 any time.';

/** Every prompt and input the model was sent for one turn. */
async function sent(
  env: Record<string, string>,
  latest: string,
  earlier: string[] = [],
  call?: string
) {
  const calls: Array<{ prompt: string; content: string }> = [];
  const generate: CrisisGenerateFn = async (prompt, content) => {
    calls.push({ prompt, content });
    return '{"risk":"none","subject":"self"}';
  };
  const run = startCrisisClassifier(
    { latest, earlier, companion: LINE_988 },
    { pattern: 'none', env, generate, call }
  );
  await run?.verdict;
  return calls;
}

/** The same turn read off and on, from fresh state: equal means "read exactly as off". */
async function offAndOn(latest: string, earlier: string[] = [], call?: string) {
  resetCrisisClassifierCache();
  const off = await sent(OFF, latest, earlier, call);
  resetCrisisClassifierCache();
  const on = await sent(ON, latest, earlier, call);
  return { off, on };
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => {
  resetCrisisClassifierCache();
  resetCrisisCallRisk();
});

describe('CRISIS_CONTEXT_V2 off', () => {
  it('builds the same prompts as before the flag, byte for byte', () => {
    // sha256 of crisisClassifierPrompt on main 3358102f1, before this flag existed.
    const golden: Array<[Record<string, string>, string]> = [
      [{}, '3feb70183d09114c4765dc6eb07e3062f7b9bcac49d933bab6de702c8c1884da'],
      [
        { CRISIS_AGREEMENT_GATE: 'on' },
        '4fb37bee5d3f08d14d4149695aaa872f331b8a8386079376d4f3f9c6df5f9689',
      ],
      [BASE, 'e7d9d817db33250956864144a078e25402a423647006a3a39874430bf6befb5f'],
    ];
    for (const [env, hash] of golden) {
      expect(sha(crisisClassifierPrompt({ ...env, CRISIS_CONTEXT_V2: 'off' }))).toBe(hash);
      expect(sha(crisisClassifierPrompt({ ...env, CRISIS_CONTEXT_V2: 'on' }))).toBe(hash);
    }
  });

  it('sends the model the base prompt and the companion line as before', async () => {
    const calls = await sent(OFF, 'yeah', ['ugh this move']);
    expect(calls[0].prompt).toBe(crisisClassifierPrompt(OFF));
    expect(JSON.parse(calls[0].content)).toEqual({
      latest: 'yeah',
      earlier: ['ugh this move'],
      companion: LINE_988,
    });
  });
});

const BASE_PROMPT = () => crisisClassifierPrompt(ON);
const ANCHOR = '\n\nReturn JSON only';

/** What the flag added to main's prompt, or null when the prompt is not main's plus one insert. */
function added(prompt: string): string | null {
  const base = BASE_PROMPT();
  const at = base.indexOf(ANCHOR);
  if (!prompt.startsWith(base.slice(0, at)) || !prompt.endsWith(base.slice(at))) return null;
  return prompt.slice(at, prompt.length - (base.length - at));
}

describe('a turn after Ferni’s check-in, flag on', () => {
  it('marks Ferni’s 988 line as his check-in, and adds only the check-in rule', async () => {
    const calls = await sent(
      ON,
      "no no, I'm fine, I meant the boxes",
      ['ugh this move'],
      'v2-mark'
    );
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].content)).toEqual({
      latest: "no no, I'm fine, I meant the boxes",
      earlier: ['ugh this move'],
      COMPANION_CHECK_IN: LINE_988,
    });
    const rule = added(calls[0].prompt);
    expect(rule).toContain('COMPANION_CHECK_IN, when the input has it');
    expect(rule?.trim().split('\n')).toHaveLength(1);
  });

  it('says the check-in is not by itself a sign of risk, and never lowers what the caller said', () => {
    const rule = added(narrowedPrompt(BASE_PROMPT(), true, ON)) ?? '';
    expect(rule).toContain('the check-in by itself is not a sign that the caller is at risk');
    expect(rule).toContain("judge the caller's own words in LATEST and EARLIER exactly as above");
    expect(rule).toContain('never lowers imminent to crisis');
    expect(rule).not.toMatch(
      /is evidence|counts as evidence|errand|goodbye|on its own words|only when/i
    );
  });

  it('adds the sexual-content rule only with SEXUAL_TOPIC_BOUNDARY on', () => {
    expect(narrowedPrompt(BASE_PROMPT(), true, ON)).not.toContain('adult-topic');
    const sexual = { ...ON, SEXUAL_TOPIC_BOUNDARY: 'on' };
    expect(narrowedPrompt(BASE_PROMPT(), true, sexual)).toContain('adult-topic');
    expect(added(narrowedPrompt(BASE_PROMPT(), false, sexual))).toMatch(/^\n\n- Sexual/);
    expect(narrowedPrompt(BASE_PROMPT(), false, ON)).toBe(BASE_PROMPT());
  });
});

describe('a turn with no check-in', () => {
  it('is read exactly as off when SEXUAL_TOPIC_BOUNDARY is off', async () => {
    const latest = 'I just need a break from everything, you know?';
    const reads: Record<string, Array<{ prompt: string; content: string }>> = {};
    for (const [arm, env] of [
      ['off', OFF],
      ['on', ON],
    ] as const) {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      const calls: Array<{ prompt: string; content: string }> = [];
      const generate: CrisisGenerateFn = async (prompt, content) => {
        calls.push({ prompt, content });
        return '{"risk":"none","subject":"self"}';
      };
      await startCrisisClassifier(
        { latest, earlier: ['rough week'], companion: 'Oh no. What happened?' },
        { pattern: 'none', env, generate, call: 'v2-no-check-in' }
      )?.verdict;
      reads[arm] = calls;
    }
    expect(reads.on.length).toBeGreaterThan(0);
    expect(reads.on).toEqual(reads.off);
  });
});

describe('a call where main’s detector or the patterns found risk', () => {
  it('is held by a risky caller line however far back, and read as off for good', async () => {
    const call = 'v2-call-hold';
    const risky = "I've been thinking about killing myself.";
    const later = ['work was okay', 'my sister called', 'I made pasta', 'gray week', 'a show'];
    expect(contextNarrows(['yeah', risky, ...later], call, false, ON)).toBe(false);
    for (const latest of ['no', 'not really', 'I guess']) {
      expect(contextNarrows([latest, ...later], call, false, ON), latest).toBe(false);
      const { off, on } = await offAndOn(latest, later, call);
      expect(on, latest).toEqual(off);
    }
  });

  it('is held when this turn’s own words score as risk', () => {
    expect(contextNarrows(["I've been thinking about killing myself."], 'v2-own', false, ON)).toBe(
      false
    );
    expect(contextNarrows(['not really'], 'v2-own', false, ON)).toBe(false);
  });

  it('holds only that call', () => {
    contextNarrows(['I want to kill myself.'], 'v2-call-a', false, ON);
    expect(contextNarrows(['not really'], 'v2-call-b', false, ON)).toBe(true);
  });

  it('is held even when the read is skipped: classifier off, or the patterns already block', async () => {
    const skipped: Array<[string, Record<string, string>]> = [
      ['v2-mode-off', { ...ON, CRISIS_CLASSIFIER_MODE: 'off' }],
      ['v2-pattern-block', ON],
    ];
    for (const [call, env] of skipped) {
      const pattern = call === 'v2-pattern-block' ? 'block' : 'crisis';
      const generate: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';
      await startCrisisClassifier(
        { latest: 'i want to slit my wrists', earlier: [], companion: LINE_988 },
        { pattern, env, generate, call }
      )?.verdict;
      expect(contextNarrows(['not really'], call, false, ON), call).toBe(false);
    }
  });

  it('is held when the patterns found risk the detector line score misses', async () => {
    const call = 'v2-pattern-crisis';
    const generate: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';
    await startCrisisClassifier(
      { latest: 'everything is pointless lately', earlier: [], companion: LINE_988 },
      { pattern: 'crisis', env: ON, generate, call }
    )?.verdict;
    expect(contextNarrows(['not really'], call, false, ON)).toBe(false);
  });

  it('stays held for the life of the call, however many other calls are held meanwhile', () => {
    const now = Date.now();
    holdCallNarrowing('v2-long-call', now);
    for (let i = 0; i < 5000; i += 1) holdCallNarrowing(`v2-other-${i}`, now + i);
    expect(callNarrowingHeld('v2-long-call', now + 5 * 60 * 60 * 1000)).toBe(true);
  });
});

describe('a turn with no call id', () => {
  it('is never changed: there is no call to hold', async () => {
    expect(contextNarrows(['yeah'], undefined, false, ON)).toBe(false);
    const { off, on } = await offAndOn("no no, I'm fine, I meant the boxes", ['ugh this move']);
    expect(on).toEqual(off);
  });
});
