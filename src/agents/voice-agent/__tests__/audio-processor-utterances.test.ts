import { setImmediate } from 'node:timers';
import { ReadableStream, type ReadableStreamDefaultController } from 'node:stream/web';
import type { AudioFrame } from '@livekit/rtc-node';
import { describe, expect, it, vi } from 'vitest';

const analyzer = {
  processAudioFrame: vi.fn(),
  analyze: vi.fn(() => null),
  clearBuffers: vi.fn(),
};

vi.mock('../../../speech/audio-prosody.js', () => ({
  getSessionAudioProsodyAnalyzer: () => analyzer,
  getRealTimeAnalyzer: () => null,
}));

const { processAudioStream } = await import('../audio-processor.js');

const frame = {
  data: new Int16Array(160),
  sampleRate: 16000,
  channels: 1,
} as unknown as AudioFrame;

/** A stream the test feeds frame by frame, then closes. */
function audioTap() {
  let controller!: ReadableStreamDefaultController<AudioFrame>;
  const stream = new ReadableStream<AudioFrame>({ start: (c) => void (controller = c) });
  return { stream, push: () => controller.enqueue(frame), close: () => controller.close() };
}

const tick = () =>
  new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

describe('processAudioStream', () => {
  it('analyzes the voice at the end of each utterance, not only when the call ends', async () => {
    let utteranceEnded = () => {};
    const tap = audioTap();
    const done = processAudioStream(tap.stream, {
      sessionId: 'session-utterances',
      sendDataMessage: async () => undefined,
      utteranceEnds: (onEnd) => {
        utteranceEnded = onEnd;
        return () => undefined;
      },
    });

    tap.push();
    await tick();
    utteranceEnded();
    await tick();
    expect(analyzer.analyze).toHaveBeenCalledTimes(1);
    expect(analyzer.clearBuffers).toHaveBeenCalledTimes(1);

    tap.close();
    await done;
    expect(analyzer.analyze).toHaveBeenCalledTimes(2);
  });

  it('lets one tap own a session; a second one only drains its audio', async () => {
    analyzer.processAudioFrame.mockClear();
    const first = audioTap();
    const second = audioTap();
    const ctx = { sessionId: 'session-two-taps', sendDataMessage: async () => undefined };
    const firstDone = processAudioStream(first.stream, ctx);
    const secondDone = processAudioStream(second.stream, ctx);

    first.push();
    second.push();
    second.close();
    await secondDone;
    await tick();
    expect(analyzer.processAudioFrame).toHaveBeenCalledTimes(1);

    first.close();
    await firstDone;
  });

  it('hands the session to the other tap when the owner stream ends', async () => {
    analyzer.processAudioFrame.mockClear();
    analyzer.analyze.mockClear();
    let secondEnded = () => {};
    const first = audioTap();
    const second = audioTap();
    const ctx = { sessionId: 'session-handover', sendDataMessage: async () => undefined };
    const firstDone = processAudioStream(first.stream, ctx);
    const secondDone = processAudioStream(second.stream, {
      ...ctx,
      utteranceEnds: (onEnd) => {
        secondEnded = onEnd;
        return () => undefined;
      },
    });

    first.push();
    second.push();
    await tick();
    secondEnded(); // not the owner yet: no analysis
    await tick();
    expect(analyzer.processAudioFrame).toHaveBeenCalledTimes(1);

    first.close();
    await firstDone;
    const analyzedByFirst = analyzer.analyze.mock.calls.length;
    second.push();
    await tick();
    expect(analyzer.processAudioFrame).toHaveBeenCalledTimes(2);
    secondEnded();
    await tick();
    expect(analyzer.analyze.mock.calls.length).toBe(analyzedByFirst + 1);

    second.close();
    await secondDone;
  });
});
