/**
 * Ferni's voice is a Professional Voice Clone (VOICE_IDS.FERNI). Cartesia
 * ignores <speed>, <emotion> and <volume> on a PVC (measured 2026-10-03), so
 * with the Director live those tags are taken off every push (they do nothing
 * but clutter the text) and the reply's pace goes to Stage 2 as a tempo for
 * this (session, turn), composed with any incoming speed and kept gentle.
 * Instant-clone voices keep their tags; shadow never changes a push.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, describe, expect, it } from 'vitest';

import { VOICE_IDS } from '../../../../config/voice-ids.js';
import { clearReplyAudioPlan, takeReplyAudioPlan } from '../../../reply-audio-plan.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { decideSpeed } from '../pacing.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

const INSTANT_CLONE = 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc';
const SESSION = 'pvc-session';
const PROSODY_TAG = /<\/?(?:speed|emotion|volume)\b/i;

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

/** A soft start (interrupt recovery) slows the opening; continuation-tts resets it after. */
const SOFT_START = [
  '<speed ratio="0.9"/><volume ratio="0.8"/><emotion value="sympathetic"/>I\'m so sorry you\'re going through this. ',
  '<speed ratio="1"/><volume ratio="1"/>Take all the time you need. ',
];

async function run(opts: {
  env: Record<string, string>;
  voiceId?: string;
  pushes?: string[];
  turn?: number;
  replyId?: string;
}) {
  const pushes = opts.pushes ?? SOFT_START;
  const replyId = opts.replyId ?? 'pvc-reply';
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(pushes.join(''));
        c.close();
      },
    }),
    voiceId: opts.voiceId ?? VOICE_IDS.FERNI,
    sessionId: SESSION,
    personaId: 'ferni',
    turnContext: { turnNumber: opts.turn ?? 4 },
    replyId,
    env: opts.env,
    sessions: new DirectorSessions(),
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of pushes) directed.reply.push(p);
  directed.reply.end();
  return { pushes: inner.pushes, summary: summary!, replyId };
}

afterEach(() => clearReplyAudioPlan(SESSION));

describe('Director live on a Professional Voice Clone', () => {
  it('sends no speed, emotion or volume tag in any push, and keeps every word', async () => {
    const { pushes } = await run({ env: { SPEECH_DIRECTOR: 'live' } });
    for (const push of pushes) expect(push).not.toMatch(PROSODY_TAG);
    const all = pushes.join('');
    expect(all).toContain("I'm so sorry you're going through this.");
    expect(all).toContain('Take all the time you need.');
  });

  it("routes the reply's pace, composed with the soft start, to Stage 2 for this reply", async () => {
    const { summary } = await run({ env: { SPEECH_DIRECTOR: 'live' }, turn: 7 });
    // Heavy reply: 0.97 from a carried 1; the 0.9 soft start composes to 0.87.
    expect(summary.speed).toBe(0.97);
    expect(summary.tempo).toBe(0.87);
    expect(takeReplyAudioPlan(SESSION, 'a-different-reply')).toBeUndefined(); // never another reply's plan
  });

  it('sets the plan for exactly (session, replyId)', async () => {
    const { replyId } = await run({ env: { SPEECH_DIRECTOR: 'live' }, turn: 7 });
    expect(takeReplyAudioPlan(SESSION, replyId)).toEqual({ tempo: 0.87 });
  });

  it('keeps the tempo gentle: clamped to 0.85-1.15', async () => {
    const slow = ['<speed ratio="0.6"/>That is a lot to carry, I know. ', 'We go slowly. '];
    const { summary } = await run({ env: { SPEECH_DIRECTOR: 'live' }, pushes: slow });
    expect(summary.tempo).toBe(0.85);
  });

  it('sets no tempo when the pacing lever is not live (tags still stripped)', async () => {
    const { pushes, summary, replyId } = await run({
      env: { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_PACING: 'shadow' },
    });
    expect(summary.tempo).toBeUndefined();
    expect(takeReplyAudioPlan(SESSION, replyId)).toBeUndefined();
    for (const push of pushes) expect(push).not.toMatch(PROSODY_TAG);
  });

  it('changes nothing in shadow: pushes verbatim, no plan', async () => {
    const { pushes, replyId } = await run({ env: { SPEECH_DIRECTOR: 'shadow' } });
    expect(pushes).toEqual(SOFT_START);
    expect(takeReplyAudioPlan(SESSION, replyId)).toBeUndefined();
  });
});

describe('Director live on an instant clone', () => {
  it('keeps prosody tags and sets no Stage 2 tempo', async () => {
    const { pushes, summary, replyId } = await run({
      env: { SPEECH_DIRECTOR: 'live' },
      voiceId: INSTANT_CLONE,
    });
    expect(pushes[0]).toMatch(/^<speed ratio="0.87"\/>/);
    expect(pushes[0]).toContain('<emotion value="sympathetic"/>');
    expect(summary.tempo).toBeUndefined();
    expect(takeReplyAudioPlan(SESSION, replyId)).toBeUndefined();
  });
});

describe('decideSpeed on a PVC', () => {
  it('still decides the pace (for Stage 2) but marks the tag unsupported', () => {
    expect(decideSpeed({ valence: 'heavy', voiceId: VOICE_IDS.FERNI })).toEqual({
      speed: 0.97,
      supported: false,
    });
  });
});
