/**
 * How the caller sounds this turn, against their own baseline. The native
 * analyzer's end-of-turn reading measured mostly the silence after speech
 * (energy -200 dB, rate 0): only voiced frames count here.
 */
import { describe, expect, it } from 'vitest';
import { CallerProsodyTracker } from '../caller-prosody.js';

/** `ms` of 10 ms voiced frames at a pitch (Hz) and energy (dB), optional glide. */
function speak(t: CallerProsodyTracker, ms: number, hz: number, db: number, endHz = hz, at = 0) {
  const n = ms / 10;
  for (let i = 0; i < n; i++) {
    const p = hz + ((endHz - hz) * i) / n;
    t.addFrame({ pitchHz: p, pitchConfidence: 0.9, energyDb: db, isSpeech: true }, at + i * 10);
  }
  return at + ms;
}

describe('CallerProsodyTracker', () => {
  it('gives no reading until there is enough voice to judge', () => {
    const t = new CallerProsodyTracker();
    speak(t, 800, 180, -30);
    expect(t.readTurn(4)).toBeUndefined();
  });

  it('ignores silence and unvoiced frames', () => {
    const t = new CallerProsodyTracker();
    for (let i = 0; i < 300; i++) t.addFrame({ pitchHz: 0, pitchConfidence: 0, energyDb: -200, isSpeech: false }, i * 10);
    speak(t, 2000, 180, -30, 180, 3000);
    const r = t.readTurn(6)!;
    expect(r.pitchMedianHz).toBeCloseTo(180, 0);
    expect(r.voicedMs).toBe(2000);
  });

  it('reads a turn against the caller’s own baseline', () => {
    const t = new CallerProsodyTracker();
    speak(t, 2000, 180, -30);
    const first = t.readTurn(5)!;
    expect(first.energyRelDb).toBe(0); // the first turn is the baseline
    expect(first.rateRel).toBe(1);

    speak(t, 2000, 180 * 2 ** (3 / 12), -24, undefined, 10_000); // +3 st, +6 dB
    const second = t.readTurn(8)!; // 8 words in the same time as 5
    expect(second.pitchRelSt).toBeCloseTo(3, 0);
    expect(second.energyRelDb).toBeCloseTo(6, 0);
    expect(second.rateRel).toBeCloseTo(1.6, 1);
  });

  it('measures a falling end of the turn in semitones per second', () => {
    const t = new CallerProsodyTracker();
    speak(t, 2000, 200, -30, 200 * 2 ** (-4 / 12)); // falls 4 st over 2 s
    expect(t.readTurn(5)!.pitchSlopeStPerS).toBeLessThan(-1.5);
  });

  it('gives every reply to one turn the same reading (a preemptive reply, then the real one)', () => {
    const t = new CallerProsodyTracker();
    speak(t, 2000, 180, -30);
    expect(t.readTurn(5)).toEqual(t.readTurn(5));
  });

  it('starts a new turn when the caller speaks again after a reply read the last one', () => {
    const t = new CallerProsodyTracker();
    speak(t, 2000, 180, -30);
    t.readTurn(5);
    speak(t, 800, 180, -30, 180, 10_000);
    expect(t.readTurn(3)).toBeUndefined();
  });
});
