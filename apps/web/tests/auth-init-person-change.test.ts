/**
 * A page belongs to the person it was built for. When another tab signs that
 * person out, or in as someone else, this page must rebuild (forget and reload)
 * instead of showing their data under the new session. Signing in from the gate
 * and a token refresh for the same person must never reload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Auth = { uid: string | null; isAuthenticated: boolean; isLinked: boolean };
const as = (uid: string | null): Auth => ({ uid, isAuthenticated: uid !== null, isLinked: false });

let bootState: Auth = as(null);
let changeAuth: (state: Auth) => void = () => {};
vi.mock('../src/services/firebase-auth.service.js', () => ({
  initAuth: vi.fn(async () => bootState),
  getAuthState: vi.fn(() => bootState),
  getAuthToken: vi.fn(async () => null),
  onAuthStateChange: vi.fn((callback: (state: Auth) => void) => {
    changeAuth = callback;
    callback(bootState);
    return () => {};
  }),
}));
vi.mock('../src/services/api-auth-fetch.js', () => ({ installApiAuthFetch: vi.fn() }));
vi.mock('../src/state/app.state.js', () => ({ getDeviceId: () => 'device-1', updateAuthState: vi.fn() }));
const forgetThisPersonAndReload = vi.fn(async () => {});
vi.mock('../src/services/forget-this-person.js', () => ({ forgetThisPersonAndReload }));

async function bootPageAs(uid: string | null): Promise<void> {
  bootState = as(uid);
  vi.resetModules();
  const { initializeAuth } = await import('../src/services/auth-init.service.js');
  await initializeAuth();
}

beforeEach(() => forgetThisPersonAndReload.mockClear());

describe('an open page when the signed-in person changes', () => {
  it('rebuilds when another tab signs the person out', async () => {
    await bootPageAs('uid-sam-rivera-a');
    changeAuth(as(null));
    expect(forgetThisPersonAndReload).toHaveBeenCalledOnce();
  });

  it('rebuilds when the session becomes someone else', async () => {
    await bootPageAs('uid-sam-rivera-a');
    changeAuth(as('uid-sam-rivera-b'));
    expect(forgetThisPersonAndReload).toHaveBeenCalledOnce();
  });

  it('a token refresh for the same person never rebuilds', async () => {
    await bootPageAs('uid-sam-rivera-a');
    changeAuth(as('uid-sam-rivera-a'));
    changeAuth(as('uid-sam-rivera-a'));
    expect(forgetThisPersonAndReload).not.toHaveBeenCalled();
  });

  it('signing in from the gate does not rebuild; that person signing out later does', async () => {
    await bootPageAs(null);
    changeAuth(as('uid-sam-rivera-a'));
    changeAuth(as('uid-sam-rivera-a'));
    expect(forgetThisPersonAndReload).not.toHaveBeenCalled();
    changeAuth(as(null));
    expect(forgetThisPersonAndReload).toHaveBeenCalledOnce();
  });
});
