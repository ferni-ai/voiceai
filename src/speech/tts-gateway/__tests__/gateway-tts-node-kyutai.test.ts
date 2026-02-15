/**
 * Gateway TTS Node – Kyutai provider path.
 *
 * Tests gateway with real getTTSProvider() returning KyutaiTTSProvider
 * against mock moshi-server: synthesis, SSML stripping, cache, metrics.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadableStream } from 'node:stream/web';
import {
  createGatewayTTSNode,
  getGatewayTTSMetrics,
  resetGatewayTTSMetrics,
} from '../gateway-tts-node.js';
import { createTTSCache, setTTSCache } from '../../../services/tts/tts-cache.js';
import { startMockMoshiServer } from '../../__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../__tests__/mocks/mock-moshi-server.js';
import { resetKyutaiProvider } from '../providers/index.js';

// Mock AudioFrame so we don't need real LiveKit
vi.mock('@livekit/rtc-node', () => ({
  AudioFrame: class MockAudioFrame {
    data: Int16Array;
    sampleRate: number;
    channels: number;
    samplesPerChannel: number;

    constructor(
      data: Int16Array,
      sampleRate: number,
      channels: number,
      samplesPerChannel: number
    ) {
      this.data = data;
      this.sampleRate = sampleRate;
      this.channels = channels;
      this.samplesPerChannel = samplesPerChannel;
    }
  },
}));

function createTextStream(text: string): ReadableStream<string> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(text);
      controller.close();
    },
  });
}

async function collectFrames(stream: ReadableStream<unknown> | null): Promise<unknown[]> {
  if (!stream) return [];
  const frames: unknown[] = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) frames.push(value);
  }
  return frames;
}

describe('Gateway TTS Node – Kyutai provider path', () => {
  let mock: MockMoshiServerResult;
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    mock = await startMockMoshiServer({
      ttsChunkSamples: 240,
      ttsSampleRate: 24000,
    });
    setEnv('TTS_PROVIDER', 'kyutai');
    setEnv('KYUTAI_TTS_URL', mock.ttsUrl);
    resetKyutaiProvider(); // ensure singleton uses mock URL
  });

  afterAll(async () => {
    resetKyutaiProvider();
    await mock.close();
    Object.keys(envBackup).forEach((k) => {
      if (envBackup[k] !== undefined) process.env[k] = envBackup[k];
      else delete process.env[k];
    });
  });

  beforeEach(() => {
    resetGatewayTTSMetrics();
    const cache = createTTSCache({ maxEntries: 100 });
    setTTSCache(cache);
  });

  function setEnv(key: string, value: string | undefined) {
    if (!(key in envBackup)) envBackup[key] = process.env[key];
    if (value !== undefined) process.env[key] = value;
    else delete process.env[key];
  }

  it('gateway with Kyutai provider synthesizes correctly', async () => {
    const gatewayTTS = createGatewayTTSNode({
      voiceId: 'ferni',
      sessionId: 'kyutai-session',
    });

    const textStream = createTextStream('Hello world');
    const audioStream = await gatewayTTS(textStream);

    expect(audioStream).not.toBeNull();
    const frames = await collectFrames(audioStream!);
    expect(frames.length).toBeGreaterThan(0);
  });

  it('SSML stripping still works before Kyutai synthesis', async () => {
    const gatewayTTS = createGatewayTTSNode({
      voiceId: 'ferni',
      sessionId: 'kyutai-ssml',
    });

    const textStream = createTextStream('<break time="200ms"/>Hello world<speed ratio="0.9"/>');
    const audioStream = await gatewayTTS(textStream);

    expect(audioStream).not.toBeNull();
    const frames = await collectFrames(audioStream!);
    expect(frames.length).toBeGreaterThan(0);
    // SSML is stripped by gateway before provider; we get audio
  });

  it('cache hit path works with Kyutai', async () => {
    const gatewayTTS = createGatewayTTSNode({
      voiceId: 'ferni',
      sessionId: 'kyutai-cache',
      enableCache: true,
    });

    const text1 = createTextStream('Cache test');
    await gatewayTTS(text1);

    const text2 = createTextStream('Cache test');
    await gatewayTTS(text2);

    const metrics = getGatewayTTSMetrics();
    expect(metrics.totalRequests).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.cacheHits).toBe(1);
  });

  it('metrics track Kyutai usage', async () => {
    const gatewayTTS = createGatewayTTSNode({
      voiceId: 'ferni',
      sessionId: 'kyutai-metrics',
    });

    const textStream = createTextStream('Metrics test');
    await gatewayTTS(textStream);

    const metrics = getGatewayTTSMetrics();
    expect(metrics.totalRequests).toBe(1);
    expect(metrics.gatewaySyntheses).toBe(1);
    expect(metrics.cacheMisses).toBe(1);
  });
});
