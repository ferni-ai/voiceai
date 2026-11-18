/**
 * The admin portal opens only for an admin. A signed-out visitor, or an account without
 * the `admin` claim, is told why and offered a sign-in instead of seeing every section
 * report the backend as down.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AccessDeps } from '../../src/admin/admin-access.js';
import type { AuthState } from '../../src/services/firebase-auth.service.js';

const initAdminPortal = vi.fn(async () => {});
vi.mock('../../src/admin/AdminPortal.js', () => ({ initAdminPortal }));

/** A token with this payload; the header and signature are never read. */
function tokenWith(claims: Record<string, unknown>): string {
  const payload = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${payload}.signature`;
}

function authState(over: Partial<AuthState>): AuthState {
  return {
    isConfigured: true,
    isAuthenticated: true,
    isLinked: true,
    uid: 'uid-1',
    email: 'pat@example.com',
    displayName: null,
    photoURL: null,
    linkedProviders: ['google.com'],
    ...over,
  };
}

function deps(state: Partial<AuthState>, token: string | null, devBuild = false): AccessDeps {
  return { devBuild, initAuth: async () => authState(state), getAuthToken: async () => token };
}

describe('admin access', () => {
  beforeEach(() => {
    initAdminPortal.mockClear();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('lets an account with the admin claim in', async () => {
    const { checkAdminAccess } = await import('../../src/admin/admin-access.js');
    expect(await checkAdminAccess(deps({}, tokenWith({ admin: true })))).toEqual({ kind: 'admin' });
  });

  it('turns away a signed-in account without the admin claim, naming it', async () => {
    const { checkAdminAccess } = await import('../../src/admin/admin-access.js');
    expect(await checkAdminAccess(deps({}, tokenWith({ admin: 'yes' })))).toEqual({
      kind: 'not-admin',
      email: 'pat@example.com',
    });
  });

  it('asks an anonymous or signed-out visitor to sign in', async () => {
    const { checkAdminAccess } = await import('../../src/admin/admin-access.js');
    expect(await checkAdminAccess(deps({ isLinked: false }, tokenWith({ admin: true })))).toEqual({
      kind: 'signed-out',
    });
  });

  it('says sign-in is unavailable when the page has no sign-in settings', async () => {
    const { checkAdminAccess } = await import('../../src/admin/admin-access.js');
    expect(await checkAdminAccess(deps({ isConfigured: false, isLinked: false }, null))).toEqual({
      kind: 'no-sign-in',
    });
  });

  it('treats an unreadable token as no admin claim', async () => {
    const { checkAdminAccess, tokenClaims } = await import('../../src/admin/admin-access.js');
    expect(tokenClaims('not-a-token')).toEqual({});
    expect((await checkAdminAccess(deps({}, 'a.%%%.b'))).kind).toBe('not-admin');
  });

  it('lets a local vite dev build in without signing in', async () => {
    const { checkAdminAccess } = await import('../../src/admin/admin-access.js');
    expect(await checkAdminAccess(deps({ isLinked: false }, null, true))).toEqual({
      kind: 'admin',
    });
  });

  it('opens the portal for an admin', async () => {
    const { openAdminPortal } = await import('../../src/admin/admin-access.js');
    await openAdminPortal(deps({}, tokenWith({ admin: true })));
    expect(initAdminPortal).toHaveBeenCalledOnce();
    expect(document.querySelector('.admin-access-gate')).toBeNull();
  });

  it('shows the gate with a sign-in button, and never loads the portal, for a non-admin', async () => {
    const { openAdminPortal } = await import('../../src/admin/admin-access.js');
    await openAdminPortal(deps({ email: '<b>pat</b>@example.com' }, tokenWith({})));
    expect(initAdminPortal).not.toHaveBeenCalled();
    const gate = document.querySelector('.admin-access-gate');
    expect(gate?.textContent).toContain('This account is not an admin');
    expect(gate?.textContent).toContain('<b>pat</b>@example.com');
    expect(gate?.querySelector('b')).toBeNull();
    expect(gate?.querySelector('.admin-access-sign-in')).not.toBeNull();
  });

  it('offers no sign-in button when sign-in is unavailable', async () => {
    const { openAdminPortal } = await import('../../src/admin/admin-access.js');
    await openAdminPortal(deps({ isConfigured: false, isLinked: false }, null));
    expect(document.querySelector('.admin-access-gate')?.textContent).toContain(
      'Sign-in is unavailable'
    );
    expect(document.querySelector('.admin-access-sign-in')).toBeNull();
  });
});
