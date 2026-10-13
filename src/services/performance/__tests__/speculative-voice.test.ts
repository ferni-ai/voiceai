/**
 * Speculative TTS voice resolution.
 *
 * Cartesia rejects any voice id that is not a UUID (HTTP 400 "voice ID must be
 * a valid UUID"). The engine used to treat any id containing '-' as a UUID, so
 * hyphenated persona ids ('peter-john', 'maya-santos') were sent verbatim. These
 * tests use the real voice-ids config, unlike speculative-tts.test.ts.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VOICE_IDS, isValidVoiceId } from '../../../config/voice-ids.js';
import { getSpeculativeTTS, speculateTTS, warmupTTSVoice } from '../speculative-tts.js';

const mockFetch = vi.fn();

/** Voice ids sent to Cartesia, one per request. */
function sentVoiceIds(): string[] {
  return mockFetch.mock.calls.map(([, init]) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { voice: { id: string } };
    return body.voice.id;
  });
}

const PERSONA_ENV_OVERRIDES = [
  'FERNI_VOICE_ID',
  'JACK_B_VOICE_ID',
  'PETER_JOHN_VOICE_ID',
  'JACK_BOGLE_VOICE_ID',
  'MAYA_SANTOS_VOICE_ID',
  'SPEND_SAVE_VOICE_ID',
];

describe('speculative TTS voice resolution', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(960)),
    });
    vi.stubGlobal('fetch', mockFetch);
    vi.stubEnv('CARTESIA_API_KEY', 'test-api-key');
    // These cover the engine when enabled; the flag defaults off.
    vi.stubEnv('SPECULATIVE_TTS', 'on');
    // Empty overrides fall through to the VOICE_IDS defaults.
    for (const name of PERSONA_ENV_OVERRIDES) vi.stubEnv(name, '');
    getSpeculativeTTS().clearCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the persona UUID, not the hyphenated persona id', async () => {
    await speculateTTS('session-pj', 'peter-john', { emotion: 'sad', intent: 'venting' });

    const ids = sentVoiceIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids)).toEqual(new Set([VOICE_IDS.PETER_JOHN]));
  });

  it('resolves every hyphenated persona to a valid UUID on warmup', async () => {
    await warmupTTSVoice('maya-santos', ['neutral']);

    const ids = sentVoiceIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === VOICE_IDS.MAYA_SANTOS)).toBe(true);
  });

  it('passes an already-resolved UUID through unchanged', async () => {
    await warmupTTSVoice(VOICE_IDS.JOHN_BOGLE, ['neutral']);

    const ids = sentVoiceIds();
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id === VOICE_IDS.JOHN_BOGLE)).toBe(true);
  });

  it('skips speculation without a request when no valid UUID is available', async () => {
    vi.stubEnv('FERNI_VOICE_ID', 'ferni-voice');
    expect(isValidVoiceId('ferni-voice')).toBe(false);

    await speculateTTS('session-bad', 'ferni', { emotion: 'sad', intent: 'venting' });
    await warmupTTSVoice('ferni', ['neutral']);

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
