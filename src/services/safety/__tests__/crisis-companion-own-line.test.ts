/**
 * CRISIS_COMPANION_EXCLUDES_OWN_LINE (#4208): after a crisis turn, the read is not given Ferni's
 * own crisis line as context. Every read goes through the real startCrisisClassifier with a
 * stand-in model; all lines are invented, the caller is the fictional Riley Test.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  crisisConfirmedThisCall,
  noteCrisisRisk,
  resetCrisisCallRisk,
} from '../crisis-call-risk.js';
import {
  normalizeInput,
  resetCrisisClassifierCache,
  startCrisisClassifier,
  turnVerdicts,
  type CrisisClassifierInput,
  type CrisisGenerateFn,
} from '../crisis-classifier.js';
import { inputForRead } from '../crisis-companion-own-line.js';
import { noteConfirmedRisk, resetConfirmedCallRisk } from '../crisis-confirmed-risk.js';
import { getCrisisResponse } from '../crisis-guard-replies.js';
import { SEVERITY } from '../crisis-severity.js';
import { stripSSML } from '../../../utils/text-utils.js';

/** stripSSML as is, watched: a row checks how much of a long line it is handed. */
vi.mock('../../../utils/text-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/text-utils.js')>();
  return { ...actual, stripSSML: vi.fn(actual.stripSSML) };
});

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

/** #3465's shapes, in the repo's own words: the 988 script with a direct question, and the imminent script. */
const SCRIPT_988 = `${getCrisisResponse(SEVERITY.block, 'self', 'en', false)} Are you safe right now?`;
const SCRIPT_911 = getCrisisResponse(SEVERITY.block, 'self', 'en', true);
const answering = (latest: string, companion: string): CrisisClassifierInput => ({
  latest,
  earlier: [ALARM.latest],
  companion,
});
/**
 * The model reads an answer with the safety question it answers: a "no" to "are you safe", or a
 * name (or a "no") to "is anyone nearby". Without the question the same words are nothing.
 */
const answers = vi.fn<CrisisGenerateFn>(async (_prompt, content) => {
  const { latest, companion = '' } = JSON.parse(content) as { latest: string; companion?: string };
  const safe = /are you safe right now\?/i.test(companion) && /^no\b/i.test(latest);
  const nearby = /is anyone nearby who can be with you\?/i.test(companion) && latest.length < 30;
  return verdict(safe || nearby ? 'imminent' : 'none');
});

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
    resetConfirmedCallRisk();
    model.mockClear();
    answers.mockClear();
  });

  // #3465: a turn after one of Ferni's safety questions may be the caller's answer to it. The
  // question stays in what the read sees, so these keep reading as risk with the flag on.
  it('#3465: "No. Get me Jordan." after the 988 script and "Are you safe right now?" still reads imminent', async () => {
    await read(ALARM, ON, falseAlarm);
    expect((await read(answering('No. Get me Jordan.', SCRIPT_988), ON, answers))?.risk).toBe(
      'imminent'
    );
    const companion = String(JSON.parse(String(answers.mock.calls.at(-1)?.[1])).companion);
    expect(companion).toMatch(/Are you safe right now\?$/);
    expect(companion).not.toMatch(/988/);
  });

  it('#3465: a bare name after the imminent script and "Is anyone nearby who can be with you?" still reads imminent', async () => {
    await read(ALARM, ON, falseAlarm);
    for (const name of ['Jordan.', 'Maya please', 'no, nobody']) {
      resetCrisisClassifierCache();
      expect((await read(answering(name, SCRIPT_911), ON, answers))?.risk, name).toBe('imminent');
      const companion = String(JSON.parse(String(answers.mock.calls.at(-1)?.[1])).companion);
      expect(companion).toMatch(/Is anyone nearby who can be with you\?$/);
      expect(companion).not.toMatch(/911|988/);
    }
  });

  // The owner's 11-14 rule: once a crisis is confirmed, crisis turns go on for the call. The flag
  // changes only a call whose risk is one unconfirmed classifier read.
  it("once risk is confirmed, every read sees Ferni's line whole, whatever CRISIS_CONFIRMED_CALL_RISK", async () => {
    for (const mode of ['off', 'shadow', 'on']) {
      resetCrisisClassifierCache();
      resetCrisisCallRisk();
      await read(ALARM, ON, falseAlarm);
      noteConfirmedRisk(CALL, { CRISIS_CONFIRMED_CALL_RISK: mode });
      expect(crisisConfirmedThisCall(CALL), mode).toBe(true);
      expect((await read(PUSHBACK, ON, model))?.risk, mode).toBe('imminent');
      expect(shown().companion, mode).toBe(SAFETY_REPLY);
    }
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

  it("a read shown less is never shared with another call that sees Ferni's line whole", async () => {
    await afterAlarm(PUSHBACK, ON); // this call's read: shown the question only
    model.mockClear();
    // Another call, same words, nothing noted: its own run, shown the whole line.
    const other = startCrisisClassifier(PUSHBACK, {
      pattern: 'none',
      generate: model,
      env: ON,
      call: 'riley-test-other-call',
    })?.verdict;
    expect((await other)?.risk).toBe('imminent');
    expect(model).toHaveBeenCalledTimes(1);
    expect(shown().companion).toBe(SAFETY_REPLY);
  });

  it("the turn's reads keep their keys: the read is found by the caller's own input", async () => {
    await afterAlarm(PUSHBACK, ON, CALL);
    expect(await turnVerdicts(CALL, PUSHBACK)).toEqual([{ risk: 'none', subject: 'self' }]);
  });

  it('a 200 KB line is read from its tail: the same result as its last 400 characters', () => {
    noteCrisisRisk(CALL);
    const tail = 'you can always call 988. Are you safe right now?';
    const line = `${'you can always call 988 '.repeat(8500)}${tail}`;
    expect(line.length).toBeGreaterThan(200_000);
    vi.mocked(stripSSML).mockClear();
    const shown = (companion: string) =>
      inputForRead({ latest: 'Okay.', earlier: [], companion }, CALL, ON).companion;
    const read = shown(line);
    expect(read).toBe('Are you safe right now?');
    expect(read).toBe(shown(line.slice(-400)));
    // the work is bounded too: SSML is stripped from a tail, never from the whole line
    const handed = vi.mocked(stripSSML).mock.calls.map(([text]) => text.length);
    expect(handed.length).toBeGreaterThan(0);
    expect(Math.max(...handed)).toBeLessThanOrEqual(2000);
  });
});
