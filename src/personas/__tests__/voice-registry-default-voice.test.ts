/**
 * The registry's two "no voice found" defaults follow FERNI_VOICE_ID, not the code constant.
 *
 * Both tails read getVoiceIdForPersona('ferni'): getVoiceId's last line, and
 * initializeFallbacks' `|| ...` for a canonical id with no fallback. No real id reaches
 * either (every canonical id has a fallback), so a phantom persona is slipped into the
 * id tables to get there. Reverting a tail to VOICE_IDS.FERNI fails here only while
 * FERNI_VOICE_ID names a third voice, which is why the id below is neither the constant
 * nor calm B (#2724).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FERNI_CALM_B_VOICE_ID, VOICE_IDS } from '../../config/voice-ids.js';
import { ALIAS_TO_CANONICAL, ALL_CANONICAL_IDS } from '../persona-ids.js';
import { getVoiceEntry, getVoiceId, resetVoiceRegistry } from '../voice-registry.js';

const THIRD_VOICE = 'third-voice-0000-0000-0000-000000000000';
const PHANTOM = 'phantom-persona';
const PHANTOM_ALIAS = 'phantom-alias';

beforeEach(() => {
  vi.stubEnv('FERNI_VOICE_ID', THIRD_VOICE);
  vi.stubEnv('JACK_B_VOICE_ID', '');
  resetVoiceRegistry();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetVoiceRegistry();
  const ids = ALL_CANONICAL_IDS as unknown as string[];
  if (ids.includes(PHANTOM)) ids.splice(ids.indexOf(PHANTOM), 1);
  delete (ALIAS_TO_CANONICAL as Record<string, string>)[PHANTOM_ALIAS];
});

describe('voice registry defaults follow FERNI_VOICE_ID', () => {
  it('uses a voice that is neither the constant nor calm B', () => {
    expect([VOICE_IDS.FERNI, FERNI_CALM_B_VOICE_ID]).not.toContain(THIRD_VOICE);
  });

  it('getVoiceId falls back to the resolver for a persona with no entry and no fallback', () => {
    (ALIAS_TO_CANONICAL as Record<string, string>)[PHANTOM_ALIAS] = PHANTOM;
    expect(getVoiceId(PHANTOM_ALIAS)).toBe(THIRD_VOICE);
  });

  it('initializeFallbacks gives a canonical id with no fallback the resolver voice', () => {
    (ALL_CANONICAL_IDS as unknown as string[]).push(PHANTOM);
    getVoiceId('ferni'); // first lookup registers the fallbacks
    expect(getVoiceEntry(PHANTOM)?.voiceId).toBe(THIRD_VOICE);
  });
});
