/**
 * feature-flags.ts and voice-humanization-flags.ts used to read ~80 env vars
 * that were never set in any environment (flag audit 2026-10-11), so every
 * value was its coded default. They are now constants. The snapshots were
 * recorded before the env reads were removed and pin the values every
 * environment actually ran with.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Env vars the two registries read or still read; cleared so the snapshot
// shows the defaults whatever the test runner's env holds.
const NAMES = [
  'NODE_ENV',
  'BACKCHANNELS',
  'VOICE_HUMANIZATION_DISABLED',
  'VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE',
  'USE_NATIVE_AUDIO',
  'ENABLE_EMBEDDING_WORKER',
  'USE_PRE_STT_PROCESSING',
  'DEBUG_AGENT',
  'ENABLE_MUSIC',
  'OUTREACH_TRIGGER_PROCESSING',
  'EASTER_EGGS_HOLIDAYS',
  'VOICE_HUMANIZATION_ENABLE_FFT_ANALYSIS',
  'VOICE_HUMANIZATION_ENABLE_L_L_M_BACKCHANNELS',
];

let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((n) => [n, process.env[n]]));
  for (const n of NAMES) delete process.env[n];
  vi.resetModules();
});
afterEach(() => {
  for (const n of NAMES) {
    if (saved[n] === undefined) delete process.env[n];
    else process.env[n] = saved[n];
  }
  vi.resetModules();
});

describe('feature-flags.ts resolved values', () => {
  it('match the values recorded before the env overrides were removed', async () => {
    const { reloadFeatureFlags } = await import('../feature-flags.js');
    expect(reloadFeatureFlags()).toMatchSnapshot();
  });

  it('no longer change when an old override name is set', async () => {
    const { reloadFeatureFlags } = await import('../feature-flags.js');
    const before = structuredClone(reloadFeatureFlags());
    process.env.DEBUG_AGENT = 'true';
    process.env.ENABLE_MUSIC = 'false';
    process.env.OUTREACH_TRIGGER_PROCESSING = 'true';
    process.env.EASTER_EGGS_HOLIDAYS = 'true';
    expect(reloadFeatureFlags()).toEqual(before);
  });
});

describe('voice-humanization-flags.ts resolved values', () => {
  for (const nodeEnv of ['production', 'staging', 'development']) {
    for (const backchannels of [undefined, 'on']) {
      it(`match the recorded values for NODE_ENV=${nodeEnv}, BACKCHANNELS=${backchannels}`, async () => {
        process.env.NODE_ENV = nodeEnv;
        if (backchannels) process.env.BACKCHANNELS = backchannels;
        const { getFlags, resetFlags } = await import('../voice-humanization-flags.js');
        resetFlags();
        expect(getFlags()).toMatchSnapshot();
      });
    }
  }

  it('no longer change when an old per-feature override is set', async () => {
    process.env.NODE_ENV = 'production';
    const { getFlags, resetFlags } = await import('../voice-humanization-flags.js');
    resetFlags();
    const before = getFlags();
    resetFlags();
    process.env.VOICE_HUMANIZATION_ENABLE_FFT_ANALYSIS = 'false';
    process.env.VOICE_HUMANIZATION_ENABLE_L_L_M_BACKCHANNELS = 'true';
    process.env.VOICE_HUMANIZATION_ROLLOUT_PERCENTAGE = '10';
    expect(getFlags()).toEqual(before);
  });

  it('still honours the VOICE_HUMANIZATION_DISABLED kill switch', async () => {
    process.env.NODE_ENV = 'production';
    process.env.VOICE_HUMANIZATION_DISABLED = 'true';
    const { getFlags, resetFlags } = await import('../voice-humanization-flags.js');
    resetFlags();
    const flags = getFlags();
    expect(flags.rolloutPercentage).toBe(0);
    expect(flags.enableProsodyTurnPrediction).toBe(false);
  });
});
