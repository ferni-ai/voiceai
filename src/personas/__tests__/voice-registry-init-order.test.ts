/**
 * Bundle voices win over the hardcoded fallbacks, even after an early lookup.
 *
 * initializeVoiceRegistry() had no caller, and the first getVoiceId() registered
 * the fallbacks and set `initialized`, so a later real init returned early and
 * every voice came from the fallbacks, never the persona bundles. The bundle
 * loader is stubbed with a voice no fallback uses, so the test can tell the two
 * sources apart (in the repo they now agree: voice-registry-bundles-win.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BUNDLE_VOICE = 'bundle-only-voice-0000-0000-000000000000';
const discoverAndLoadBundles = vi.hoisted(() =>
  vi.fn(async () => ({
    personas: [],
    errors: [],
    bundles: [
      {
        manifest: {
          identity: { id: 'jordan-taylor', name: 'Jordan' },
          voice: { voice_id: BUNDLE_VOICE, provider: 'cartesia' },
        },
      },
    ],
  }))
);
vi.mock('../bundles/index.js', () => ({ discoverAndLoadBundles }));

import { getVoiceId, initializeVoiceRegistry, resetVoiceRegistry } from '../voice-registry.js';

beforeEach(() => {
  resetVoiceRegistry();
  discoverAndLoadBundles.mockClear();
});

describe('voice registry initialisation order', () => {
  it('serves the bundle voice once initialised, though a lookup came first', async () => {
    expect(getVoiceId('jordan-taylor')).not.toBe(BUNDLE_VOICE); // the fallback
    await initializeVoiceRegistry();
    expect(getVoiceId('jordan-taylor')).toBe(BUNDLE_VOICE);
  });

  it('loads the bundles once for concurrent callers', async () => {
    await Promise.all([initializeVoiceRegistry(), initializeVoiceRegistry()]);
    await initializeVoiceRegistry();
    expect(discoverAndLoadBundles).toHaveBeenCalledTimes(1);
    expect(getVoiceId('jordan-taylor')).toBe(BUNDLE_VOICE);
  });
});
