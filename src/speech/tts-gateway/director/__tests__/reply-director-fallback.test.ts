/**
 * A Director failure must never cost the caller audio: the reply falls back
 * to forwarding continuation-tts's pushes verbatim, including any phrase the
 * Director was holding.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it, vi } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

vi.mock('../normalize.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../normalize.js')>();
  return {
    normalizeForSpeech: (text: string) => {
      if (text.includes('BOOM')) throw new Error('normalizer exploded');
      return real.normalizeForSpeech(text);
    },
  };
});

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

describe('Director failure', () => {
  it('forwards pushes verbatim for the rest of the reply and reports the failure', () => {
    const inner = new Recorder();
    const plans: PlanSummary[] = [];
    const reply = directSpeech(inner, {
      textStream: new ReadableStream<string>(),
      voiceId: 'v',
      env: { SPEECH_DIRECTOR: 'live' },
      sessions: new DirectorSessions(),
      onPlan: (s) => plans.push(s),
    }).reply;

    reply.push('We met at 7pm and it was so much more than we planned on spending this week for ');
    reply.push('BOOM goes the reply. ');
    reply.push('And this one is after it. ');
    reply.end();

    // The held tail of the first push is not lost; BOOM and after are verbatim.
    const all = inner.pushes.join('');
    expect(all).toContain('at 7 PM and'); // directed before the failure
    expect(all).toContain('spending this week for');
    expect(inner.pushes).toContain('BOOM goes the reply. ');
    expect(inner.pushes.at(-1)).toBe('And this one is after it. ');
    expect(inner.ended).toBe(true);
    expect(plans).toHaveLength(1);
    expect(plans[0].failed).toBe(true);
  });
});
