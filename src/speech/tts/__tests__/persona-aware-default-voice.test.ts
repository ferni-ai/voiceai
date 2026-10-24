/**
 * PersonaAwareTTS with no voice in its config speaks in Ferni's resolved voice.
 *
 * The empty-config fallback reads getVoiceIdForPersona('ferni'), so FERNI_VOICE_ID wins.
 * Reverting it to DEFAULT_VOICE_IDS.FERNI fails here only while FERNI_VOICE_ID names a
 * third voice, hence an id that is neither the constant nor calm B (#2724).
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FERNI_CALM_B_VOICE_ID, VOICE_IDS } from '../../../config/voice-ids.js';

const THIRD_VOICE = 'third-voice-0000-0000-0000-000000000000';

// The Cartesia plugin reads the key when the module loads, so set it first.
let PersonaAwareTTS: typeof import('../persona-aware.js').PersonaAwareTTS;
beforeAll(async () => {
  process.env.CARTESIA_API_KEY = process.env.CARTESIA_API_KEY || 'test-key';
  ({ PersonaAwareTTS } = await import('../persona-aware.js'));
});

afterEach(() => vi.unstubAllEnvs());

describe('PersonaAwareTTS default voice', () => {
  it('follows FERNI_VOICE_ID when the config names no voice', () => {
    expect([VOICE_IDS.FERNI, FERNI_CALM_B_VOICE_ID]).not.toContain(THIRD_VOICE);
    vi.stubEnv('FERNI_VOICE_ID', THIRD_VOICE);
    expect(new PersonaAwareTTS('Ferni', { voiceId: '' } as never).getVoiceId()).toBe(THIRD_VOICE);
  });

  it('keeps a voice the config does name', () => {
    vi.stubEnv('FERNI_VOICE_ID', THIRD_VOICE);
    expect(new PersonaAwareTTS('Peter', { voiceId: 'voice-a' } as never).getVoiceId()).toBe(
      'voice-a'
    );
  });
});
