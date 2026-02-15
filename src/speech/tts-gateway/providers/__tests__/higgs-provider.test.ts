import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getTTSProvider, resetHiggsPipelineProvider } from '../index.js';
import { HiggsPipelineProvider } from '../higgs-pipeline.js';
import { resetCartesiaProvider } from '../cartesia.js';

const originalEnv = { ...process.env };

beforeEach(() => {
  resetHiggsPipelineProvider();
  resetCartesiaProvider();
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('Higgs TTS Provider', () => {
  it('TTS_PROVIDER=higgs selects HiggsPipelineProvider', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const provider = getTTSProvider();
    expect(provider).toBeInstanceOf(HiggsPipelineProvider);
  });

  it('TTS_PROVIDER=higgs-pipeline selects HiggsPipelineProvider', () => {
    process.env.TTS_PROVIDER = 'higgs-pipeline';
    const provider = getTTSProvider();
    expect(provider).toBeInstanceOf(HiggsPipelineProvider);
  });

  it('falls back to non-Higgs when TTS_PROVIDER is not set', () => {
    delete process.env.TTS_PROVIDER;
    delete process.env.USE_BTCW_TTS;

    const provider = getTTSProvider();
    expect(provider).not.toBeInstanceOf(HiggsPipelineProvider);
  });

  it('returns singleton instance on repeated calls', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const first = getTTSProvider();
    const second = getTTSProvider();
    expect(first).toBe(second);
  });

  it('resetHiggsPipelineProvider clears singleton', () => {
    process.env.TTS_PROVIDER = 'higgs';
    const first = getTTSProvider();
    resetHiggsPipelineProvider();
    const second = getTTSProvider();
    expect(first).not.toBe(second);
  });
});
