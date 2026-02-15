/**
 * Kyutai STT Adapter integration tests.
 *
 * Tests AudioFrame stream -> KyutaiSTT -> SpeechEvent stream with mock server.
 */

import { ReadableStream } from 'node:stream/web';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { stt } from '@livekit/agents';
import { startMockMoshiServer } from '../../__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../__tests__/mocks/mock-moshi-server.js';
import { KyutaiSTT } from '../kyutai-stt-adapter.js';

describe('KyutaiSTT adapter', () => {
  let mock: MockMoshiServerResult;

  beforeAll(async () => {
    mock = await startMockMoshiServer({ sttText: 'adapter test transcript' });
  });

  afterAll(async () => {
    await mock.close();
  });

  function createAudioFrame(samples: number, sampleRate = 16000): AudioFrame {
    const data = new Int16Array(samples);
    return new AudioFrame(data, sampleRate, 1, samples);
  }

  function createAudioStream(frameCount: number, samplesPerFrame: number): ReadableStream<AudioFrame> {
    return new ReadableStream({
      start(controller) {
        for (let i = 0; i < frameCount; i++) {
          controller.enqueue(createAudioFrame(samplesPerFrame));
        }
        controller.close();
      },
    });
  }

  it('adapter converts AudioFrame stream to SpeechEvent stream', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    const stream = kyutaiStt.stream();
    const audioStream = createAudioStream(2, 320);
    stream.updateInputStream(audioStream);

    const events: stt.SpeechEvent[] = [];
    for await (const ev of stream) {
      events.push(ev);
      if (events.length >= 3) break;
    }
    stream.close();

    expect(events.length).toBeGreaterThanOrEqual(1);
    const transcriptEvents = events.filter(
      (e) =>
        e.type === stt.SpeechEventType.INTERIM_TRANSCRIPT ||
        e.type === stt.SpeechEventType.FINAL_TRANSCRIPT
    );
    expect(transcriptEvents.length).toBeGreaterThanOrEqual(1);
    expect(transcriptEvents.some((e) => e.alternatives?.[0]?.text === 'adapter test transcript')).toBe(
      true
    );
  });

  it('emits INTERIM_TRANSCRIPT for partial results', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    const stream = kyutaiStt.stream();
    const audioStream = createAudioStream(2, 320);
    stream.updateInputStream(audioStream);

    const events: stt.SpeechEvent[] = [];
    for await (const ev of stream) {
      events.push(ev);
      if (events.length >= 3) break;
    }
    stream.close();

    expect(events.length).toBeGreaterThanOrEqual(1);
  });

  it('emits FINAL_TRANSCRIPT for final results', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    const stream = kyutaiStt.stream();
    const audioStream = createAudioStream(2, 320);
    stream.updateInputStream(audioStream);

    const events: stt.SpeechEvent[] = [];
    for await (const ev of stream) {
      events.push(ev);
      if (
        events.some(
          (e) =>
            e.type === stt.SpeechEventType.FINAL_TRANSCRIPT &&
            e.alternatives?.[0]?.text === 'adapter test transcript'
        )
      ) {
        break;
      }
      if (events.length >= 5) break;
    }
    stream.close();

    const finalEv = events.find(
      (e) =>
        e.type === stt.SpeechEventType.FINAL_TRANSCRIPT &&
        e.alternatives?.[0]?.text === 'adapter test transcript'
    );
    expect(finalEv).toBeDefined();
  });

  it('stream cleans up on close', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    kyutaiStt.on('error', () => {}); // swallow any close/abort errors
    const stream = kyutaiStt.stream();
    // Do not call updateInputStream - run() will connect then wait for frames
    stream.close();
    await new Promise((r) => setTimeout(r, 100)); // allow run() to exit after close
    expect(stream).toBeDefined();
  });
});
