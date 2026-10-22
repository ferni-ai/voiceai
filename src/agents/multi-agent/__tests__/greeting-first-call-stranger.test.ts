/**
 * A first call is a first meeting. Prod sweep 2026-10-21: 7 of 16 first calls
 * opened as if to an old friend ("Hey Sam, burning the midnight oil again?").
 * A known account's first call gets the stranger's hello, the fact that says
 * so, a stranger's understudy, and a guard that turns away any line implying
 * a shared past. A returning caller's hello is unchanged.
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
vi.mock('../../shared/warm-greeting.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/warm-greeting.js')>();
  return { ...actual, generateWarmGreeting: vi.fn(actual.generateWarmGreeting) };
});

const { directedGreeting, rememberCallerHistory, GREETING_DIRECTION, PLAYFUL_GREETING_DIRECTION } =
  await import('../greeting-direction.js');
const { STRANGER_GREETING_DIRECTION, impliesSharedPast, isStrangerCall } =
  await import('../first-call-stranger.js');
const { acceptLine } = await import('../../../speech/direction/cue.js');
const { directLine } = await import('../../../speech/direction/director.js');
const warm = await import('../../shared/warm-greeting.js');
const { trackDeferredProfileLoad } = await import('../../../services/session/deferred-profile.js');

const lastCue = (): Cue => directedText.mock.calls.at(-1)![1] as unknown as Cue;
const lastStage = (): unknown =>
  (vi.mocked(warm.generateWarmGreeting).mock.calls.at(-1)![1] as { relationshipStage?: string })
    .relationshipStage;

const newCaller = { userId: 'voice-eval-new', userName: 'Sam', isReturningUser: false };
const returning = { userId: 'voice-eval-old', userName: 'Sam', isReturningUser: true };

/** The exact openers prod spoke to strangers (sweep 2026-10-21, transcripts.txt). */
const PROD_OPENERS = [
  'Burning the midnight oil again?',
  'Hey Sam, burning the midnight oil again?',
  'Did that coffee finally kick in?',
  'Morning, Sam. Did that coffee finally kick in?',
  'Did you survive the early start?',
  'Hey Sam, good morning, did you survive the early start?',
];
const NEUTRAL = "Hey, I'm glad you called. What's on your mind tonight?";

let n = 0;
async function cueFor(userData: object, history?: { calls: number }): Promise<Cue> {
  const sessionId = `fcs-${++n}`;
  if (history) rememberCallerHistory(sessionId, history);
  await directedGreeting(sessionId, 'ferni', userData);
  return lastCue();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("a first call's hello: a stranger's, not an old friend's", () => {
  it.each([
    ['calm', 'off'],
    ['playful', 'on'],
  ])('%s: stranger framing, no friend framing and no tease', async (_name, playful) => {
    vi.stubEnv('FERNI_PLAYFUL', playful);
    const cue = await cueFor(newCaller);
    expect(cue.direction).toBe(STRANGER_GREETING_DIRECTION);
    expect(cue.direction).toContain('first time you have ever talked');
    expect(cue.direction).toContain('no tease');
    expect(cue.direction).not.toMatch(
      /friend calling|a little playful|friendly tease|glad it's them/
    );
    expect(cue.direction).not.toMatch(/—|\.\.\.|…/);
    expect(cue.facts?.['how well you know each other']).toBe('first time talking');
  });

  it('the understudy is built for a stranger, not a friend', async () => {
    await cueFor(newCaller);
    expect(lastStage()).toBe('stranger');
    await cueFor(returning, { calls: 3 });
    expect(lastStage()).toBe('friend');
  });

  it("rejects prod's past-implying openers on a first call", async () => {
    const cue = await cueFor(newCaller);
    for (const line of PROD_OPENERS) expect(acceptLine(line, cue), line).toBeNull();
    expect(acceptLine(NEUTRAL, cue)).toBe(NEUTRAL);
  });

  it('the director speaks the understudy when the actor greets a stranger as a friend', async () => {
    const cue = await cueFor(newCaller);
    const scene = { character: 'Ferni', brief: '', recentTurns: [] };
    const told = await directLine(cue, scene, {
      mode: 'on',
      actor: async () => 'Hey Sam, burning the midnight oil again?',
    });
    expect(told).toMatchObject({ source: 'understudy', reason: 'rejected', text: cue.fallback });
    const neutral = await directLine(cue, scene, { mode: 'on', actor: async () => NEUTRAL });
    expect(neutral).toMatchObject({ source: 'actor', text: NEUTRAL });
  });
});

describe("a returning caller's hello is unchanged", () => {
  it('the friend direction, calm and playful, with no first-call fact or guard', async () => {
    expect(
      GREETING_DIRECTION.startsWith('They just called you. Answer like you would a friend')
    ).toBe(true);
    const calm = await cueFor(returning, { calls: 3 });
    expect(calm.direction).toBe(GREETING_DIRECTION);
    expect(calm.facts?.['how well you know each other']).toBe('3 calls so far');
    expect(calm.rejectIf).toBeUndefined();
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    const playful = await cueFor(returning, { calls: 3 });
    expect(playful.direction).toBe(PLAYFUL_GREETING_DIRECTION);
  });

  it('accepts the same openers from an old friend', async () => {
    const cue = await cueFor(returning, { calls: 3 });
    for (const line of PROD_OPENERS) expect(acceptLine(line, cue), line).toBe(line);
  });

  it('an account with no flag (or an anonymous caller) keeps the usual hello', async () => {
    expect((await cueFor({ userId: 'voice-eval-u1' })).direction).toBe(GREETING_DIRECTION);
    expect((await cueFor({ ...newCaller, userId: 'anonymous' })).direction).toBe(
      GREETING_DIRECTION
    );
  });
});

describe('a profile still loading', () => {
  function loading(totalConversations: number, ms = 0) {
    const services = { userProfile: null as { totalConversations: number } | null };
    trackDeferredProfileLoad(
      services,
      new Promise<void>((resolve) => {
        setTimeout(() => {
          services.userProfile = { totalConversations };
          resolve();
        }, ms);
      })
    );
    return services;
  }

  it('one that shows past calls is no stranger; one that shows none is', async () => {
    const old = await cueFor({ ...newCaller, services: loading(12) });
    expect(old.direction).toBe(GREETING_DIRECTION);
    const fresh = await cueFor({ ...newCaller, services: loading(0) });
    expect(fresh.direction).toBe(STRANGER_GREETING_DIRECTION);
  });

  it('too slow to tell: the usual hello, never a guessed "stranger"', async () => {
    await expect(
      isStrangerCall({ ...newCaller, services: loading(0, 200) }, undefined, 20)
    ).resolves.toBe(false);
  });
});

describe('impliesSharedPast: whole words, not substrings', () => {
  it.each([
    ...PROD_OPENERS,
    'Welcome back.',
    'Still working on that project?',
    'Up early as usual?',
    'How did it go since last time?',
    'Missed you.',
    'You survived the week, then.',
  ])('past: %s', (line) => {
    expect(impliesSharedPast(line)).toBe(true);
  });

  it.each([
    NEUTRAL,
    'Hey, racing against the clock tonight?',
    'Got your backpack ready for the day?',
    'Hey Sam, still up?',
    'Morning. How are you doing?',
    'Hi there. Is this a good time to talk?',
    'Good evening. Feedback, survival tips, anything on your mind?',
  ])('not past: %s', (line) => {
    expect(impliesSharedPast(line)).toBe(false);
  });

  it("the stranger's scripted understudy never implies a past either", () => {
    const actual = vi.mocked(warm.generateWarmGreeting);
    for (let i = 0; i < 400; i++) {
      const text = actual('ferni', {
        hour: i % 24,
        isReturningUser: false,
        relationshipStage: 'stranger',
      }).replace(/<[^>]+>/g, ' ');
      expect(impliesSharedPast(text), text).toBe(false);
    }
  });
});
