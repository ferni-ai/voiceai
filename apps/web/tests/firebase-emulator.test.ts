/**
 * Local signed-in testing runs against the Firebase emulators. That mode must
 * only turn on when explicitly requested in dev, must point at a demo-*
 * project (which Firebase keeps emulator-only), and is the only mode that
 * offers the seeded test-user sign-in.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

async function loadConfig() {
  vi.resetModules();
  return import('../src/config/firebase.js');
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Firebase emulator mode', () => {
  it('stays off unless VITE_USE_FIREBASE_EMULATORS is "true"', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', '');
    const { useFirebaseEmulators, firebaseConfig } = await loadConfig();
    expect(useFirebaseEmulators).toBe(false);
    expect(firebaseConfig.projectId).not.toBe('demo-ferni');
  });

  it('uses the emulator-only demo project when on in dev', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    const { useFirebaseEmulators, firebaseConfig } = await loadConfig();
    expect(useFirebaseEmulators).toBe(true);
    expect(firebaseConfig.projectId).toMatch(/^demo-/);
  });

  it('never turns on outside dev builds', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.stubEnv('DEV', false);
    const { useFirebaseEmulators } = await loadConfig();
    expect(useFirebaseEmulators).toBe(false);
  });
});

describe('emulator test-user sign-in', () => {
  it('adds no buttons when emulators are off', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', '');
    vi.resetModules();
    const { emulatorSignInButtons } = await import('../src/ui/emulator-sign-in.js');
    expect(emulatorSignInButtons(() => {})).toEqual([]);
  });

  it('offers one test-user button when emulators are on', async () => {
    vi.stubEnv('VITE_USE_FIREBASE_EMULATORS', 'true');
    vi.resetModules();
    const { emulatorSignInButtons } = await import('../src/ui/emulator-sign-in.js');
    const buttons = emulatorSignInButtons(() => {});
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.dataset.provider).toBe('emulator');
  });
});
