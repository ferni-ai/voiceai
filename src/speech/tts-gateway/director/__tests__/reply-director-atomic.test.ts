/**
 * Review M4: a throw inside the Director's push path must never make any
 * text be spoken twice or out of order. The opening-tag renderer is made to
 * throw AFTER phrasing has already taken the push (head out, tail held), the
 * exact point where the old fallback replayed the held tail and then the raw
 * push, so the tail was spoken twice and ahead of its head.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

vi.mock('../../providers/cartesia.js', () => ({
  prosodyTags: () => {
    throw new Error('tag renderer exploded');
  },
}));

class Recorder implements ReplyStream {
  pushes: string[] = [];
  ended = false;
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {
    this.ended = true;
  }
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

const words = (pushes: string[]): string[] =>
  pushes
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

describe('Director failure after phrasing took the push', () => {
  it('speaks every word exactly once, in order', () => {
    const inner = new Recorder();
    const plans: PlanSummary[] = [];
    const reply = directSpeech(inner, {
      textStream: new ReadableStream<string>(),
      voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
      sessionId: 'atomic',
      personaId: 'ferni',
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      onPlan: (s) => plans.push(s),
    }).reply;

    const pushes = [
      // Re-cut at the comma: head goes out, "and then we can..." is held.
      'Okay so the plan for this week is to call your sister first, and then we can talk about the rest of ',
      'the money once you have slept on it. ',
      'Sound good? ',
    ];
    for (const p of pushes) reply.push(p);
    reply.end();

    expect(plans[0].failed).toBe(true);
    expect(words(inner.pushes)).toEqual(words(pushes));
    expect(inner.ended).toBe(true);
  });
});
