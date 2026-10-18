/**
 * "Connected" means Google tokens or a provider record (#1547). Google sign-in
 * writes tokens only, so a Google user with no provider record must count.
 */
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ google: false, provider: false }));

vi.mock('../../identity/google-calendar-oauth.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  isCalendarConfigured: vi.fn(async () => state.google),
}));
vi.mock('../unified-calendar-store.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  hasAnyProviderConnected: vi.fn(async () => state.provider),
}));

import { isConnected } from '../calendar-service.js';

describe('isConnected', () => {
  it('counts a Google user with tokens and no provider record as connected', async () => {
    state.google = true;
    state.provider = false;
    expect(await isConnected('user-1')).toBe(true);
  });

  it('counts an Outlook or Apple provider record as connected', async () => {
    state.google = false;
    state.provider = true;
    expect(await isConnected('user-1')).toBe(true);
  });

  it('is false with neither', async () => {
    state.google = false;
    state.provider = false;
    expect(await isConnected('user-1')).toBe(false);
  });
});
