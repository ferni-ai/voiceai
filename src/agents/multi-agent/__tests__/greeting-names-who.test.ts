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
  'Hey Sam. How did the interview go? Did you end up calling her?',
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
