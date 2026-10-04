/**
 * Phone (SIP) callers' audio goes through AGC + high-pass before STT; see
 * pre-stt-frame-processor.ts for the measurements behind it.
 */
import { AudioFrame, ParticipantKind } from '@livekit/rtc-node';
import { describe, expect, it } from 'vitest';
import { createPreSTTFrameProcessor, wantsPhonePreStt } from '../pre-stt-frame-processor.js';

const RATE = 24_000;
const FRAME = 480; // 20 ms

/** Frame k of speech-like sound: 180 ms syllables, 60 ms pauses. */
function speechlike(k: number, amp: number): AudioFrame {
  const voiced = k % 12 < 9;
  const data = Int16Array.from({ length: FRAME }, (_, i) => {
    const t = (k * FRAME + i) / RATE;
    return Math.round(32767 * amp * (voiced ? 1 : 0.01) * Math.sin(2 * Math.PI * 220 * t));
  });
  return new AudioFrame(data, RATE, 1, FRAME);
}
const rms = (x: Int16Array): number => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);

describe('which callers get it', () => {
  it('phone (SIP) callers only, unless PRE_STT_SIP=off', () => {
    expect(wantsPhonePreStt({ kind: ParticipantKind.SIP }, {})).toBe(true);
    expect(wantsPhonePreStt({ kind: ParticipantKind.STANDARD }, {})).toBe(false);
    expect(wantsPhonePreStt(undefined, {})).toBe(false);
    expect(wantsPhonePreStt({ kind: ParticipantKind.SIP }, { PRE_STT_SIP: 'off' })).toBe(false);
  });
});

const fp = await createPreSTTFrameProcessor('fp-test');
if (!fp && process.env.CI) throw new Error('the native pre-STT processor must load in CI');

describe.runIf(fp)('phone caller audio (native)', () => {
  it('brings a quiet caller up', async () => {
    const p = (await createPreSTTFrameProcessor('fp-quiet'))!;
    let last = { in: 0, out: 0 };
    for (let k = 0; k < 100; k++) {
      const f = speechlike(k, 0.01);
      const out = p.process(f);
      if (k % 12 < 9) last = { in: rms(f.data), out: rms(out.data) };
    }
    expect(last.out / last.in).toBeGreaterThan(3);
  });

  it('leaves a normal-level caller about as is (never turns them down)', async () => {
    const p = (await createPreSTTFrameProcessor('fp-loud'))!;
    let ratio = 0;
    for (let k = 0; k < 100; k++) {
      const f = speechlike(k, 0.5);
      const out = p.process(f);
      if (k % 12 < 9) ratio = rms(out.data) / rms(f.data);
    }
    expect(ratio).toBeGreaterThan(0.9);
    expect(ratio).toBeLessThan(1.1);
  });

  it('passes a frame at another rate through untouched', () => {
    const f = new AudioFrame(new Int16Array(320).fill(100), 16_000, 1, 320);
    expect(fp!.process(f)).toBe(f);
  });
});
