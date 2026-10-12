/**
 * SPECULATIVE_TTS=off stops every Cartesia call the speculative engine makes:
 * the session warmup (63 phrases on dev), the per-turn pre-render and branch
 * prediction. The live reply path never reads that cache.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../config/voice-ids.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/voice-ids.js')>();
  return { ...actual, getVoiceIdForPersona: vi.fn(() => '00000000-0000-0000-0000-000000000000') };
});

import {
  branchPredictTTS,
  getSpeculativeTTS,
  speculateTTS,
  warmupTTSVoice,
} from '../speculative-tts.js';

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('SPECULATIVE_TTS kill switch', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(960)) });
    getSpeculativeTTS().clearCache();
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('warms up by default (the switch defaults on)', async () => {
    vi.stubEnv('SPECULATIVE_TTS', '');
    await warmupTTSVoice('ferni', ['neutral']);
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
  });

  it('makes no Cartesia call for the warmup when off', async () => {
    vi.stubEnv('SPECULATIVE_TTS', 'off');
    await warmupTTSVoice('ferni', ['neutral', 'warm', 'concerned']);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('makes no Cartesia call for a turn pre-render or branch prediction when off', async () => {
    vi.stubEnv('SPECULATIVE_TTS', 'off');
    await speculateTTS('s1', 'ferni', { emotion: 'sad', intent: 'venting', distressLevel: 0.8 });
    await branchPredictTTS('s1', 'ferni', 'I hear ', ['you.', 'that.'], 'warm');
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('pre-renders a turn when on', async () => {
    vi.stubEnv('SPECULATIVE_TTS', 'on');
    await speculateTTS('s1', 'ferni', { emotion: 'sad', intent: 'venting', distressLevel: 0.8 });
    await branchPredictTTS('s1', 'ferni', 'I hear ', ['you.', 'that.'], 'warm');
    await settle();
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
  });
});
