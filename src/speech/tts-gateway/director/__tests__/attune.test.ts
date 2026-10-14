/**
 * VOICE_ATTUNE: the reply's pace, loudness and tone answer the caller's mood,
 * move toward it across turns without jumping, stay inside sane bounds, and
 * leave the reply untouched when the flag is off or the caller reads neutral.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import {
  getCallerProsodyTracker,
  removeCallerProsodyTracker,
} from '../../../audio-prosody/caller-prosody.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import {
  HEAVY,
  LOUDNESS_BAND_DB,
  MAX_SPEED_STEP,
  PACE_BAND,
  MAX_VOLUME_STEP,
  SPEED_RANGE,
  VOLUME_RANGE,
  callerState,
  decideAttune,
  entrain,
  voiceAttuneOn,
} from '../attune.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const IVC = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

async function reply(opts: {
  pushes: string[];
  userEmotion?: string;
  /** What the caller said (its word count paces the caller's voice reading). */
  userRequest?: string;
  env: Record<string, string>;
  sessions?: DirectorSessions;
}): Promise<{ pushes: string[]; summary: PlanSummary }> {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(opts.pushes.join(''));
        c.close();
      },
    }),
    voiceId: IVC,
    sessionId: 'attune',
    personaId: 'ferni',
    turnContext: {
      userEmotion: opts.userEmotion ? { primary: opts.userEmotion } : undefined,
      userRequest: opts.userRequest,
    },
    env: { SPEECH_DIRECTOR: 'live', ...opts.env },
    sessions: opts.sessions ?? new DirectorSessions(),
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of opts.pushes) directed.reply.push(p);
  directed.reply.end();
  return { pushes: inner.pushes, summary: summary! };
}

const ratio = (push: string, tag: 'speed' | 'volume'): number | undefined => {
  const m = new RegExp(`<${tag} ratio="([\\d.]+)"/>`).exec(push);
  return m ? Number(m[1]) : undefined;
};

const NEUTRAL_WORDS = ['Okay, so where do you want to start with all of it? ', 'Take your time. '];

describe('the flag', () => {
  it('is off unless set', () => {
    expect(voiceAttuneOn({})).toBe(false);
    expect(voiceAttuneOn({ VOICE_ATTUNE: 'on' })).toBe(true);
  });
});

describe('callerState', () => {
  it("reads the turn analyzer's labels by exact word", () => {
    expect(callerState('sadness')).toBe('low');
    expect(callerState('Regret')).toBe('low');
    expect(callerState('anxiety')).toBe('tense');
    expect(callerState('anger')).toBe('tense');
    expect(callerState('joy')).toBe('bright');
    expect(callerState('trust')).toBe('neutral');
    expect(callerState(undefined)).toBe('neutral');
    // Not a substring match: "unhappy" is not "happy", "sadly" is not "sad".
    expect(callerState('unhappy')).toBe('neutral');
    expect(callerState('sadly')).toBe('neutral');
  });

  it("lets a non-steady reading of the caller's voice speak for the turn", () => {
    expect(callerState('joy', { speedNudge: -0.06, reason: 'low' })).toBe('low');
    expect(callerState('sadness', { speedNudge: 0, reason: 'steady' })).toBe('low');
  });
});

describe('decideAttune', () => {
  it('drops to the low target at once for a low caller, and holds it', () => {
    let previous = { speed: 1, volume: 1 };
    for (let turn = 0; turn < 3; turn++) {
      const a = decideAttune({ state: 'low', valence: 'neutral', previous });
      expect(a.emotion).toBe('calm');
      expect(a.speed).toBe(0.86);
      expect(a.volume).toBe(0.85);
      previous = { speed: a.speed, volume: a.volume };
    }
  });

  it('still moves up toward a target one step at a time', () => {
    const a = decideAttune({
      state: 'bright',
      valence: 'neutral',
      previous: { speed: 0.86, volume: 0.8 },
    });
    expect(a.speed - 0.86).toBeLessThanOrEqual(MAX_SPEED_STEP + 1e-9);
    expect(a.volume - 0.8).toBeLessThanOrEqual(MAX_VOLUME_STEP + 1e-9);
  });

  it('answers heavy words to a low caller with sympathy', () => {
    const a = decideAttune({ state: 'low', valence: 'heavy', previous: {} });
    expect(a.emotion).toBe('sympathetic');
  });

  it('brightens for good news inside the bounds, however long it lasts', () => {
    let previous = { speed: 1, volume: 1 };
    for (let turn = 0; turn < 10; turn++) {
      const a = decideAttune({ state: 'bright', valence: 'bright', previous, nudge: 0.02 });
      expect(a.emotion).toBe('content');
      previous = { speed: a.speed, volume: a.volume };
    }
    expect(previous.speed).toBeGreaterThan(1);
    expect(previous.speed).toBeLessThanOrEqual(SPEED_RANGE[1]);
    expect(previous.volume).toBeGreaterThan(1);
    expect(previous.volume).toBeLessThanOrEqual(VOLUME_RANGE[1]);
  });

  it('returns to neutral gradually, not in one jump', () => {
    const a = decideAttune({
      state: 'neutral',
      valence: 'neutral',
      previous: { speed: 0.86, volume: 0.85 },
    });
    expect(a.speed).toBe(0.94);
    expect(a.volume).toBe(0.95);
    expect(a.emotion).toBeUndefined();
  });

  it('never brightens heavy words, even for a joyful caller', () => {
    const a = decideAttune({ state: 'bright', valence: 'heavy', previous: {} });
    expect(a.speed).toBeLessThan(1);
    expect(a.volume).toBeLessThan(1);
    expect(a.emotion).toBeUndefined();
  });
});

describe('on the reply stream', () => {
  it('leaves a sad caller unanswered with the flag off (the gap this closes)', async () => {
    const { pushes, summary } = await reply({
      pushes: NEUTRAL_WORDS,
      userEmotion: 'sadness',
      env: {},
    });
    expect(summary.speed).toBe(1);
    expect(summary.attune).toBeUndefined();
    expect(pushes.join('')).not.toMatch(/<volume|<speed/);
  });

  it('slows, softens and calms the opening for a sad caller with the flag on', async () => {
    const { pushes, summary } = await reply({
      pushes: NEUTRAL_WORDS,
      userEmotion: 'sadness',
      env: { VOICE_ATTUNE: 'on' },
    });
    expect(summary.attune).toBe('low');
    expect(ratio(pushes[0], 'speed')).toBe(0.86);
    expect(ratio(pushes[0], 'volume')).toBe(0.85);
    expect(pushes[0]).toContain('<emotion value="calm"/>');
    expect(summary.emotionSource).toBe('prosody');
  });

  it('changes nothing for a neutral caller', async () => {
    const off = await reply({ pushes: NEUTRAL_WORDS, userEmotion: 'neutral', env: {} });
    const on = await reply({
      pushes: NEUTRAL_WORDS,
      userEmotion: 'neutral',
      env: { VOICE_ATTUNE: 'on' },
    });
    expect(on.pushes).toEqual(off.pushes);
    expect(on.summary.speed).toBe(off.summary.speed);
  });

  it('carries the attuned pace and loudness to the next reply', async () => {
    const sessions = new DirectorSessions();
    const env = { VOICE_ATTUNE: 'on' };
    await reply({ pushes: NEUTRAL_WORDS, userEmotion: 'sadness', env, sessions });
    const second = await reply({ pushes: NEUTRAL_WORDS, userEmotion: 'sadness', env, sessions });
    expect(second.summary.speed).toBe(0.86);
    expect(second.summary.volume).toBe(0.85);
  });

  it('scales a soft start and its later reset by the attuned loudness', async () => {
    const { pushes } = await reply({
      pushes: ['<volume ratio="0.8"/>Okay, I hear you. ', '<volume ratio="1"/>Tell me more. '],
      userEmotion: 'sadness',
      env: { VOICE_ATTUNE: 'on' },
    });
    expect(ratio(pushes[0], 'volume')).toBe(0.68);
    expect(ratio(pushes[1], 'volume')).toBe(0.85);
  });
});

const HEAVY_WORDS = ["I'm so sorry, that's really hard. ", 'I am here. '];

/** The caller speaks `ms` of voice at `db` (10 ms frames, steady 120 Hz unless `hz`). */
function callerSpeaks(ms: number, db: number, hz = 120, at = 0): number {
  const tracker = getCallerProsodyTracker('attune');
  for (let t = 0; t < ms; t += 10) {
    tracker.addFrame({ pitchHz: hz, pitchConfidence: 0.9, energyDb: db, isSpeech: true }, at + t);
  }
  return at + ms;
}

const words = (n: number): string => Array.from({ length: n }, () => 'word').join(' ');

describe('heavy words', () => {
  it('drop to the heavy pace and loudness at once, for any caller', () => {
    for (const state of ['neutral', 'bright', 'tense', 'low'] as const) {
      const a = decideAttune({ state, valence: 'heavy', previous: { speed: 1, volume: 1 } });
      expect(a.speed).toBeLessThanOrEqual(HEAVY.speed);
      expect(a.volume).toBeLessThanOrEqual(HEAVY.volume);
    }
  });

  it('slow and soften the reply on the stream only with the flag on', async () => {
    const off = await reply({ pushes: HEAVY_WORDS, env: {} });
    const on = await reply({ pushes: HEAVY_WORDS, env: { VOICE_ATTUNE: 'on' } });
    expect(off.summary.speed).toBeGreaterThan(0.94);
    expect(ratio(off.pushes[0], 'volume')).toBeUndefined();
    expect(ratio(on.pushes[0], 'speed')).toBe(HEAVY.speed);
    expect(ratio(on.pushes[0], 'volume')).toBe(HEAVY.volume);
  });
});

describe('a sympathetic reply', () => {
  // "Ah, man." alone doesn't read heavy; the LLM's sympathetic tag says it is.
  const SYMPATHETIC = [
    '<emotion value="sympathetic"/>Ah, man. ',
    'That is a lot to carry right now. ',
  ];

  it('slows and softens like heavy words, only with the flag on', async () => {
    const off = await reply({ pushes: SYMPATHETIC, env: {} });
    const on = await reply({ pushes: SYMPATHETIC, env: { VOICE_ATTUNE: 'on' } });
    expect(on.summary.emotion).toBe('sympathetic');
    expect(off.summary.speed).toBeGreaterThan(0.9);
    expect(ratio(on.pushes[0], 'speed')).toBe(HEAVY.speed);
    expect(ratio(on.pushes[0], 'volume')).toBe(HEAVY.volume);
  });
});

describe('entrain', () => {
  it("follows the caller's pace half-way, never quicker than the ceiling", () => {
    expect(entrain({ wordsPerSec: 4 }).speed).toBe(1);
    expect(entrain({ wordsPerSec: 3.2 }).speed).toBeCloseTo(0.9, 5);
    expect(entrain({ wordsPerSec: 3.6 }).speed).toBeCloseTo(0.95, 5);
    expect(entrain({ wordsPerSec: 9 }).speed).toBe(PACE_BAND[1]);
    expect(entrain({ wordsPerSec: 1 }).speed).toBe(PACE_BAND[0]);
    expect(entrain(undefined)).toEqual({ speed: 1, volume: 1 });
  });

  it("follows the caller's loudness half-way, softer readily and louder only a little", () => {
    expect(20 * Math.log10(entrain({ energyRelDb: -4 }).volume)).toBeCloseTo(-2, 5);
    expect(20 * Math.log10(entrain({ energyRelDb: -20 }).volume)).toBeCloseTo(
      LOUDNESS_BAND_DB[0],
      5
    );
    expect(20 * Math.log10(entrain({ energyRelDb: 20 }).volume)).toBeCloseTo(
      LOUDNESS_BAND_DB[1],
      5
    );
  });
});

describe("the caller's voice on the stream", () => {
  afterEach(() => removeCallerProsodyTracker('attune'));
  const env = { VOICE_ATTUNE: 'on' };

  it("paces the reply to a slow caller's measured voice, and to a fast one's up to the ceiling", async () => {
    callerSpeaks(3000, -30);
    const slow = await reply({ pushes: NEUTRAL_WORDS, userRequest: words(8), env });
    removeCallerProsodyTracker('attune');
    callerSpeaks(3000, -30);
    const fast = await reply({ pushes: NEUTRAL_WORDS, userRequest: words(20), env });
    expect(slow.summary.callerWordsPerSec).toBe(2.7);
    expect(ratio(slow.pushes[0], 'speed')).toBe(0.93);
    expect(ratio(fast.pushes[0], 'speed')).toBe(1.03);
  });

  it('ignores the measured voice with the flag off', async () => {
    callerSpeaks(3000, -30);
    const { pushes } = await reply({ pushes: NEUTRAL_WORDS, userRequest: words(8), env: {} });
    expect(pushes.join('')).not.toMatch(/<volume|<speed/);
  });

  it('softens when the caller drops below their usual loudness, and ignores pitch', async () => {
    const sessions = new DirectorSessions();
    const end = callerSpeaks(3000, -30);
    await reply({ pushes: NEUTRAL_WORDS, userRequest: words(12), env, sessions });
    // Same pace and loudness, four semitones higher: nothing to follow.
    const end2 = callerSpeaks(3000, -30, 120 * 2 ** (4 / 12), end + 5000);
    const higher = await reply({ pushes: NEUTRAL_WORDS, userRequest: words(12), env, sessions });
    expect(higher.pushes.join('')).not.toMatch(/<volume|<speed/);
    // Same pace, 6 dB quieter than their usual: toward 3 dB softer, one step a reply.
    callerSpeaks(3000, -36, 120, end2 + 5000);
    const quieter = await reply({ pushes: NEUTRAL_WORDS, userRequest: words(12), env, sessions });
    expect(quieter.summary.callerEnergyRelDb).toBeCloseTo(-6, 0);
    expect(ratio(quieter.pushes[0], 'volume')).toBe(1 - MAX_VOLUME_STEP);
    expect(ratio(quieter.pushes[0], 'speed')).toBeUndefined();
  });
});
