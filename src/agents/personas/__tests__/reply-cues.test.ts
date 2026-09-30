import { describe, expect, it } from 'vitest';
import { PLAYFUL_CUE } from '../../../conversation/humor-fit.js';
import { EXPRESSIVE_VOICE } from '../../../speech/expression/index.js';
import { replyCues } from '../reply-cues.js';

const base = { recentReplies: [], voice: EXPRESSIVE_VOICE };

describe('replyCues', () => {
  it('lets playfulness in on an ordinary turn', () => {
    const out = replyCues({
      ...base,
      userData: { humorCue: PLAYFUL_CUE },
      exchange: { user: 'We had pizza tonight' },
    });
    expect(out).toContain(PLAYFUL_CUE);
  });

  it('drops playfulness when what they just said is heavy', () => {
    const out = replyCues({
      ...base,
      userData: { humorCue: PLAYFUL_CUE },
      exchange: { user: 'My dad passed away last month' },
    });
    expect(out).not.toContain(PLAYFUL_CUE);
  });

  it('drops playfulness on the anniversary of a loss, and keeps the day', () => {
    const day =
      '[A DAY THAT MATTERS TO THEM]\nToday is the anniversary of losing their dad (7 years).';
    const out = replyCues({
      ...base,
      userData: { humorCue: PLAYFUL_CUE, daysThatMatter: day },
      exchange: { user: 'Hey' },
    });
    expect(out).toEqual([day]);
  });

  it('puts yielding to an interruption first', () => {
    const out = replyCues({
      ...base,
      userData: { userName: 'Sam', talkPreferences: ['shorter'] },
      exchange: { user: 'Wait, no, listen', agentInterrupted: true },
      recentReplies: ['Hey Sam!'],
    });
    expect(out[0]).toMatch(/THEY CUT IN/);
    expect(out.some((c) => /THEIR NAME/.test(c))).toBe(true);
  });
});
