/**
 * Phrasing must never cost time to audio: the first piece goes out at once
 * (review M3), and any later hold is released after HOLD_RELEASE_MS even when
 * the LLM goes quiet (review M5). A manual timer makes the release
 * deterministic.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { directSpeech, HOLD_RELEASE_MS, type HoldTimer } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

class Recorder implements ReplyStream {
  pushes: string[] = [];
  push(text: string): void {
    this.pushes.push(text);
  }
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

class ManualTimer implements HoldTimer {
  armed = new Map<number, { fn: () => void; ms: number }>();
  private next = 1;
  set(fn: () => void, ms: number): number {
    const id = this.next++;
    this.armed.set(id, { fn, ms });
    return id;
  }
  clear(handle: unknown): void {
    this.armed.delete(handle as number);
  }
  /** Fire everything armed, as if HOLD_RELEASE_MS passed with no new piece. */
  elapse(): void {
    const due = [...this.armed.values()];
    this.armed.clear();
    for (const { fn } of due) fn();
  }
}

function direct(mode: 'live' | 'shadow', timer: ManualTimer) {
  const inner = new Recorder();
  const reply = directSpeech(inner, {
    textStream: new ReadableStream<string>(),
    voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
    sessionId: 'timing',
    personaId: 'ferni',
    env: { SPEECH_DIRECTOR: mode },
    sessions: new DirectorSessions(),
    onPlan: () => undefined,
    holdTimer: timer,
  }).reply;
  return { inner, reply };
}

const words = (pushes: string[]): string[] =>
  pushes
    .join(' ')
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

describe('first piece (review M3)', () => {
  it('pushes an opener ending in "..." immediately, without waiting for the next piece', () => {
    const timer = new ManualTimer();
    const { inner, reply } = direct('live', timer);
    reply.push('Hmm... ');
    expect(inner.pushes).toHaveLength(1);
    expect(inner.pushes[0]).toContain('Hmm...');
    expect(timer.armed.size).toBe(0);
  });
});

describe('phrasing hold time limit (review M5)', () => {
  it(`releases held text after ${HOLD_RELEASE_MS} ms when no new piece arrives`, () => {
    const timer = new ManualTimer();
    const { inner, reply } = direct('live', timer);
    reply.push('Okay. ');
    reply.push('so much of what you are carrying right now is ');
    // Held: no boundary in the piece, and it is not the first.
    expect(inner.pushes).toHaveLength(1);
    expect([...timer.armed.values()].map((t) => t.ms)).toEqual([HOLD_RELEASE_MS]);

    timer.elapse();
    expect(inner.pushes).toHaveLength(2);
    expect(inner.pushes[1]).toContain('so much of what you are carrying right now is');

    reply.push('not yours to carry. ');
    reply.end();
    expect(words(inner.pushes)).toEqual(
      words(['Okay.', 'so much of what you are carrying right now is', 'not yours to carry.'])
    );
  });

  it('cancels the release when the next piece frees the hold, so nothing is spoken twice', () => {
    const timer = new ManualTimer();
    const { inner, reply } = direct('live', timer);
    reply.push('Okay. ');
    reply.push('so much of what you are carrying right now is ');
    reply.push('not yours to carry. ');
    expect(timer.armed.size).toBe(0);
    timer.elapse();
    reply.end();
    expect(words(inner.pushes)).toEqual(
      words(['Okay.', 'so much of what you are carrying right now is not yours to carry.'])
    );
  });

  it('never arms a release in shadow (pushes are already forwarded verbatim)', () => {
    const timer = new ManualTimer();
    const { inner, reply } = direct('shadow', timer);
    reply.push('Okay. ');
    reply.push('so much of what you are carrying right now is ');
    expect(timer.armed.size).toBe(0);
    reply.end();
    expect(inner.pushes).toEqual(['Okay. ', 'so much of what you are carrying right now is ']);
  });

  it('drops the release once the reply has ended', () => {
    const timer = new ManualTimer();
    const { inner, reply } = direct('live', timer);
    reply.push('Okay. ');
    reply.push('so much of what you are carrying right now is ');
    reply.end();
    const after = inner.pushes.length;
    timer.elapse();
    expect(inner.pushes).toHaveLength(after);
  });
});
