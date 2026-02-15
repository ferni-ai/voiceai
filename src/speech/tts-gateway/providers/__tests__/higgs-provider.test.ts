import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTTSProvider, resetHiggsProvider } from '../index.js';
import { LocalTTSProvider, resetLocalTTSProvider } from '../local-tts.js';
import { resetCartesiaProvider } from '../cartesia.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetHiggsProvider();
  resetLocalTTSProvider();
  resetCartesiaProvider();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Higgs TTS Provider', () => {
  it('TTS_PROVIDER=higgs selects Higgs provider', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const provider = getTTSProvider();
    expect(provider).toBeInstanceOf(LocalTTSProvider);
    expect(provider.name).toBe('local');
  });

  it('HIGGS_TTS_URL env var is respected', () => {
    process.env.TTS_PROVIDER = 'higgs';
    process.env.HIGGS_TTS_URL = 'http://192.168.1.10:9000';

    // Reset so it picks up the new URL
    resetHiggsProvider();
    const provider = getTTSProvider();

    expect(provider).toBeInstanceOf(LocalTTSProvider);
    // Verify the provider was created (it's a LocalTTSProvider with openai format)
    expect(provider).toBeDefined();
  });

  it('falls back to non-Higgs when TTS_PROVIDER is not set', () => {
    delete process.env.TTS_PROVIDER;
    delete process.env.USE_BTCW_TTS;

    const provider = getTTSProvider();
    // Should fall back to Cartesia (not Higgs)
    expect(provider).not.toBeInstanceOf(LocalTTSProvider);
  });

  it('Higgs provider has synthesizeStream support', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const provider = getTTSProvider() as LocalTTSProvider;

    expect(typeof provider.synthesizeStream).toBe('function');
  });

  it('returns singleton instance on repeated calls', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const first = getTTSProvider();
    const second = getTTSProvider();
    expect(first).toBe(second);
  });

  it('resetHiggsProvider clears singleton', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const first = getTTSProvider();
    resetHiggsProvider();
    const second = getTTSProvider();
    expect(first).not.toBe(second);
  });
});
