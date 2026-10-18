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

  it("reaches the director's hello", async () => {
    await directedGreeting('gp-1', 'ferni', { userId: 'voice-eval-u1' });
    expect(lastDirection()).toBe(GREETING_DIRECTION);
    vi.stubEnv('FERNI_PLAYFUL', 'on');
    await directedGreeting('gp-2', 'ferni', { userId: 'voice-eval-u1' });
    expect(lastDirection()).toBe(PLAYFUL_GREETING_DIRECTION);
  });
});
