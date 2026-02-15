/**
 * Kyutai DSM E2E pipeline test.
 *
 * Full pipeline using mock moshi-server:
 * 1. Start mock (STT + TTS)
 * 2. Feed sample audio into Kyutai STT -> verify transcript
 * 3. Feed transcript into Kyutai TTS -> verify audio output
 * 4. Round-trip: audio in -> transcript -> audio out
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AudioFrame } from '@livekit/rtc-node';
import { stt } from '@livekit/agents';
import { startMockMoshiServer } from '../../speech/__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../speech/__tests__/mocks/mock-moshi-server.js';
import { KyutaiSTT } from '../../speech/providers/kyutai-stt-adapter.js';
import { KyutaiTTSProvider } from '../../speech/tts-gateway/providers/kyutai-tts.js';

describe('Kyutai DSM E2E pipeline', () => {
  let mock: MockMoshiServerResult;

  beforeAll(async () => {
    mock = await startMockMoshiServer({
      sttText: 'Hello from Kyutai E2E',
      ttsChunkSamples: 240,
      ttsSampleRate: 24000,
    });
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

  it('feeds sample audio into STT and verifies transcript', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    const stream = kyutaiStt.stream();
    const audioStream = createAudioStream(2, 320);
    stream.updateInputStream(audioStream);

    let transcript = '';
    for await (const ev of stream) {
      if (
        ev.type === stt.SpeechEventType.FINAL_TRANSCRIPT &&
        ev.alternatives?.[0]?.text
      ) {
        transcript = ev.alternatives[0].text;
        break;
      }
      if (ev.type === stt.SpeechEventType.INTERIM_TRANSCRIPT && ev.alternatives?.[0]?.text) {
        transcript = ev.alternatives[0].text;
      }
    }
    stream.close();

    expect(transcript).toBe('Hello from Kyutai E2E');
  });

  it('feeds transcript text into Kyutai TTS and verifies audio output', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize('Hello from Kyutai E2E', 'ferni');
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThanOrEqual(5 * 240 * 2);
  });

  it('round-trip: audio in -> STT transcript -> TTS audio out', async () => {
    const kyutaiStt = new KyutaiSTT({ sttUrl: mock.sttUrl });
    const stream = kyutaiStt.stream();
    const audioStream = createAudioStream(2, 320);
    stream.updateInputStream(audioStream);

    let transcript = '';
    for await (const ev of stream) {
      if (
        ev.type === stt.SpeechEventType.FINAL_TRANSCRIPT &&
        ev.alternatives?.[0]?.text
      ) {
        transcript = ev.alternatives[0].text;
        break;
      }
    }
    stream.close();

    expect(transcript).toBe('Hello from Kyutai E2E');

    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize(transcript, 'ferni');
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
