import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaceMatcher, getPaceMatcher, sessionSpeed, clearPaceMatcher } from '../pace-matching.js';

const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('PaceMatcher', () => {
  it('stays at normal speed until it has two real turns', () => {
    const m = new PaceMatcher();
    expect(m.speed()).toBe(1);
    m.recordTurn(words(20), 6000); // 200 wpm
    expect(m.speed()).toBe(1);
    m.recordTurn('yeah', 400); // too short to count
    expect(m.speed()).toBe(1);
  });

  it('moves half-way toward a fast talker and a slow one, within 0.9-1.1', () => {
    const fast = new PaceMatcher();
    fast.recordTurn(words(20), 6000); // 200 wpm
    fast.recordTurn(words(20), 6000);
    expect(fast.speed()).toBe(1.1); // 1 + 0.5 * (200/160 - 1) = 1.125, capped

    const slow = new PaceMatcher();
    slow.recordTurn(words(12), 6000); // 120 wpm
    slow.recordTurn(words(12), 6000);
    expect(slow.speed()).toBe(0.9); // 1 + 0.5 * (120/160 - 1) = 0.875, floored

    const near = new PaceMatcher();
    near.recordTurn(words(17), 6000); // 170 wpm
    near.recordTurn(words(17), 6000);
    expect(near.speed()).toBe(1.03);
  });

  it('ignores timing glitches', () => {
    const m = new PaceMatcher();
    m.recordTurn(words(40), 1500); // 1600 wpm: not a pace
    m.recordTurn(words(40), 1500);
    expect(m.userWpm).toBeNull();
  });
});

describe('sessionSpeed', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearPaceMatcher('s1');
  });

  it('reads the session matcher, and PACE_MATCHING=off turns it off', () => {
    const m = getPaceMatcher('s1');
    m.recordTurn(words(20), 6000);
    m.recordTurn(words(20), 6000);
    expect(sessionSpeed('s1')).toBe(1.1);
    expect(sessionSpeed('other')).toBe(1);
    vi.stubEnv('PACE_MATCHING', 'off');
    expect(sessionSpeed('s1')).toBe(1);
  });
});
