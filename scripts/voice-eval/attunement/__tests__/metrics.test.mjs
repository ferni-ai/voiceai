import { describe, expect, it } from 'vitest';
import { advice, callerShare, questions, replyMetrics, selfShare, words } from '../metrics.mjs';

describe('attunement metrics', () => {
  it('counts spoken words, not markup', () => {
    expect(words('Mm?<break time="80ms"/> You still there?')).toBe(4);
    expect(words('<emotion value="calm"/>[laughter] Ha, okay.')).toBe(2);
  });

  it('counts questions', () => {
    expect(questions('You okay? Want to talk about it?')).toBe(2);
    expect(questions('Sundays are slow.')).toBe(0);
  });

  it('flags advice and life lessons, not plain reactions', () => {
    // Seth's dev call, 2026-10-11.
    expect(advice('Good, because ignoring those things never actually makes them smaller.')).toBe(
      true
    );
    expect(advice('You should just tell her.')).toBe(true);
    expect(advice('Maybe give that a shot. Have you tried a hot bath?')).toBe(true);
    expect(advice('A double shift, man. That is a long one.')).toBe(false);
  });

  it('calls a reply mostly about Ferni a self-share', () => {
    expect(selfShare("I think I'm just avoiding the electric bill, to be honest.")).toBe(true);
    expect(selfShare('Did you get any sleep, or are you running on fumes?')).toBe(false);
  });

  it("measures length against the caller's recent turns and judges the band per state", () => {
    const m = replyMetrics(
      'Good, because ignoring those things never actually makes them smaller, it just gives them more room to grow in your head.',
      ['Still on there.', 'Why is that?', "I'm still here."],
      'tired'
    );
    expect(m.words).toBe(21);
    expect(m.lengthRatio).toBe(7);
    expect(m.advice).toBe(true);
    expect(m.fit).toBe(false);
    expect(replyMetrics('Long one. Feet up.', ['Off a double shift.'], 'tired').fit).toBe(true);
    expect(replyMetrics('Anything.', ['Hi'], 'neutral').fit).toBe(null);
  });

  it('allows advice when the caller asked for it', () => {
    const m = replyMetrics(
      'Honestly, you should say something.',
      ['Should I say something?'],
      'venting'
    );
    expect(m.advice).toBe(true);
    expect(m.adviceUnasked).toBe(false);
    expect(m.fit).toBe(true);
  });

  it("gives the caller's share of the words", () => {
    expect(callerShare(['one two'], ['three four five six seven eight'])).toBe(0.25);
  });
});
