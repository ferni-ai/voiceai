/**
 * CALLER_SETUP_READ (#3810): on dev a ranting caller's setup line, "And you
 * know what the thing is?", read as a question about Ferni ("and you"), so
 * the turn told him to answer from his own day and he told a story about
 * Hollis before their punchline. Flag off pins today's reads.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callerMove, callerSharing } from '../caller-move.js';
import { selfShareFor } from '../ferni-state.js';

const ON = { CALLER_SETUP_READ: 'on' };
const OFF = {};
const SETUP = 'And you know what the thing is?';
const REPLIES = ['Ugh, six weeks? What is he even saying?', 'Seriously, which Tuesday indeed.'];

describe('callerMove: "and you" mid-line (CALLER_SETUP_READ)', () => {
  it('flag off: today, the setup line reads as a question about him', () => {
    expect(callerMove(SETUP, OFF)).toBe('about_ferni');
    expect(callerMove("and you won't believe what he said", OFF)).toBe('about_ferni');
  });

  it('flag on: "and you" inside their own story is a share', () => {
    expect(callerMove(SETUP, ON)).toBe('share');
    expect(callerMove("and you won't believe what he said", ON)).toBe('share');
  });

  it('flag on: "and you" that hands the turn over still asks about him', () => {
    expect(callerMove('Good, and you?', ON)).toBe('about_ferni');
    expect(callerMove('Pretty good. And you', ON)).toBe('about_ferni');
    expect(callerMove("I'm fine, and you? How's your week been?", ON)).toBe('about_ferni');
  });
});

describe('callerSharing: a short setup holds his own story (CALLER_SETUP_READ)', () => {
  it('flag off: under 8 words is not sharing, 8+ words is', () => {
    expect(callerSharing('So get this.', 'share', OFF)).toBe(false);
    expect(callerSharing('And then the guy just walked out of the room', 'share', OFF)).toBe(true);
    expect(callerSharing('Guess what happened', 'request', OFF)).toBe(false);
  });

  it('flag on: a setup to their punchline is sharing, other short lines are not', () => {
    expect(callerSharing('So get this.', 'share', ON)).toBe(true);
    expect(callerSharing('Guess what happened next.', 'share', ON)).toBe(true);
    expect(callerSharing(SETUP, 'share', ON)).toBe(true);
    expect(callerSharing('It was a Tuesday.', 'share', ON)).toBe(false);
    expect(callerSharing('Guess what happened', 'request', ON)).toBe(false);
  });
});

describe('selfShareFor on the setup line', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  const turn = { replies: REPLIES, said: SETUP, detail: 'DAY' };

  it('flag off: he is told to answer from his own day', () => {
    vi.stubEnv('CALLER_SETUP_READ', '');
    const self = selfShareFor(turn);
    expect(self.line).toContain('They asked about you: answer from your day (DAY)');
    expect(self.ownStory).toBe(true);
  });

  it('flag on: no story of his own, he stays with theirs', () => {
    vi.stubEnv('CALLER_SETUP_READ', 'on');
    const self = selfShareFor(turn);
    expect(self.line).not.toContain('DAY');
    expect(self.line).toContain('stay with it, nothing about yourself');
    expect(self.ownStory).toBe(false);
  });
});
