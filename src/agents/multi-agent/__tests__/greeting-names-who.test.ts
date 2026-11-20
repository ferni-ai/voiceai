/**
 * A returning caller's hello must say who its callback is about (issue #2388).
 * Prod opened "Hey Seth. Did you end up calling her yesterday?" and the caller
 * had to ask "Calling who?". With GREETING_NAMES_WHO on, the greeting cue turns
 * that line away and the scripted hello plays; off, nothing changes.
 * Names are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cue } from '../../../speech/direction/cue.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { directedGreeting, rememberCallerHistory } = await import('../greeting-direction.js');
const { impliesSharedPast } = await import('../first-call-stranger.js');
const { acceptLine } = await import('../../../speech/direction/cue.js');
const { directLine } = await import('../../../speech/direction/director.js');

const returning = { userId: 'voice-eval-old', userName: 'Sam Rivera', isReturningUser: true };
const newCaller = { userId: 'voice-eval-new', userName: 'Sam', isReturningUser: false };

/** The two prod openers from the issue, with the caller's name made fictional. */
const PROD_LINES = [
  'Hey Sam. Did you end up calling her yesterday?',
  'Hey Sam. Did you end up checking in with her later on?',
];

/** Callbacks that say who or what, and questions with no callback object. */
const KEPT = [
  'Hey Sam. Did you end up calling your sister?',
  'Hey Sam. Did you end up calling Maya?',
  'Hey Sam. How did the interview go?',
  'Hey Sam. Did that help?',
  'Hey Sam, how did it go?',
  'Hey Sam. Did you finish that essay?',
  'Hey Sam. Did you make it home okay?',
  'Hey Sam. Did you end up calling her sister?',
  'Maya, did you end up calling her back?',
  'Hey Sam. Did you send it to the landlord?',
  'Hey Sam, good to hear from you.',
];

/** Vague callbacks: a bare object pronoun, nobody and nothing named in that question. */
const CAUGHT = [
  ...PROD_LINES,
  'Hey Sam. Did you figure that out?',
  'Did you call her, Sam?',
  'Hey Sam. Did you hear back from them?',
  'Hey Sam. Did you end up sending it?',
  'Morning, Sam, nice to hear from you. Did you end up texting him back?',
  'Hey Sam. Long week? Did you end up calling her?',
];

/**
 * Verifier round 1 (PR #4281): who or what was named in an EARLIER sentence of
 * the same hello, or after a title ("Dr. Patel"). Turning these away swapped a
 * specific hello for the generic one. A name, kin word or "the/your <noun>"
 * anywhere before the question counts, so "How did the interview go? Did you
 * end up calling her?" is kept too: a narrow check takes that miss.
 */
const KEPT_EARLIER = [
  'Hey Sam. Your sister was visiting. Did you have fun with her?',
  'Hey Sam. Priya was flying in. Did you pick her up?',
  "Hey Sam. Your mom's surgery was Tuesday. Did you get to see her?",
  'Hey Sam! The big interview was today, right? Did you nail it?',
  'Hey Sam. Did the job offer come through? Did you take it?',
  'Hey Sam. You were writing to your landlord. Did you send it?',
  'Hey Sam, how was the date? Did you like him?',
  "Hey Sam. How's the puppy? Did you name her yet?",
  'Hey Sam. Did you get the car back? Did they fix it?',
  'Hey Sam. You said the recital was Friday. Did you go to it?',
  'Hey Sam. You were dreading the dentist. Did you get through it?',
  "Hey Sam! How's the new place? Did you get it all unpacked?",
  'Hey Sam. How did the interview go? Did you end up calling her?',
  'Did you get to talk with Dr. Patel about it?',
  'Hey Sam. Did you see Dr. Lee about it?',
  'Hey Sam. Did you call Ms. Ortiz about that?',
];

let n = 0;
async function cueFor(userData: object, history?: { calls: number }): Promise<Cue> {
  const sessionId = `gnw-${++n}`;
  if (history) rememberCallerHistory(sessionId, history);
  await directedGreeting(sessionId, 'ferni', userData);
  return directedText.mock.calls.at(-1)![1] as unknown as Cue;
}

const scene = { character: 'Ferni', brief: '', recentTurns: [] };
const speak = (cue: Cue, line: string) =>
  directLine(cue, scene, { mode: 'on', actor: async () => line });

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('GREETING_NAMES_WHO on: a callback must say who', () => {
  it("the director plays the scripted hello instead of the issue's line", async () => {
    vi.stubEnv('GREETING_NAMES_WHO', 'on');
    const cue = await cueFor(returning, { calls: 4 });
    for (const line of PROD_LINES) {
      const told = await speak(cue, line);
      expect(told, line).toMatchObject({ source: 'understudy', reason: 'rejected' });
      expect(told.text).toBe(cue.fallback);
      expect(told.text).not.toMatch(/\b(her|him)\b/i);
    }
  });

  it.each(CAUGHT)('turns away: %s', async (line) => {
    vi.stubEnv('GREETING_NAMES_WHO', 'on');
    const cue = await cueFor(returning, { calls: 4 });
    expect(acceptLine(line, cue)).toBeNull();
  });

  it.each(KEPT)('keeps: %s', async (line) => {
    vi.stubEnv('GREETING_NAMES_WHO', 'on');
    const cue = await cueFor(returning, { calls: 4 });
    expect(acceptLine(line, cue)).toBe(line);
    expect(await speak(cue, line)).toMatchObject({ source: 'actor', text: line });
  });

  it.each(KEPT_EARLIER)('keeps, named earlier: %s', async (line) => {
    vi.stubEnv('GREETING_NAMES_WHO', 'on');
    const cue = await cueFor(returning, { calls: 4 });
    expect(await speak(cue, line)).toMatchObject({ source: 'actor', text: line });
  });

  it("a first call keeps the stranger's guard", async () => {
    vi.stubEnv('GREETING_NAMES_WHO', 'on');
    const cue = await cueFor(newCaller);
    expect(cue.rejectIf).toBe(impliesSharedPast);
  });
});

describe('GREETING_NAMES_WHO off: unchanged', () => {
  it.each(['off', undefined])('flag %s: no guard, the line is spoken as today', async (value) => {
    if (value) vi.stubEnv('GREETING_NAMES_WHO', value);
    const cue = await cueFor(returning, { calls: 4 });
    expect(cue.rejectIf).toBeUndefined();
    for (const line of PROD_LINES) {
      expect(await speak(cue, line)).toMatchObject({ source: 'actor', text: line });
    }
  });
});
