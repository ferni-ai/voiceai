/**
 * SPECULATIVE_TTS gates every Cartesia call the speculative engine makes: the
 * session warmup (63 phrases on dev), the per-turn pre-render and branch
 * prediction. The live reply path never reads that cache, so it is off unless
 * SPECULATIVE_TTS=on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch;

vi.mock('../../../config/voice-ids.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../config/voice-ids.js')>();
  return { ...actual, getVoiceIdForPersona: vi.fn(() => '00000000-0000-0000-0000-000000000000') };
});

import { FLAG_MANIFEST } from '../../../config/flag-manifest.js';
import {
  branchPredictTTS,
  getSpeculativeTTS,
  speculateTTS,
  warmupTTSVoice,
} from '../speculative-tts.js';

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

describe('SPECULATIVE_TTS flag', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(960)) });
    getSpeculativeTTS().clearCache();
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is an experiment that defaults off in the manifest', () => {
    expect(FLAG_MANIFEST.SPECULATIVE_TTS).toMatchObject({ default: 'off', kind: 'experiment' });
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('makes no Cartesia call by default (%s)', async (_label, value) => {
    vi.stubEnv('SPECULATIVE_TTS', value);
    await warmupTTSVoice('ferni', ['neutral', 'warm']);
    await speculateTTS('s1', 'ferni', { emotion: 'sad', intent: 'venting', distressLevel: 0.8 });
    await branchPredictTTS('s1', 'ferni', 'I hear ', ['you.', 'that.'], 'warm');
    await settle();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('warms up when on', async () => {
    vi.stubEnv('SPECULATIVE_TTS', 'on');
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
