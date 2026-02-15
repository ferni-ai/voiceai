/**
 * Kyutai TTS Provider unit tests.
 *
 * Uses mock moshi-server for TTS WebSocket protocol.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockMoshiServer } from '../../../__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../../__tests__/mocks/mock-moshi-server.js';
import { KyutaiTTSProvider, resetKyutaiProvider } from '../kyutai-tts.js';

describe('KyutaiTTSProvider', () => {
  let mock: MockMoshiServerResult;

  beforeAll(async () => {
    mock = await startMockMoshiServer({
      ttsChunkSamples: 240,
      ttsSampleRate: 24000,
    });
  });

  afterAll(async () => {
    resetKyutaiProvider();
    await mock.close();
  });

  it('synthesize() connects, sends text, receives audio buffer', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize('Hello world', 'ferni');
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it('returns correct PCM format (24kHz Int16, 5 chunks of 240 samples)', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize('test', 'ferni');
    // Mock sends 5 binary chunks of 240 samples * 2 bytes = 2400 bytes (plus optional JSON)
    expect(buf.byteLength).toBeGreaterThanOrEqual(5 * 240 * 2);
  });

  it('voice ID mapping: persona "ferni" resolves to safetensors path', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize('Hi', 'ferni');
    expect(buf.byteLength).toBeGreaterThan(0);
    // Indirect: known persona works; path is ferni/ferni-voice.safetensors internally
  });

  it('empty text returns empty buffer', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const buf = await provider.synthesize('   ', 'ferni');
    expect(buf.byteLength).toBe(0);
  });

  it('handles timeout when server never responds', async () => {
    const silentMock = await startMockMoshiServer({ ttsSilent: true });
    const provider = new KyutaiTTSProvider({
      ttsUrl: silentMock.ttsUrl,
      timeoutMs: 300,
    });
    const buf = await provider.synthesize('hello', 'ferni');
    await silentMock.close();
    // Default (throwOnError: false) returns whatever chunks we have (empty)
    expect(buf.byteLength).toBe(0);
  });

  it('handles timeout with throwOnError rejects', async () => {
    const silentMock = await startMockMoshiServer({ ttsSilent: true });
    const provider = new KyutaiTTSProvider({
      ttsUrl: silentMock.ttsUrl,
      timeoutMs: 200,
      throwOnError: true,
    });
    await expect(provider.synthesize('hello', 'ferni')).rejects.toThrow(/timeout/);
    await silentMock.close();
  });

  it('isAvailable() returns true when server is up', async () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const ok = await provider.isAvailable();
    expect(ok).toBe(true);
  });

  it('isAvailable() returns false when server is down', async () => {
    const provider = new KyutaiTTSProvider({
      ttsUrl: 'ws://127.0.0.1:31998/api/tts_streaming',
    });
    const ok = await provider.isAvailable();
    expect(ok).toBe(false);
  });

  it('estimateDuration returns positive ms for non-empty text', () => {
    const provider = new KyutaiTTSProvider({ ttsUrl: mock.ttsUrl });
    const ms = provider.estimateDuration('Hello world');
    expect(ms).toBeGreaterThan(0);
  });
});
