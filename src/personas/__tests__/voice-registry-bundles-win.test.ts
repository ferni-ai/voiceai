/**
 * Bundle voices win over the hardcoded fallbacks, even after an early lookup.
 *
 * initializeVoiceRegistry() had no caller, and the first getVoiceId() registered
 * the fallbacks and set `initialized`, so a later real init returned early and
 * every voice came from FALLBACK_VOICE_IDS (config/voice-ids.ts), never the
 * persona bundles. These tests also pin where the two sources disagree, so a new
 * drift fails here instead of changing a voice silently.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { getVoiceIdForPersona } from '../../config/voice-ids.js';
import { discoverAndLoadBundles } from '../bundles/index.js';
import { getVoiceId, initializeVoiceRegistry, resetVoiceRegistry } from '../voice-registry.js';

/** Personas whose bundle voice_id differs from the fallback, as of 2026-10-18. */
const KNOWN_DRIFT: Record<string, { fallback: string; bundle: string }> = {
  'jordan-taylor': {
    fallback: 'b2d14370-c56b-4bdd-a6a3-71abe1b6e345',
    bundle: '219ccddf-e83d-491f-ae44-5f4447d5a9ca',
  },
};

async function bundleVoices(): Promise<Array<[string, string]>> {
  const { bundles } = await discoverAndLoadBundles();
  return bundles.map((b) => [b.manifest.identity.id, b.manifest.voice.voice_id]);
}

beforeEach(() => {
  // The bundles' ${env:…|default} voices and the fallbacks both read these first
  for (const id of ['JORDAN_TAYLOR_VOICE_ID', 'EVENT_PLANNER_VOICE_ID']) vi.stubEnv(id, '');
  resetVoiceRegistry();
});
afterAll(() => {
  vi.unstubAllEnvs();
  resetVoiceRegistry();
});

describe('voice registry sources', () => {
  it('reports every persona whose bundle voice differs from its fallback', async () => {
    const voices = await bundleVoices();
    expect(voices.length).toBeGreaterThan(0);
    const drift = Object.fromEntries(
      voices
        .filter(([id, voice]) => voice !== getVoiceIdForPersona(id))
        .map(([id, voice]) => [id, { fallback: getVoiceIdForPersona(id), bundle: voice }])
    );
    expect(drift).toEqual(KNOWN_DRIFT);
  });

  it('serves bundle voices once initialised, though a lookup came first', async () => {
    expect(getVoiceId('jordan-taylor')).toBe(KNOWN_DRIFT['jordan-taylor'].fallback);
    await initializeVoiceRegistry();
    for (const [id, voice] of await bundleVoices()) {
      expect(getVoiceId(id), id).toBe(voice);
    }
  });

  it('loads the bundles once for concurrent callers', async () => {
    await Promise.all([initializeVoiceRegistry(), initializeVoiceRegistry()]);
    expect(getVoiceId('jordan-taylor')).toBe(KNOWN_DRIFT['jordan-taylor'].bundle);
  });
});
