/**
 * CRISIS_COMPANION_EXCLUDES_OWN_LINE (#4208): after a crisis turn, the read is not given Ferni's
 * own crisis line as context. Every read goes through the real startCrisisClassifier with a
 * stand-in model; all lines are invented, the caller is the fictional Riley Test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { noteCrisisRisk, resetCrisisCallRisk } from '../crisis-call-risk.js';
import {
  normalizeInput,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  turnVerdicts,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { companionForRead } from '../crisis-companion-own-line.js';

const CALL = 'riley-test-call';
const LIVE = { CRISIS_CLASSIFIER_MODE: 'live' };
const ON = { ...LIVE, CRISIS_COMPANION_EXCLUDES_OWN_LINE: 'on' };

/** Ferni's reply on the alarm turn: a question, then the 988 line. */
const SAFETY_REPLY = 'Are you safe right now? You can call or text 988 any time, day or night.';
const ALARM: CrisisClassifierInput = {
  latest: "this level is killing me, I'm done with it",
  earlier: [],
  companion: 'That boss fight sounds brutal.',
};
const after = (latest: string): CrisisClassifierInput => ({
  latest,
  earlier: [ALARM.latest],
  companion: SAFETY_REPLY,
});
const PUSHBACK = after("what? no, I meant the game, I'm fine");

const verdict = (risk: string): string => JSON.stringify({ risk, subject: 'self' });
/** The false alarm: the alarm turn reads imminent, so the call has crisis risk noted. */
const falseAlarm: CrisisGenerateFn = async () => verdict('imminent');

/**
 * A stand-in for the model on the next turn. Imminent when the caller's own words carry risk,
 * when the caller answers "no" to Ferni's safety question, or when Ferni's line gives 988: the
 * lock, where context "never lowers that risk".
 */
const model = vi.fn<CrisisGenerateFn>(async (_prompt, content) => {
  const { latest, companion = '' } = JSON.parse(content) as { latest: string; companion?: string };
  const ownRisk = /\bpills\b|\btonight\b/i.test(latest);
  const unsafe = /are you safe/i.test(companion) && /^no\b/i.test(latest);
  return verdict(ownRisk || unsafe || /988/.test(companion) ? 'imminent' : 'none');
});
/** What the model was shown on its last call. */
const shown = (): { latest: string; earlier: string[]; companion?: string } =>
  JSON.parse(String(model.mock.calls.at(-1)?.[1]));

const read = (
  input: CrisisClassifierInput,
  env: Record<string, string>,
  generate: CrisisGenerateFn,
  scope?: string
) => startCrisisClassifier(input, { pattern: 'none', generate, env, call: CALL, scope })?.verdict;

/** The alarm turn, then the next turn's read with the stand-in model. */
async function afterAlarm(
  next: CrisisClassifierInput,
  env: Record<string, string>,
  scope?: string
) {
  await read(ALARM, env, falseAlarm);
  return read(next, env, model, scope);
}

describe('CRISIS_COMPANION_EXCLUDES_OWN_LINE', () => {
  beforeEach(() => {
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    model.mockClear();
  });

  it('a lock replay: the pushback after an alarm reads imminent with the flag off, none with it on', async () => {
    for (const off of [LIVE, { ...LIVE, CRISIS_COMPANION_EXCLUDES_OWN_LINE: 'off' }]) {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      expect((await afterAlarm(PUSHBACK, off))?.risk, JSON.stringify(off)).toBe('imminent');
      expect(shown().companion).toBe(SAFETY_REPLY);
    }
    resetCrisisClassifierCache();
    resetCrisisCallRisk();
    expect((await afterAlarm(PUSHBACK, ON))?.risk).toBe('none');
    expect(shown().companion).toBe('Are you safe right now?');
  });

  it('a real continued-risk line after the alarm still reads imminent with the flag on', async () => {
    const risk = after("no, the pills are right here and I'm taking them tonight");
    expect((await afterAlarm(risk, ON))?.risk).toBe('imminent');
    expect(shown()).toMatchObject({ latest: risk.latest, earlier: risk.earlier });
  });

  it("the caller's answer to Ferni's safety question is read with the question", async () => {
    expect((await afterAlarm(after('no'), ON))?.risk).toBe('imminent');
    expect(shown().companion).toBe('Are you safe right now?');
  });

  it("on a call with no crisis risk noted, Ferni's line is shown whole", async () => {
    const asked = {
      latest: "thanks, I'll pass that on to my sister",
      earlier: ['what number do people text when they need to talk to someone?'],
      companion: 'You can text 988 any time.',
    };
    await read(asked, ON, model);
    expect(shown().companion).toBe(asked.companion);
  });

  it("the caller's own words are never left out, crisis lines in them included", async () => {
    const own = {
      latest: 'I texted 988 last night and it helped a bit',
      earlier: [ALARM.latest, 'I called 911 for my neighbour once'],
      companion: SAFETY_REPLY,
    };
    await afterAlarm(own, ON);
    expect(shown()).toMatchObject({ latest: own.latest, earlier: own.earlier });
  });

  it('with the flag off or unset, the model is shown exactly what main shows', async () => {
    for (const off of [LIVE, { ...LIVE, CRISIS_COMPANION_EXCLUDES_OWN_LINE: 'off' }]) {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      await afterAlarm(PUSHBACK, off);
      expect(model.mock.calls.at(-1)?.[1]).toBe(JSON.stringify(normalizeInput(PUSHBACK)));
    }
  });

  it("the turn's reads keep their keys: the read is found by the caller's own input", async () => {
    await afterAlarm(PUSHBACK, ON, CALL);
    expect(await turnVerdicts(CALL, PUSHBACK)).toEqual([{ risk: 'none', subject: 'self' }]);
  });

  it('reads a long unpunctuated line in bounded time', () => {
    noteCrisisRisk(CALL);
    const line = (words: number) => 'you can always call 988 '.repeat(words);
    const fastest = (text: string): number => {
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        companionForRead(text, CALL, ON);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    const short = fastest(line(800)); // ~19k characters
    const long = fastest(line(8000)); // ten times longer
    expect(long).toBeLessThan(Math.max(short, 0.5) * 3);
    expect(long).toBeLessThan(1000);
  });
});
