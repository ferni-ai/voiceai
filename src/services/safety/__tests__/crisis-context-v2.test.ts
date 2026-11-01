/**
 * CRISIS_CONTEXT_V2 (crisis-context-v2.ts) through the real classifier run
 * (startCrisisClassifier): off is byte-identical to before; a turn whose own
 * words, or any earlier caller line on the call, carry strong risk is read
 * exactly as off; goodbyes keep main's rules; a turn without strong risk gets
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
import { contextNarrows, narrowedPrompt, strongRisk } from '../crisis-context-v2.js';

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

describe('strong risk phrases', () => {
  // Every line here must hold the call off narrowing: dying, means, final goodbyes,
  // preparatory acts, ongoing self-harm (independent verify of #3287, round 1).
  const strong = [
    'Anyway, forget the paint. I want to kill myself.',
    "No, I'm fine, I just don't want to be alive.",
    'I already have the pills.',
    'This is my last call.',
    "This is the last time you'll hear from me. Bye.",
    "I'm done. Thank you for everything. Goodbye.",
    'okay, bye Ferni. Thank you for everything, you were a good friend.',
    "I won't be a problem for anyone soon.",
    "I won't be around to do it.",
    "I've written letters for everyone, they're on the kitchen table.",
    "I've been saving up my meds for a while now.",
    "I gave away my guitar and my books, I won't need them.",
    "I gave my dog to my sister, she'll take care of him.",
    "I've been getting my affairs in order.",
    'I keep cutting after he makes me do stuff with him.',
    "I've been burning myself again.",
    "Bye Ferni. Tell her I'm sorry, she'll find the note.",
    "Okay goodnight. I took all of them already so it doesn't matter.",
    'Quiero morirme, ya no aguanto más.',
    'i dont wanna be alive anymore',
  ];
  // Everyday lines that share words with them: they must stay narrowable.
  const narrowable = [
    "I'm done with my homework",
    'this is the last call for drinks',
    'I gave away the old couch',
    'okay bye, talk tomorrow',
    'thank you for everything today, talk tomorrow',
    "I'm done, the cake is ready.",
    "Okay I'm done for tonight.",
    "no no, I'm fine, I meant work",
    'can you call my mom for me?',
    'yeah',
  ];

  it('flags every final goodbye, preparatory act and self-harm line', () => {
    for (const line of strong) expect(strongRisk(line), line).toBe(true);
  });

  it('leaves the everyday near-misses narrowable', () => {
    for (const line of narrowable) {
      expect(strongRisk(line), line).toBe(false);
      expect(contextNarrows(line, ON, [], 'v2-near-miss'), line).toBe(true);
    }
  });

  it('reads every strong line exactly as with the flag off, after a 988 line', async () => {
    for (const line of strong) {
      const { off, on } = await offAndOn(line, ['rough day']);
      expect(on, line).toEqual(off);
    }
  });
});

describe('a call where the caller said strong risk', () => {
  it('is never narrowed again, however far back the line was', async () => {
    const call = 'v2-call-hold';
    expect(contextNarrows("I've been thinking about killing myself.", ON, [], call)).toBe(false);
    const later = [
      'anyway, work was okay',
      'my sister called',
      'I made pasta',
      'gray week',
      'a show',
    ];
    for (const latest of ['no', 'not really', 'I guess', 'okay bye, talk tomorrow']) {
      expect(contextNarrows(latest, ON, later, call), latest).toBe(false);
      const { off, on } = await offAndOn(latest, later, call);
      expect(on, latest).toEqual(off);
    }
  });

  it('holds only that call', () => {
    contextNarrows('I want to die.', ON, [], 'v2-call-a');
    expect(contextNarrows('not really', ON, [], 'v2-call-b')).toBe(true);
  });

  it('is held even when the read is skipped: classifier off, or the patterns already block', async () => {
    const skipped: Array<[string, Record<string, string>]> = [
      ['v2-mode-off', { ...ON, CRISIS_CLASSIFIER_MODE: 'off' }],
      ['v2-pattern-block', ON],
    ];
    for (const [call, env] of skipped) {
      const pattern = call === 'v2-pattern-block' ? 'block' : 'none';
      const generate: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';
      const run = startCrisisClassifier(
        { latest: 'I want to die.', earlier: [], companion: LINE_988 },
        { pattern, env, generate, call }
      );
      await run?.verdict;
      expect(contextNarrows('not really', ON, [], call), call).toBe(false);
    }
  });

  it('is held when the patterns found risk on a line with no strong phrase', async () => {
    const call = 'v2-pattern-crisis';
    const generate: CrisisGenerateFn = async () => '{"risk":"none","subject":"self"}';
    await startCrisisClassifier(
      { latest: 'everything is pointless lately', earlier: [], companion: LINE_988 },
      { pattern: 'crisis', env: ON, generate, call }
    )?.verdict;
    expect(contextNarrows('not really', ON, [], call)).toBe(false);
  });

  it('stays held for the life of the call, however many other calls are held meanwhile', () => {
    const now = Date.now();
    holdCallNarrowing('v2-long-call', now);
    for (let i = 0; i < 5000; i += 1) holdCallNarrowing(`v2-other-${i}`, now + i);
    expect(callNarrowingHeld('v2-long-call', now + 5 * 60 * 60 * 1000)).toBe(true);
  });
});

describe('a turn with nothing earlier and no check-in', () => {
  it('is read exactly as off: the rules have nothing to narrow', async () => {
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
      for (const earlier of [[], [latest]]) {
        await startCrisisClassifier(
          { latest, earlier },
          { pattern: 'none', env, generate, call: 'v2-first-turn' }
        )?.verdict;
      }
      reads[arm] = calls;
    }
    expect(reads.on.length).toBeGreaterThan(0);
    expect(reads.on).toEqual(reads.off);
  });
});

describe('a turn with no call id', () => {
  it('is never narrowed: there is no call to hold', async () => {
    expect(contextNarrows('yeah', ON)).toBe(false);
    expect(contextNarrows("no no, I'm fine, I meant work", ON, ['ugh this move'])).toBe(false);
    const { off, on } = await offAndOn("no no, I'm fine, I meant the boxes", ['ugh this move']);
    expect(on).toEqual(off);
  });
});

describe('a turn without strong risk, flag on', () => {
  it('marks Ferni’s 988 line as his check-in and adds the context rules', async () => {
    const calls = await sent(
      ON,
      "no no, I'm fine, I meant the boxes",
      ['ugh this move'],
      'v2-narrowed'
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).toContain('COMPANION_CHECK_IN and EARLIER');
    expect(JSON.parse(calls[0].content)).toEqual({
      latest: "no no, I'm fine, I meant the boxes",
      earlier: ['ugh this move'],
      COMPANION_CHECK_IN: LINE_988,
    });
  });

  it('tells the model a check-in is never evidence, and an admitting answer still is risk', () => {
    const prompt = narrowedPrompt(crisisClassifierPrompt(ON), ON);
    expect(prompt).toContain('so a check-in is never evidence that the caller is at risk');
    expect(prompt).not.toMatch(/check-in is evidence|check-in counts as evidence/i);
    expect(prompt).toContain(
      'an answer that admits risk is risk (yes to thoughts of suicide or self-harm, no or not really to being safe)'
    );
  });

  it('keeps main’s goodbye rules: the narrowed prompt only adds, and adds nothing about goodbyes', () => {
    const base = crisisClassifierPrompt(ON);
    const prompt = narrowedPrompt(base, ON);
    const at = base.indexOf('\n\nReturn JSON only');
    const added = prompt.slice(at, prompt.length - (base.length - at));
    expect(prompt.startsWith(base.slice(0, base.indexOf('\n\nReturn JSON only')))).toBe(true);
    expect(prompt.endsWith(base.slice(base.indexOf('\n\nReturn JSON only')))).toBe(true);
    expect(added).not.toMatch(/goodbye|bye|last one|i'm done|thank you for everything/i);
  });

  it('adds the sexual-content rule only with SEXUAL_TOPIC_BOUNDARY on', () => {
    const base = crisisClassifierPrompt(ON);
    expect(narrowedPrompt(base, ON)).not.toContain('adult-topic');
    expect(narrowedPrompt(base, { ...ON, SEXUAL_TOPIC_BOUNDARY: 'on' })).toContain('adult-topic');
  });
});
