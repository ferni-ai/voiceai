/**
 * Signing in on a browser that still holds a legacy `device:` user id boots
 * without asking the server to move that device's data (the migrate endpoint
 * is retired and answers 410).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authState = { uid: 'uid-sam-rivera-0000000000000', isLinked: true };

vi.mock('../firebase-auth.service.js', () => ({
  initAuth: vi.fn(() => Promise.resolve(authState)),
  getAuthState: vi.fn(() => authState),
  getAuthToken: vi.fn(() => Promise.resolve('test-id-token')),
  onAuthStateChange: vi.fn(),
}));
vi.mock('../api-auth-fetch.js', () => ({ installApiAuthFetch: vi.fn() }));
vi.mock('../forget-this-person.js', () => ({ forgetThisPersonAndReload: vi.fn() }));
vi.mock('../../state/app.state.js', () => ({
  updateAuthState: vi.fn(),
  getDeviceId: vi.fn(() => 'device_test_001'),
}));

describe('initializeAuth', () => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 200 })));

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    localStorage.setItem('ferni_user_id', 'device:device_test_001');
    localStorage.removeItem('ferni_migrated_uid');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('signs in a legacy device user without calling the migrate endpoint', async () => {
    vi.resetModules();
    const { initializeAuth, isAuthInitialized } = await import('../auth-init.service.js');
    const state = await initializeAuth();
    await new Promise((r) => setTimeout(r, 0));

    expect(state.uid).toBe(authState.uid);
    expect(isAuthInitialized()).toBe(true);
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(urls.filter((u) => u.includes('/api/auth/migrate'))).toEqual([]);
  });
});
