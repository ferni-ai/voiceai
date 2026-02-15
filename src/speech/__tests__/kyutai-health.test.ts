/**
 * Kyutai health check unit tests.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startMockMoshiServer } from './mocks/mock-moshi-server.js';
import type { MockMoshiServerResult } from './mocks/mock-moshi-server.js';
import { checkKyutaiSidecars } from '../kyutai-health.js';

describe('kyutai-health', () => {
  let mock: MockMoshiServerResult;
  const envBackup: Record<string, string | undefined> = {};

  beforeAll(async () => {
    mock = await startMockMoshiServer({});
  });

  afterAll(async () => {
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

  it('reports healthy when both STT and TTS respond', async () => {
    setEnv('USE_KYUTAI_STT', 'true');
    setEnv('TTS_PROVIDER', 'kyutai');
    setEnv('KYUTAI_STT_URL', mock.sttUrl);
    setEnv('KYUTAI_TTS_URL', mock.ttsUrl);
    const result = await checkKyutaiSidecars();
    expect(result.useKyutaiStt).toBe(true);
    expect(result.useKyutaiTts).toBe(true);
    expect(result.stt.ok).toBe(true);
    expect(result.tts.ok).toBe(true);
    expect(result.stt.latencyMs).toBeDefined();
    expect(result.tts.latencyMs).toBeDefined();
  });

  it('reports degraded when one is down', async () => {
    setEnv('USE_KYUTAI_STT', 'true');
    setEnv('TTS_PROVIDER', 'kyutai');
    setEnv('KYUTAI_STT_URL', mock.sttUrl);
    setEnv('KYUTAI_TTS_URL', 'ws://127.0.0.1:31997/api/tts_streaming');
    const result = await checkKyutaiSidecars();
    expect(result.stt.ok).toBe(true);
    expect(result.tts.ok).toBe(false);
    expect(result.tts.error).toBeDefined();
  });

  it('respects USE_KYUTAI_STT flag (false = STT not checked, considered healthy)', async () => {
    setEnv('USE_KYUTAI_STT', 'false');
    setEnv('TTS_PROVIDER', 'kyutai');
    setEnv('KYUTAI_STT_URL', 'ws://127.0.0.1:31996/api/asr-streaming');
    setEnv('KYUTAI_TTS_URL', mock.ttsUrl);
    const result = await checkKyutaiSidecars();
    expect(result.useKyutaiStt).toBe(false);
    expect(result.useKyutaiTts).toBe(true);
    expect(result.stt.ok).toBe(true);
    expect(result.tts.ok).toBe(true);
  });

  it('respects TTS_PROVIDER flag (not kyutai = TTS not checked)', async () => {
    setEnv('USE_KYUTAI_STT', 'true');
    setEnv('TTS_PROVIDER', 'cartesia');
    setEnv('USE_KYUTAI_TTS', 'false');
    setEnv('KYUTAI_STT_URL', mock.sttUrl);
    setEnv('KYUTAI_TTS_URL', 'ws://127.0.0.1:31995/api/tts_streaming');
    const result = await checkKyutaiSidecars();
    expect(result.useKyutaiTts).toBe(false);
    expect(result.tts.ok).toBe(true);
    expect(result.stt.ok).toBe(true);
  });

  it('respects USE_KYUTAI_TTS flag (true = TTS checked)', async () => {
    setEnv('USE_KYUTAI_STT', 'false');
    setEnv('TTS_PROVIDER', 'cartesia');
    setEnv('USE_KYUTAI_TTS', 'true');
    setEnv('KYUTAI_TTS_URL', mock.ttsUrl);
    const result = await checkKyutaiSidecars();
    expect(result.useKyutaiTts).toBe(true);
    expect(result.tts.ok).toBe(true);
  });

  it('connection timeout returns ok: false with error', async () => {
    setEnv('USE_KYUTAI_STT', 'true');
    setEnv('TTS_PROVIDER', 'false');
    setEnv('KYUTAI_STT_URL', 'ws://127.0.0.1:31994/api/asr-streaming');
    const result = await checkKyutaiSidecars();
    expect(result.stt.ok).toBe(false);
    expect(result.stt.error).toBeDefined();
  });
});
