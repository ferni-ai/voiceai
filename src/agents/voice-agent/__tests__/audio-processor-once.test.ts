/**
 * processAudioStream runs once per session. Two paths started it for the same
 * call (agent-setup's track subscription and FerniAgent.sttNode's tee), and
 * dev logs showed every session initialising its audio analysis twice.
 */
import { ReadableStream } from 'node:stream/web';
import { describe, expect, it } from 'vitest';
import type { AudioFrame } from '@livekit/rtc-node';
import { processAudioStream } from '../audio-processor.js';

function controllable() {
  let close!: () => void;
  let cancelled = false;
  const stream = new ReadableStream<AudioFrame>({
    start(c) {
      close = () => c.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, close: () => close(), wasCancelled: () => cancelled };
}

describe('processAudioStream', () => {
  it('ignores and cancels a second stream for a session already being processed', async () => {
    const first = controllable();
    const second = controllable();
    const running = processAudioStream(first.stream as never, { sessionId: 'once-test' } as never);
    await processAudioStream(second.stream as never, { sessionId: 'once-test' } as never);
    expect(second.wasCancelled()).toBe(true);
    expect(first.wasCancelled()).toBe(false);

    first.close();
    await running;

    // The session is free again: a new stream is processed, not cancelled.
    const third = controllable();
    const again = processAudioStream(third.stream as never, { sessionId: 'once-test' } as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(third.wasCancelled()).toBe(false);
    third.close();
    await again;
  });
});
