/**
 * VOICE_ATTUNE: the reply's pace, loudness and tone answer the caller's mood,
 * move toward it across turns without jumping, stay inside sane bounds, and
 * leave the reply untouched when the flag is off or the caller reads neutral.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import {
  MAX_SPEED_STEP,
  MAX_VOLUME_STEP,
  SPEED_RANGE,
  VOLUME_RANGE,
  callerState,
  decideAttune,
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
    turnContext: opts.userEmotion ? { userEmotion: { primary: opts.userEmotion } } : undefined,
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
  it('slows and softens for a low caller, toward the target over turns', () => {
    let previous = { speed: 1, volume: 1 };
    const speeds: number[] = [];
    for (let turn = 0; turn < 4; turn++) {
      const a = decideAttune({ state: 'low', valence: 'neutral', previous });
      expect(a.emotion).toBe('calm');
      expect(previous.speed - a.speed).toBeLessThanOrEqual(MAX_SPEED_STEP + 1e-9);
      expect(previous.volume - a.volume).toBeLessThanOrEqual(MAX_VOLUME_STEP + 1e-9);
      speeds.push(a.speed);
      previous = { speed: a.speed, volume: a.volume };
    }
    expect(speeds[0]).toBe(0.92);
    expect(speeds[3]).toBeLessThan(0.88);
    expect(previous.volume).toBeLessThan(0.88);
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
    expect(ratio(pushes[0], 'speed')).toBe(0.92);
    expect(ratio(pushes[0], 'volume')).toBe(0.9);
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
    expect(second.summary.speed).toBe(0.88);
    expect(second.summary.volume).toBe(0.87);
  });

  it('scales a soft start and its later reset by the attuned loudness', async () => {
    const { pushes } = await reply({
      pushes: ['<volume ratio="0.8"/>Okay, I hear you. ', '<volume ratio="1"/>Tell me more. '],
      userEmotion: 'sadness',
      env: { VOICE_ATTUNE: 'on' },
    });
    expect(ratio(pushes[0], 'volume')).toBe(0.72);
    expect(ratio(pushes[1], 'volume')).toBe(0.9);
  });
});
