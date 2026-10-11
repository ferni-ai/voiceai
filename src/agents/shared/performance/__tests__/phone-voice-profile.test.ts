/**
 * Telephony audio profile: applies only to SIP listeners with
 * PHONE_VOICE_PROFILE=on, and its EQ/compression stay inside level limits.
 */
import { AudioFrame, ParticipantKind } from '@livekit/rtc-node';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { applyPostTTSEnhancement } from '../post-tts-transform.js';
import {
  CEILING,
  LEVELLER_RANGE_DB,
  PhoneBandFilter,
  PhoneVoiceChain,
  TARGET_RMS_DBFS,
  compressorGainDb,
} from '../phone-voice-dsp.js';
import {
  MAX_PHONE_SESSIONS,
  applyPhoneVoiceProfile,
  clearPhoneListenersForTests,
  isPhoneListener,
  isSipParticipant,
  notePhoneListener,
} from '../phone-voice-profile.js';

const SR = 24000;
const ON = { PHONE_VOICE_PROFILE: 'on' };

const db = (x: number): number => 20 * Math.log10(x);
const rms = (x: ArrayLike<number>, from = 0): number => {
  let s = 0;
  for (let i = from; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / (x.length - from));
};
const peak = (x: ArrayLike<number>): number => {
  let p = 0;
  for (const v of Array.from(x)) p = Math.max(p, Math.abs(v));
  return p;
};
const sine = (hz: number, amp: number, seconds: number): Float32Array =>
  Float32Array.from(
    { length: Math.round(SR * seconds) },
    (_, i) => amp * Math.sin((2 * Math.PI * hz * i) / SR)
  );

/** Speech-like: 1 kHz carrier, syllable-rate (4 Hz) amplitude, at `rmsDb` dBFS. */
function speechLike(rmsDb: number, seconds: number, seed = 1): Float32Array {
  let s = seed;
  const out = Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    const noise = s / 2 ** 31 - 0.5;
    const env = 0.55 + 0.45 * Math.sin((2 * Math.PI * 4 * i) / SR);
    return env * (Math.sin((2 * Math.PI * 1000 * i) / SR) + 0.3 * noise);
  });
  const g = 10 ** (rmsDb / 20) / rms(out);
  return out.map((v) => v * g);
}

function framesOf(x: Float32Array, size = 480): AudioFrame[] {
  const frames: AudioFrame[] = [];
  for (let off = 0; off < x.length; off += size) {
    const d = Int16Array.from(x.subarray(off, off + size), (v) => Math.round(v * 32767));
    frames.push(new AudioFrame(d, SR, 1, d.length));
  }
  return frames;
}
const streamOf = (frames: AudioFrame[]): NodeReadableStream<AudioFrame> =>
  new NodeReadableStream<AudioFrame>({
    start(c) {
      for (const f of frames) c.enqueue(f);
      c.close();
    },
  });
async function drain(s: NodeReadableStream<AudioFrame>): Promise<AudioFrame[]> {
  const out: AudioFrame[] = [];
  for await (const f of s) out.push(f);
  return out;
}
const samplesOf = (frames: AudioFrame[]): Float32Array =>
  Float32Array.from(
    frames.flatMap((f) => Array.from(f.data as Int16Array)),
    (v) => v / 32768
  );

const SIP = { identity: 'sip_+15551234567', kind: ParticipantKind.SIP };
const WEB = { identity: 'user-abc', kind: ParticipantKind.STANDARD };

beforeEach(() => clearPhoneListenersForTests());
afterEach(() => clearPhoneListenersForTests());

describe('who gets the phone profile', () => {
  it('recognises SIP participants by kind or by a sip_/phone_ identity', () => {
    expect(isSipParticipant(SIP)).toBe(true);
    expect(isSipParticipant({ identity: 'phone_+1555' })).toBe(true);
    expect(isSipParticipant({ identity: 'caller', kind: ParticipantKind.SIP })).toBe(true);
    expect(isSipParticipant(WEB)).toBe(false);
    expect(isSipParticipant({ identity: 'gossip_fan' })).toBe(false);
    expect(isSipParticipant(null)).toBe(false);
  });

  it('notes a SIP caller, ignores a web user, and caps the registry', () => {
    expect(isPhoneListener('call-1')).toBe(false);
    notePhoneListener('call-1', SIP);
    notePhoneListener('app-1', WEB);
    expect(isPhoneListener('call-1')).toBe(true);
    expect(isPhoneListener('app-1')).toBe(false);
    for (let i = 0; i < MAX_PHONE_SESSIONS; i++) notePhoneListener(`c${i}`, SIP);
    expect(isPhoneListener('call-1')).toBe(false); // the oldest was evicted
    expect(isPhoneListener(`c${MAX_PHONE_SESSIONS - 1}`)).toBe(true);
  });

  it('returns the stream itself for a web listener, or with the flag off', () => {
    notePhoneListener('app-1', WEB);
    notePhoneListener('call-1', SIP);
    const s1 = streamOf(framesOf(sine(1000, 0.3, 0.1)));
    const s2 = streamOf(framesOf(sine(1000, 0.3, 0.1)));
    expect(applyPhoneVoiceProfile(s1, 'app-1', ON)).toBe(s1);
    expect(applyPhoneVoiceProfile(s2, 'call-1', {})).toBe(s2);
  });

  it('on the live post-TTS path: a SIP session is shaped, a web session is not', async () => {
    const prev = process.env.PHONE_VOICE_PROFILE;
    process.env.PHONE_VOICE_PROFILE = 'on';
    try {
      notePhoneListener('call-1', SIP);
      notePhoneListener('app-1', WEB);
      // 150 Hz is below the phone band: the profile removes most of it.
      const input = sine(150, 0.3, 0.5);
      const web = samplesOf(
        await drain(
          await applyPostTTSEnhancement(streamOf(framesOf(input)), { sessionId: 'app-1' })
        )
      );
      const call = samplesOf(
        await drain(
          await applyPostTTSEnhancement(streamOf(framesOf(input)), { sessionId: 'call-1' })
        )
      );
      expect(db(rms(web) / rms(input))).toBeGreaterThan(-0.1); // untouched
      expect(db(rms(call, SR / 5) / rms(input, SR / 5))).toBeLessThan(-3);
    } finally {
      if (prev === undefined) delete process.env.PHONE_VOICE_PROFILE;
      else process.env.PHONE_VOICE_PROFILE = prev;
    }
  });
});

describe('phone band filter', () => {
  const gainDb = (hz: number): number => {
    const f = new PhoneBandFilter(SR);
    const x = sine(hz, 0.1, 0.5);
    const y = x.map((v) => f.step(v));
    return db(rms(y, SR / 10) / rms(x, SR / 10));
  };
  it('keeps 300-3400 Hz, lifts presence, cuts below and above', () => {
    expect(gainDb(2000)).toBeGreaterThan(3); // presence lift
    expect(Math.abs(gainDb(700))).toBeLessThan(3);
    expect(gainDb(100)).toBeLessThan(-15);
    expect(gainDb(6000)).toBeLessThan(-20); // nothing for the 8 kHz resampler to fold back
  });
});

describe('level limits', () => {
  /** Quiet speech (the leveller rises) then a sudden full-scale burst at the presence peak. */
  function ambush(): Float32Array {
    const quiet = speechLike(-36, 2);
    const x = new Float32Array(quiet.length + SR / 2);
    x.set(quiet);
    x.set(sine(2000, 1, 0.5), quiet.length);
    return x;
  }

  it('never exceeds the ceiling, even for a full-scale burst after quiet speech', () => {
    const chain = new PhoneVoiceChain(SR);
    const x = ambush();
    const burstAt = x.length - SR / 2;
    const quiet = chain.process(x.slice(0, burstAt));
    expect(chain.levellerGainDb).toBeGreaterThan(3); // the burst meets a raised gain
    const y = chain.process(x.slice(burstAt));
    expect(peak(quiet)).toBeLessThan(CEILING);
    expect(peak(y)).toBeLessThanOrEqual(CEILING);
    expect(peak(y)).toBeGreaterThan(CEILING - 0.05); // limited, not muted
    // Limited, not hard-clipped: only the odd peak touches the ceiling (measured:
    // 5 samples with the limiter, 88 flat-topped by the clamp without it).
    const flat = y.filter((v) => Math.abs(v) >= CEILING - 1e-6).length;
    expect(flat).toBeLessThan(20);
    expect(y.every(Number.isFinite)).toBe(true);
  });

  it('the frame path holds the ceiling too (no int16 wrap)', async () => {
    notePhoneListener('call-1', SIP);
    const out = samplesOf(
      await drain(applyPhoneVoiceProfile(streamOf(framesOf(ambush())), 'call-1', ON))
    );
    expect(peak(out)).toBeLessThanOrEqual(CEILING + 1 / 32768);
    expect(peak(out)).toBeGreaterThan(CEILING - 0.05);
  });

  it('brings quiet and loud speech toward the phone target', () => {
    for (const inDb of [-32, -10]) {
      const y = new PhoneVoiceChain(SR).process(speechLike(inDb, 4));
      const outDb = db(rms(y, SR * 2));
      expect(Math.abs(outDb - TARGET_RMS_DBFS)).toBeLessThan(3);
    }
  });

  it('keeps soft words audible next to loud ones (narrows the gap)', () => {
    const loud = speechLike(-8, 1.5, 1);
    const soft = speechLike(-34, 1.5, 2);
    const x = new Float32Array(loud.length + soft.length);
    x.set(loud);
    x.set(soft, loud.length);
    const y = new PhoneVoiceChain(SR).process(x.slice());
    const gapIn = db(rms(loud) / rms(soft));
    const gapOut = db(rms(y.subarray(SR / 2, loud.length)) / rms(y.subarray(loud.length + SR / 2)));
    expect(gapIn - gapOut).toBeGreaterThan(6);
  });

  it('compresses only above the threshold, gently', () => {
    expect(compressorGainDb(-40)).toBe(0);
    expect(compressorGainDb(-4)).toBeCloseTo(-12, 5); // 20 dB over at 2.5:1
    expect(LEVELLER_RANGE_DB.max).toBeLessThanOrEqual(12);
  });

  it('carries the leveller gain into the next reply of the same call', async () => {
    notePhoneListener('call-1', SIP);
    await drain(applyPhoneVoiceProfile(streamOf(framesOf(speechLike(-34, 3))), 'call-1', ON));
    const first = samplesOf(
      await drain(applyPhoneVoiceProfile(streamOf(framesOf(speechLike(-34, 0.3))), 'call-1', ON))
    );
    const fresh = new PhoneVoiceChain(SR).process(speechLike(-34, 0.3));
    expect(db(rms(first) / rms(fresh))).toBeGreaterThan(3);
  });
});
