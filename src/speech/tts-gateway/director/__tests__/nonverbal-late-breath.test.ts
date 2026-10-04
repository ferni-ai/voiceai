/**
 * The long-first-sentence breath, decided late (live run, 2026-10-03: the
 * scenario logged opening=None).
 *
 * The opening is decided on the reply's FIRST push, and the first push goes
 * out at once (review M3), often a few words with no sentence end. So the
 * Director keeps reading the first sentence as it streams: once it reaches
 * LONG_SENTENCE_WORDS with no opening decided, it decides a breath (same
 * cooldown, never after a sigh) and updates the Stage 2 plan, ONCE per
 * reply, merged with the tempo already planned. It stops reading when the
 * first sentence ends or 200 characters have streamed.
 */
import { ReadableStream } from 'node:stream/web';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VOICE_IDS } from '../../../../config/voice-ids.js';
import {
  clearReplyAudioPlan,
  mergeReplyAudioPlan,
  setReplyAudioPlan,
  takeReplyAudioPlan,
} from '../../../reply-audio-plan.js';
import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { decideLateBreath } from '../nonverbal.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

vi.mock('../../../reply-audio-plan.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../reply-audio-plan.js')>();
  return {
    ...actual,
    setReplyAudioPlan: vi.fn(actual.setReplyAudioPlan),
    mergeReplyAudioPlan: vi.fn(actual.mergeReplyAudioPlan),
  };
});

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const SESSION = 'late-breath';
const REPLY_ID = 'late-breath-reply';
const LIVE = { SPEECH_DIRECTOR: 'live', SPEECH_DIRECTOR_NONVERBAL: 'live' };
/** A soft start (0.9) on Ferni's PVC: the first plan carries a tempo of 0.9. */
const LONG_FIRST_SENTENCE = [
  '<speed ratio="0.9"/>So what I would really like ',
  'us to try together this week is one small thing ',
  'that you can keep doing every single morning. ',
  'Okay?',
];

async function reply(
  pushes: string[],
  env: Record<string, string> = LIVE,
  sessions = new DirectorSessions()
): Promise<{ summary: PlanSummary; sent: string[] }> {
  const inner = new Recorder();
  let summary: PlanSummary | undefined;
  const directed = directSpeech(inner, {
    textStream: new ReadableStream<string>({
      start(c) {
        c.enqueue(pushes.join(''));
        c.close();
      },
    }),
    voiceId: VOICE_IDS.FERNI,
    sessionId: SESSION,
    personaId: 'ferni',
    turnContext: { turnNumber: 3, userRequest: 'hi' },
    replyId: REPLY_ID,
    env,
    sessions,
    onPlan: (s) => (summary = s),
  });
  for await (const _ of directed.textStream) {
    /* observe */
  }
  for (const p of pushes) directed.reply.push(p);
  directed.reply.end();
  return { summary: summary as PlanSummary, sent: inner.pushes };
}

const planCalls = (): number =>
  vi.mocked(setReplyAudioPlan).mock.calls.length + vi.mocked(mergeReplyAudioPlan).mock.calls.length;

beforeEach(() => {
  vi.mocked(setReplyAudioPlan).mockClear();
  vi.mocked(mergeReplyAudioPlan).mockClear();
});
afterEach(() => clearReplyAudioPlan(SESSION));

describe('decideLateBreath', () => {
  it('breathes once the first sentence so far is long, within the breath cooldown', () => {
    const long = 'so what I would really like us to try together this week is one small thing';
    expect(decideLateBreath(long, {})).toEqual({ kind: 'breath', intensity: 0.5 });
    expect(decideLateBreath('so what I would really like', {})).toBeUndefined();
    expect(decideLateBreath(long, { sinceBreath: 1 })).toBeUndefined();
    expect(decideLateBreath(`${long} that you keep.`, { sinceBreath: 2 })?.kind).toBe('breath');
    // Only the first sentence counts.
    expect(
      decideLateBreath(
        'Short one. And then a much longer second sentence with lots and lots of words in it.',
        {}
      )
    ).toBeUndefined();
  });
});

describe('late breath on the push path', () => {
  it('updates the plan once with a breath, keeping the tempo already planned', async () => {
    const { summary } = await reply(LONG_FIRST_SENTENCE);
    expect(summary.opening).toBe('breath');
    expect(summary.openingReason).toBe('long-sentence');
    // The first plan (tempo) went out at the first push; the breath is the one update.
    expect(vi.mocked(setReplyAudioPlan).mock.calls[0][2]).toEqual({ tempo: 0.9 });
    expect(vi.mocked(mergeReplyAudioPlan)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(mergeReplyAudioPlan).mock.calls[0].slice(0, 2)).toEqual([SESSION, REPLY_ID]);
    expect(planCalls()).toBe(2);
    expect(takeReplyAudioPlan(SESSION, REPLY_ID)).toEqual({
      tempo: 0.9,
      opening: { kind: 'breath', intensity: 0.5 },
    });
  });

  it('plans the breath on its own when there was no first plan', async () => {
    const plain = LONG_FIRST_SENTENCE.map((p) => p.replace('<speed ratio="0.9"/>', ''));
    await reply(plain);
    expect(vi.mocked(setReplyAudioPlan)).not.toHaveBeenCalled();
    expect(takeReplyAudioPlan(SESSION, REPLY_ID)).toEqual({
      opening: { kind: 'breath', intensity: 0.5 },
    });
  });

  it('stops reading once the first sentence ends', async () => {
    const { summary } = await reply([
      'Okay, so ',
      'that is fine. ',
      'And now a much longer second sentence that goes on and on with many more words.',
    ]);
    expect(summary.opening).toBeUndefined();
    expect(vi.mocked(mergeReplyAudioPlan)).not.toHaveBeenCalled();
  });

  it('stops reading after 200 characters', async () => {
    const longWords = 'extraordinarily '.repeat(13); // 208 chars, 13 words, no end
    const { summary } = await reply([longWords, 'and then a few more words to get past sixteen. ']);
    expect(summary.opening).toBeUndefined();
    expect(vi.mocked(mergeReplyAudioPlan)).not.toHaveBeenCalled();
  });

  it('never after a sigh', async () => {
    const { summary } = await reply(['*sighs* ', ...LONG_FIRST_SENTENCE.slice(1)]);
    expect(summary.opening).toBe('sigh');
    expect(vi.mocked(mergeReplyAudioPlan)).not.toHaveBeenCalled();
  });

  it('keeps the breath cooldown', async () => {
    const sessions = new DirectorSessions();
    sessions.update(SESSION, 'ferni', { speed: 1, sinceBreath: 0 });
    const { summary } = await reply(LONG_FIRST_SENTENCE, LIVE, sessions);
    expect(summary.opening).toBeUndefined();
    expect(vi.mocked(mergeReplyAudioPlan)).not.toHaveBeenCalled();
  });

  it('shadow decides and logs the breath but plans nothing', async () => {
    const { summary } = await reply(LONG_FIRST_SENTENCE, {
      SPEECH_DIRECTOR: 'live',
      SPEECH_DIRECTOR_NONVERBAL: 'shadow',
    });
    expect(summary.opening).toBe('breath');
    expect(vi.mocked(mergeReplyAudioPlan)).not.toHaveBeenCalled();
  });
});
