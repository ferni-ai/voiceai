/**
 * FERNI_PLAYFUL on the hello: Ferni's greeting direction is warm and a little
 * playful instead of relaxed and low-key; still no exclamation marks or hype.
 * Off, or for a teammate, it is the old direction.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const directedText = vi.fn(async (_sessionId: string, req: { fallback: string }) => ({
  text: req.fallback,
}));
vi.mock('../../../speech/direction/index.js', () => ({ directedText }));
vi.mock('../../../services/superhuman/wins.js', () => ({
  winForOpener: vi.fn(async () => undefined),
  markWinSurfaced: vi.fn(async () => undefined),
}));

const { directedGreeting, greetingDirection, GREETING_DIRECTION, PLAYFUL_GREETING_DIRECTION } =
  await import('../greeting-direction.js');

const lastDirection = (): string =>
  (directedText.mock.calls.at(-1)![1] as unknown as { direction: string }).direction;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the playful hello', () => {
  it('is warm and a little playful, with no low-key, cheer or exclamation marks', () => {
    expect(PLAYFUL_GREETING_DIRECTION).not.toBe(GREETING_DIRECTION);
    expect(PLAYFUL_GREETING_DIRECTION).toContain('warm and a little playful');
    expect(PLAYFUL_GREETING_DIRECTION).not.toMatch(/low-key|no cheer/);
    expect(PLAYFUL_GREETING_DIRECTION).toContain('No exclamation marks');
    expect(PLAYFUL_GREETING_DIRECTION).toContain('never open on something painful');
    expect(PLAYFUL_GREETING_DIRECTION).not.toMatch(/—|\.\.\.|…/);
  });

  it('only for Ferni and only with the flag', () => {
    expect(greetingDirection('ferni', {})).toBe(GREETING_DIRECTION);
    expect(greetingDirection('ferni', { FERNI_PLAYFUL: 'off' })).toBe(GREETING_DIRECTION);
    expect(greetingDirection('ferni', { FERNI_PLAYFUL: 'on' })).toBe(PLAYFUL_GREETING_DIRECTION);
    expect(greetingDirection('maya-santos', { FERNI_PLAYFUL: 'on' })).toBe(GREETING_DIRECTION);
  });

  it('is the plain hello after a heavy last call or a tender thread held back', () => {
    const on = { FERNI_PLAYFUL: 'on' };
    expect(greetingDirection('ferni', on, { topic: 'the new job and her cat' })).toBe(
      PLAYFUL_GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', on, { topic: 'her dad died last week' })).toBe(
      GREETING_DIRECTION
    );
    expect(greetingDirection('ferni', on, { topic: 'he got laid off' })).toBe(GREETING_DIRECTION);
    expect(greetingDirection('ferni', on, { tender: true })).toBe(GREETING_DIRECTION);
  });

  it("gives the director's hello the plain direction when the last call was heavy", async () => {
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    const { rememberCallerHistory } = await import('../greeting-direction.js');
    rememberCallerHistory('gp-heavy', { calls: 4, daysSince: 1, lastTopic: 'her dad died' });
    await directedGreeting('gp-heavy', 'ferni', { userId: 'voice-eval-u1' });
    expect(lastDirection().startsWith(GREETING_DIRECTION)).toBe(true);
    expect(lastDirection()).not.toContain('a little playful');
  });

  it("reaches the director's hello", async () => {
    await directedGreeting('gp-1', 'ferni', { userId: 'voice-eval-u1' });
    expect(lastDirection()).toBe(GREETING_DIRECTION);
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    await directedGreeting('gp-2', 'ferni', { userId: 'voice-eval-u1' });
    expect(lastDirection()).toBe(PLAYFUL_GREETING_DIRECTION);
  });
});
