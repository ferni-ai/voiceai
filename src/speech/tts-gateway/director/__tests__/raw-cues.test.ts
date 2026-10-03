/**
 * Review L1: the raw-stream scan runs on every token, so it must be linear
 * (no rescan of the whole reply per chunk) and must never throw into the
 * text stream (continuation-tts cancels the reply on a text-stream error).
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';

import type { ReplyStream } from '../../providers/cartesia-reply-stream.js';
import { RawCues } from '../raw-cues.js';
import { directSpeech, type PlanSummary } from '../reply-director.js';
import { DirectorSessions } from '../session-state.js';

class Sink implements ReplyStream {
  push(): void {}
  end(): void {}
  cancel(): void {}
  async *[Symbol.asyncIterator](): AsyncGenerator<ArrayBuffer> {}
}

describe('RawCues', () => {
  it('scans each character a bounded number of times, however long the reply', () => {
    const cues = new RawCues();
    const chunks = 2000;
    for (let i = 0; i < chunks; i++) cues.see('word ');
    // Each chunk is scanned with at most a 64-char overlap: O(n), not O(n²).
    expect(cues.scannedChars).toBeLessThanOrEqual(chunks * (5 + 64));
  });

  it('counts a sigh split across chunks exactly once', () => {
    const cues = new RawCues();
    for (const c of ['I know. [si', 'ghs] Okay. ', 'And *sigh', 's* again.']) cues.see(c);
    expect(cues.takeSighs()).toBe(2);
    cues.see(' Nothing more.');
    expect(cues.takeSighs()).toBe(0);
  });

  it('reads an emotion tag split across chunks whole', () => {
    const cues = new RawCues();
    cues.see('<emotion value="sym');
    cues.see('pathetic"/>Oh, I hear you.');
    expect(cues.authoredEmotion).toBe('sympathetic');
  });

  it('stops scanning instead of throwing on a bad chunk', () => {
    const cues = new RawCues();
    const bad = {
      toString(): string {
        throw new Error('not text');
      },
    } as unknown as string;
    expect(() => cues.see(bad)).not.toThrow();
    expect(cues.failed).toBe(true);
  });
});

describe('the raw stream through directSpeech', () => {
  it('uses the whole authored emotion when the tag arrives in pieces', async () => {
    let summary: PlanSummary | undefined;
    const directed = directSpeech(new Sink(), {
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue('<emotion value="sym');
          c.enqueue('pathetic"/>Okay, tell me more about that. ');
          c.close();
        },
      }),
      voiceId: 'fdeb5d75-4f2e-4224-9e98-6aa6aa1188bc',
      env: { SPEECH_DIRECTOR: 'shadow' },
      sessions: new DirectorSessions(),
      onPlan: (s) => (summary = s),
    });
    for await (const _ of directed.textStream) {
      /* observe */
    }
    directed.reply.push('Okay, tell me more about that. ');
    directed.reply.end();
    expect(summary?.emotion).toBe('sympathetic');
    expect(summary?.emotionSource).toBe('authored');
  });

  it('keeps the text stream flowing when a chunk cannot be scanned', async () => {
    const bad = {
      toString(): string {
        throw new Error('not text');
      },
    } as unknown as string;
    const directed = directSpeech(new Sink(), {
      textStream: new ReadableStream<string>({
        start(c) {
          c.enqueue(bad);
          c.enqueue('Hello there.');
          c.close();
        },
      }),
      voiceId: 'v',
      env: { SPEECH_DIRECTOR: 'shadow' },
      sessions: new DirectorSessions(),
      onPlan: () => undefined,
    });
    const seen: unknown[] = [];
    for await (const chunk of directed.textStream) seen.push(chunk);
    expect(seen).toEqual([bad, 'Hello there.']);
  });
});
