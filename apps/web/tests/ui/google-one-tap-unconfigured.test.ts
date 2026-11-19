/**
 * A build without VITE_GOOGLE_CLIENT_ID has no One-Tap, quietly: it warned
 * "Google One-Tap not configured" on every load (app audit 2026-11-16, item 20).
 */

import { describe, expect, it, vi } from 'vitest';

const warn = vi.fn();
const initialize = vi.fn();

vi.mock('../../src/utils/logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }),
}));
vi.mock('../../src/services/firebase-auth.service.js', () => ({
  getAuthState: vi.fn(),
  onAuthStateChange: vi.fn(() => () => undefined),
  signInWithGoogleCredential: vi.fn(),
  linkWithGoogleCredential: vi.fn(),
}));

describe('Google One-Tap without a client id', () => {
  it('stays off without a warning', async () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');
    Object.assign(window, { google: { accounts: { id: { initialize } } } });
    const { initGoogleOneTap } = await import('../../src/services/google-one-tap.service.js');

    initGoogleOneTap();

    expect(initialize).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
