import { describe, expect, it } from 'vitest';

import {
  directVoice,
  EXPRESSIVE_VOICE,
  fitToVoice,
  laughCue,
  LAUGH_ALONG_CUE,
  NEUTRAL_DIRECTION,
  nextReplyCues,
  openingProsody,
  PLAIN_VOICE,
  sessionVocalDirection,
  SMILE_ALONG_CUE,
  type UserLaugh,
} from '../index.js';

describe('directVoice', () => {
  it('is neutral without a delivery style', () => {
    expect(directVoice(null)).toEqual(NEUTRAL_DIRECTION);
    expect(directVoice(undefined)).toEqual(NEUTRAL_DIRECTION);
  });

  it('keeps calm emotions and the style pace', () => {
    expect(directVoice({ emotion: 'sympathetic', speed: 0.92 })).toEqual({
      emotion: 'sympathetic',
      speed: 0.92,
      volume: 1,
    });
  });

  it('turns a bright caller into warmth, never a wide excited voice', () => {
    const d = directVoice({ emotion: 'excited', speed: 1.05 });
    expect(d.emotion).toBe('content');
    expect(d.speed).toBe(1.05);
  });

  it('keeps pace in a range a listener feels but does not notice', () => {
    expect(directVoice({ emotion: 'calm', speed: 0.6 }).speed).toBe(0.88);
    expect(directVoice({ emotion: 'calm', speed: 1.5 }).speed).toBe(1.08);
  });
});

describe('openingProsody', () => {
  const direction = { emotion: 'sympathetic', speed: 0.92, volume: 1 };

  it('fills what the reply left open from the direction', () => {
    expect(openingProsody(direction, {})).toMatchObject({ emotion: 'sympathetic', speed: 0.92 });
  });

  it("lets the reply's calm emotion and pace win", () => {
    expect(openingProsody(direction, { emotion: 'curious', speed: 0.88 })).toMatchObject({
      emotion: 'curious',
      speed: 0.88,
    });
  });

  it('drops a big emotion from the reply and falls back to the direction', () => {
    expect(openingProsody(direction, { emotion: 'excited' }).emotion).toBe('sympathetic');
  });

  it('adds no pace tags for a neutral direction', () => {
    const p = openingProsody(NEUTRAL_DIRECTION, {});
    expect(p.speed).toBeUndefined();
    expect(p.volume).toBeUndefined();
  });
});

describe('fitToVoice', () => {
  const chunk = {
    text: '[laughter] Okay, that is funny.',
    prosody: { emotion: 'content', speed: 0.9 },
  };

  it('passes everything through to an expressive voice', () => {
    expect(fitToVoice(chunk, EXPRESSIVE_VOICE)).toEqual(chunk);
  });

  it('never lets a plain voice read tags aloud or pretend to honor prosody', () => {
    expect(fitToVoice(chunk, PLAIN_VOICE)).toEqual({ text: 'Okay, that is funny.', prosody: {} });
  });
});

describe('laughCue', () => {
  const now = 100_000;
  const laugh: UserLaugh = { at: now - 2_000, confidence: 0.8, suggestedResponse: 'join_in' };

  it('invites a laugh-along when the voice can laugh', () => {
    expect(laughCue({ laugh, lastCue: undefined, voice: EXPRESSIVE_VOICE, now })).toBe(
      LAUGH_ALONG_CUE
    );
  });

  it('smiles instead when the voice cannot laugh or the laugh did not invite joining', () => {
    expect(laughCue({ laugh, lastCue: undefined, voice: PLAIN_VOICE, now })).toBe(SMILE_ALONG_CUE);
    expect(
      laughCue({
        laugh: { ...laugh, suggestedResponse: 'smile' },
        lastCue: undefined,
        voice: EXPRESSIVE_VOICE,
        now,
      })
    ).toBe(SMILE_ALONG_CUE);
  });

  it('ignores stale, unsure or non-laughs', () => {
    const base = { lastCue: undefined, voice: EXPRESSIVE_VOICE, now };
    expect(laughCue({ ...base, laugh: undefined })).toBeNull();
    expect(laughCue({ ...base, laugh: { ...laugh, at: now - 30_000 } })).toBeNull();
    expect(laughCue({ ...base, laugh: { ...laugh, confidence: 0.3 } })).toBeNull();
    expect(laughCue({ ...base, laugh: { ...laugh, suggestedResponse: 'none' } })).toBeNull();
  });

  it('answers the same laugh the same way, but lets a new laugh wait out the cooldown', () => {
    const sameLaugh = { laughAt: laugh.at, at: now - 1_000 };
    expect(laughCue({ laugh, lastCue: sameLaugh, voice: EXPRESSIVE_VOICE, now })).toBe(
      LAUGH_ALONG_CUE
    );
    const earlierLaugh = { laughAt: laugh.at - 20_000, at: now - 20_000 };
    expect(laughCue({ laugh, lastCue: earlierLaugh, voice: EXPRESSIVE_VOICE, now })).toBeNull();
  });
});

describe('session adapter', () => {
  it('reads the stamped laugh, cues once per laugh and records it', () => {
    const now = 50_000;
    const userData: Record<string, unknown> = {
      detectedLaughter: { isLaughing: true, confidence: 0.9, suggestedResponse: 'join_in' },
      detectedLaughterAt: now - 1_000,
    };
    expect(nextReplyCues(userData, EXPRESSIVE_VOICE, now)).toEqual([LAUGH_ALONG_CUE]);
    expect(userData.laughCue).toEqual({ laughAt: now - 1_000, at: now });
    // A preemptive and a final generation for the same turn agree.
    expect(nextReplyCues(userData, EXPRESSIVE_VOICE, now + 500)).toEqual([LAUGH_ALONG_CUE]);
    expect(userData.laughCue).toEqual({ laughAt: now - 1_000, at: now });
  });

  it('gives no cue for an unstamped laugh or missing session data', () => {
    expect(nextReplyCues(undefined, EXPRESSIVE_VOICE)).toEqual([]);
    expect(
      nextReplyCues({ detectedLaughter: { isLaughing: true, confidence: 1 } }, EXPRESSIVE_VOICE)
    ).toEqual([]);
  });

  it("directs the voice from this turn's delivery style", () => {
    expect(sessionVocalDirection({ deliveryStyle: { emotion: 'calm', speed: 0.9 } })).toEqual({
      emotion: 'calm',
      speed: 0.9,
      volume: 1,
    });
    expect(sessionVocalDirection({ deliveryStyle: null })).toEqual(NEUTRAL_DIRECTION);
  });
});
