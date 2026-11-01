/**
 * UNKNOWN_CALLER_HONEST: a caller Ferni can't place is met, never greeted as an
 * old friend (#3007). Prod 10-26 to 10-29: five of five greeted calls from
 * unrecognised phone callers opened "speak of the devil", "I was just thinking
 * about you" or "look who decided to call". Runs the real directedGreeting;
 * only the director's model call is stubbed. Fixtures are fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Cue } from '../../../speech/direction/cue.js';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../shared/warm-greeting.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/warm-greeting.js')>();
  return { ...actual, generateWarmGreeting: vi.fn(actual.generateWarmGreeting) };
});

const { directedGreeting, rememberCallerHistory, GREETING_DIRECTION, PLAYFUL_GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { STRANGER_GREETING_DIRECTION, UNPLACED_GREETING_DIRECTION } =
  await import('../first-call-stranger.js');
const { rememberCallerRecognition, UNRECOGNISED_CALLER_DIRECTION } =
  await import('../../voice-agent-entry/caller-recognition.js');
const { acceptLine } = await import('../../../speech/direction/cue.js');
const warm = await import('../../shared/warm-greeting.js');

const lastCue = (): Cue => directedText.mock.calls.at(-1)![1] as unknown as Cue;
const lastStage = (): unknown =>
  (vi.mocked(warm.generateWarmGreeting).mock.calls.at(-1)![1] as { relationshipStage?: string })
    .relationshipStage;

/** A phone caller nobody recognised: a per-call anon: id, no profile. */
const unplaced = { userId: 'anon:7f3c-fixture', isReturningUser: false };
const returning = { userId: 'voice-eval-dana', userName: 'Dana', isReturningUser: true };
const firstAccount = { userId: 'voice-eval-new', userName: 'Robin', isReturningUser: false };

/** The openers prod spoke to unrecognised callers (#3007). */
const PROD_OPENERS = [
  'Well, speak of the devil.',
  'Hey, I was just thinking about you.',
  'Look who decided to call.',
  'Hey, there you are. What are you up to?',
];
const NEUTRAL = "Hey, glad you called. What's on your mind tonight?";

let n = 0;
async function cueFor(userData: object, history?: { calls: number }): Promise<Cue> {
  const sessionId = `guc-${++n}`;
  if (history) rememberCallerHistory(sessionId, history);
  await directedGreeting(sessionId, 'ferni', userData);
  return lastCue();
}

afterEach(() => vi.unstubAllEnvs());

describe('an unrecognised caller with UNKNOWN_CALLER_HONEST off (today)', () => {
  it("gets the friend's hello and its tease, with nothing turning a friend's line away", async () => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    const cue = await cueFor(unplaced);
    expect(cue.direction).toBe(PLAYFUL_GREETING_DIRECTION);
    expect(cue.direction).toMatch(/friendly tease/);
    expect(cue.rejectIf).toBeUndefined();
    expect(lastStage()).toBe('friend');
  });
});

describe('an unrecognised caller with UNKNOWN_CALLER_HONEST on', () => {
  it.each([
    ['calm', 'off'],
    ['playful', 'on'],
  ])("%s: a first meeting's hello, no tease, no claim either way", async (_name, playful) => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    vi.stubEnv('FERNI_PLAYFUL', playful);
    const cue = await cueFor(unplaced);
    expect(cue.direction).toBe(UNPLACED_GREETING_DIRECTION);
    expect(cue.direction).toContain('someone you are glad to meet');
    expect(cue.direction).toContain('never imply you have talked before');
    expect(cue.direction).not.toMatch(/friend calling|friendly tease|first time you have ever/);
    // Each unrecognised call is a fresh id: it may be their fifth, so no "first time" fact.
    expect(cue.facts?.['how well you know each other']).toBeUndefined();
    expect(lastStage()).toBe('stranger');
  });

  it("turns away prod's openers and keeps a plain hello", async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const cue = await cueFor(unplaced);
    for (const line of PROD_OPENERS) expect(acceptLine(line, cue), line).toBeNull();
    expect(acceptLine(NEUTRAL, cue)).toBe(NEUTRAL);
  });

  it("with CALLER_RECOGNITION's stranger record: still met, and asked who it is", async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    rememberCallerRecognition('guc-recognised', { status: 'stranger', attestation: 'none' });
    await directedGreeting('guc-recognised', 'ferni', unplaced);
    expect(lastCue().direction).toBe(
      `${UNPLACED_GREETING_DIRECTION} ${UNRECOGNISED_CALLER_DIRECTION}`
    );
  });
});

describe('known callers are unchanged with the flag on', () => {
  it("a returning account keeps the friend's hello and accepts a friend's line", async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const cue = await cueFor(returning, { calls: 4 });
    expect(cue.direction).toBe(GREETING_DIRECTION);
    expect(cue.facts?.['how well you know each other']).toBe('4 calls so far');
    expect(acceptLine('Hey Dana, speak of the devil.', cue)).toBe('Hey Dana, speak of the devil.');
    expect(lastStage()).toBe('friend');
  });

  it("an account's first call keeps the stranger's hello and its first-time fact", async () => {
    vi.stubEnv('UNKNOWN_CALLER_HONEST', 'on');
    const cue = await cueFor(firstAccount);
    expect(cue.direction).toBe(STRANGER_GREETING_DIRECTION);
    expect(cue.facts?.['how well you know each other']).toBe('first time talking');
  });
});
