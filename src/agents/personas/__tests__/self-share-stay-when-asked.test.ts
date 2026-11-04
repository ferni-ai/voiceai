/**
 * SELF_SHARE_STAY_WHEN_ASKED (#3475): asked about himself, Ferni answers and
 * isn't told to hand the question straight back. Dev calls 2026-11-04
 * (rt-1104-your-day-specific): "Enough about me." got "Fair enough, what's on
 * your mind then?", and each answer ended "What about you, ...?".
 * Flag off: every line is exactly what it was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { selfShareFor } from '../ferni-state.js';
import { ASKED_NO_DETAIL } from '../self-share-asked.js';
import { regexSignals } from '../turn-extras.js';
import { callerMove, QUESTION_LINE, turnShapeFor } from '../turn-shape.js';

const ASK = 'Enough about me. What about you, what did you do today?';
const DETAIL = 'you were up around five again and checked the weather';
const SELF_REPLY = 'I was up around five, looking at the weather out the kitchen window.';
const SWING = 'Your last reply was about you: this one is about them, their day or their world.';

function on(): void {
  vi.stubEnv('SELF_SHARE_STAY_WHEN_ASKED', 'on');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('SELF_SHARE_STAY_WHEN_ASKED', () => {
  it('the test line is read as a question about him', () => {
    expect(callerMove(ASK)).toBe('about_ferni');
  });

  it('off: the answer still ends with a question back, byte for byte as before', () => {
    const { line, ownStory } = selfShareFor({ replies: ['Hey Sam.'], said: ASK, detail: DETAIL });
    expect(ownStory).toBe(true);
    expect(line).toBe(
      `[They asked about you: answer from your day (${DETAIL}), in a sentence or two, then ask them something about theirs.]`
    );
  });

  it('on: the answer is not told to ask them something back', () => {
    on();
    const { line, ownStory } = selfShareFor({ replies: ['Hey Sam.'], said: ASK, detail: DETAIL });
    expect(ownStory).toBe(true);
    expect(line).toContain(DETAIL);
    expect(line).not.toContain('ask them something about theirs');
    expect(line).toContain('leave it there');
  });

  it('off: asked again right after talking about himself, the swing line still fires', () => {
    const { line } = selfShareFor({ replies: [SELF_REPLY], said: ASK, detail: DETAIL });
    expect(line).toContain(SWING);
  });

  it('on: asked again right after talking about himself, no swing back to them', () => {
    on();
    const { line } = selfShareFor({ replies: [SELF_REPLY], said: ASK, detail: DETAIL });
    expect(line).not.toContain(SWING);
    expect(line).toContain('They asked about you');
  });

  it('on: an unasked turn after a self-share still swings back to them', () => {
    on();
    const { line } = selfShareFor({
      replies: [SELF_REPLY],
      said: 'My sister called again about the wedding.',
      detail: DETAIL,
    });
    expect(line).toContain(SWING);
  });

  const spent = { firstReply: false, nextDetail: () => undefined };

  it('off: every detail spent, the asked line is the old "doing well" line', () => {
    const { line, brief } = selfShareFor({
      replies: ['Hey.'],
      said: ASK,
      detail: DETAIL,
      askedOnly: spent,
    });
    expect(brief).toBe(true);
    expect(line).toBe(`[${ASKED_NO_DETAIL}]`);
  });

  it('on: every detail spent, one small true thing, no new event and no question back', () => {
    on();
    const { line, brief } = selfShareFor({
      replies: ['Hey.'],
      said: ASK,
      detail: DETAIL,
      askedOnly: spent,
    });
    expect(brief).toBe(true);
    expect(line).not.toContain("say you're doing well");
    expect(line).not.toContain('ask them something about theirs');
    expect(line).toContain('no new event, person or place');
  });

  const sig = { ...regexSignals(ASK, 'about_ferni'), ownStory: true };
  const noQuestionDice = () => 0.99;

  it('off: the no-question line still asks for a question back after a word about himself', () => {
    const { reminder } = turnShapeFor(ASK, noQuestionDice, 'dice', sig);
    expect(reminder).toContain(QUESTION_LINE.noneUnlessOwn);
  });

  it('on: the no-question line no longer forces a question back', () => {
    on();
    const { reminder } = turnShapeFor(ASK, noQuestionDice, 'dice', sig);
    expect(reminder).not.toContain(QUESTION_LINE.noneUnlessOwn);
    expect(reminder).toContain(QUESTION_LINE.none);
  });
});
