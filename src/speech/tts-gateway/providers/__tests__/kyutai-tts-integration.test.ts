/**
 * Kyutai TTS provider integration tests.
 *
 * Uses mock moshi-server to test full path: getTTSProvider(), synthesize(), voice mapping.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockMoshiServer } from '../../../__tests__/mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from '../../../__tests__/mocks/mock-moshi-server.js';
import { getTTSProvider, resetKyutaiProvider } from '../index.js';

describe('Kyutai TTS integration', () => {
  let mock: MockMoshiServerResult;
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    mock = await startMockMoshiServer({
      ttsChunkSamples: 240,
      ttsSampleRate: 24000,
    });
    setEnv('TTS_PROVIDER', 'kyutai');
    setEnv('KYUTAI_TTS_URL', mock.ttsUrl);
  });

  afterAll(async () => {
    resetKyutaiProvider();
    await mock.close();
    Object.keys(envBackup).forEach((k) => {
      if (envBackup[k] !== undefined) process.env[k] = envBackup[k];
      else delete process.env[k];
    });
  });

  function setEnv(key: string, value: string | undefined) {
    if (!(key in envBackup)) envBackup[key] = process.env[key];
    if (value !== undefined) process.env[key] = value;
    else delete process.env[key];
  }

  it('getTTSProvider() returns KyutaiTTSProvider when TTS_PROVIDER=kyutai', () => {
    const provider = getTTSProvider();
    expect(provider.name).toBe('kyutai');
  });

  it('synthesize("Hello world", "ferni") sends request and receives PCM audio', async () => {
    const provider = getTTSProvider();
    const buf = await provider.synthesize('Hello world', 'ferni');
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(buf.byteLength).toBeGreaterThanOrEqual(5 * 240 * 2);
  });

  it('per-persona voice mapping works end-to-end', async () => {
    const provider = getTTSProvider();
    const personas = ['ferni', 'maya', 'alex', 'jordan'] as const;
    for (const persona of personas) {
      const buf = await provider.synthesize('Hi', persona);
      expect(buf.byteLength).toBeGreaterThan(0);
    }
  });

  it('fallback to default voice when persona not in map', async () => {
    const provider = getTTSProvider();
    const buf = await provider.synthesize('Test', 'unknown-persona');
    expect(buf).toBeInstanceOf(ArrayBuffer);
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
