/**
 * CRISIS_CONTEXT_V2 (crisis-context-v2.ts) through the real classifier run
 * (startCrisisClassifier): off is byte-identical to before; a turn whose own
 * words carry strong risk is read exactly as off, whatever came before; a turn
 * without them gets the narrowed prompt and Ferni's check-in marked as his.
 */
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  crisisClassifierPrompt,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { contextNarrows, narrowedPrompt, strongRisk } from '../crisis-context-v2.js';
import { needsPlainRead } from '../crisis-everyday.js';

const BASE = {
  CRISIS_CLASSIFIER_MODE: 'live',
  CRISIS_AGREEMENT_GATE: 'on',
  CRISIS_CLASSIFIER_EVERYDAY_RULES: 'on',
};
const OFF = { ...BASE, CRISIS_CONTEXT_V2: 'off' };
const ON = { ...BASE, CRISIS_CONTEXT_V2: 'on' };
const LINE_988 =
  'That sounds like a lot to carry. If it ever feels like too much, you can call or text 988 any time.';

/** Every prompt and input the model was sent. */
async function sent(env: Record<string, string>, latest: string, earlier: string[] = []) {
  const calls: Array<{ prompt: string; content: string }> = [];
  const generate: CrisisGenerateFn = async (prompt, content) => {
    calls.push({ prompt, content });
    return '{"risk":"none","subject":"self"}';
  };
  const run = startCrisisClassifier(
    { latest, earlier, companion: LINE_988 },
    { pattern: 'none', env, generate }
  );
  await run?.verdict;
  return calls;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

beforeEach(() => resetCrisisClassifierCache());

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

describe('a turn whose own words carry strong risk', () => {
  const strong = [
    'Anyway, forget the paint. I want to kill myself.',
    "I'm done, goodbye forever, I won't be here tomorrow.",
    "No, I'm fine, I just don't want to be alive.",
    'I already have the pills.',
    "It's not a crisis, I just want to die.",
    'I have a gun in my lap right now.',
    "I've decided to end my life tonight.",
  ];

  it('is never narrowed', () => {
    for (const line of strong) {
      expect(strongRisk(line), line).toBe(true);
      expect(contextNarrows(line, ON), line).toBe(false);
    }
  });

  it('is read exactly as with the flag off, after a 988 line', async () => {
    for (const line of strong) {
      resetCrisisClassifierCache();
      const off = await sent(OFF, line, ['rough day']);
      resetCrisisClassifierCache();
      const on = await sent(ON, line, ['rough day']);
      expect(on, line).toEqual(off);
    }
  });
});

describe('a turn after the caller said strong risk', () => {
  const earlier = ['I think everyone would be better off without me.', 'Yeah.'];

  it('is read exactly as with the flag off while that line is in the window', async () => {
    for (const latest of ['No.', 'Maybe.', 'not really', 'okay bye']) {
      expect(contextNarrows(latest, ON, earlier), latest).toBe(false);
      resetCrisisClassifierCache();
      const off = await sent(OFF, latest, earlier);
      resetCrisisClassifierCache();
      const on = await sent(ON, latest, earlier);
      expect(on, latest).toEqual(off);
    }
  });
});

describe('a turn without strong risk, flag on', () => {
  it('marks Ferni’s 988 line as his check-in and adds the context rules', async () => {
    const calls = await sent(ON, "no no, I'm fine, I meant the boxes", ['ugh this move']);
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain('COMPANION_CHECK_IN and EARLIER');
    expect(JSON.parse(calls[0].content)).toEqual({
      latest: "no no, I'm fine, I meant the boxes",
      earlier: ['ugh this move'],
      COMPANION_CHECK_IN: LINE_988,
    });
  });

  it('reads a goodbye as imminent only with dying, plan or means words on the call', () => {
    const prompt = narrowedPrompt(crisisClassifierPrompt(ON), ON);
    expect(prompt).toContain(
      '"tell my mom I love her after I\'m gone") with the caller\'s own words'
    );
    expect(prompt).toContain('It counts only with the caller');
  });

  it('adds the sexual-content rule only with SEXUAL_TOPIC_BOUNDARY on', () => {
    const base = crisisClassifierPrompt(ON);
    expect(narrowedPrompt(base, ON)).not.toContain('adult-topic');
    expect(narrowedPrompt(base, { ...ON, SEXUAL_TOPIC_BOUNDARY: 'on' })).toContain('adult-topic');
  });
});

describe('the everyday double read', () => {
  it('runs on a risk word as before with the flag off', () => {
    expect(needsPlainRead('okay, bye', OFF)).toBe(true);
  });

  it('skips a bye with no strong risk on the call, flag on', () => {
    expect(needsPlainRead('okay, bye', ON, ['can you call my mom'])).toBe(false);
  });

  it('runs when the caller stated strong risk earlier, or in this turn', () => {
    expect(needsPlainRead('okay, bye', ON, ['I want to die'])).toBe(true);
    expect(needsPlainRead('bye, I want to die', ON)).toBe(true);
  });
});
