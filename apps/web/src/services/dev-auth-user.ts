/**
 * Dev Auth User
 *
 * When Firebase isn't configured (no VITE_FIREBASE_* env vars) the app has no
 * way past the sign-in gate, so local development and the Playwright suite are
 * stuck on "Welcome to Ferni". In development builds only, a stand-in user can
 * be provided through localStorage:
 *
 *   localStorage.setItem('ferni_dev_auth_user', JSON.stringify({ uid: 'dev-user' }));
 *
 * Production builds never read it: every call site is guarded by
 * `import.meta.env.DEV`, which Vite replaces with `false` at build time.
 *
 * @module DevAuthUser
 */

import type { User } from 'firebase/auth';
import { createLogger } from '../utils/logger.js';

const log = createLogger('DevAuthUser');

export const DEV_AUTH_USER_KEY = 'ferni_dev_auth_user';

interface DevAuthUserConfig {
  uid: string;
  email?: string | null;
  displayName?: string | null;
}

function isDevAuthUserConfig(value: unknown): value is DevAuthUserConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { uid?: unknown }).uid === 'string' &&
    (value as { uid: string }).uid.length > 0
  );
}

/**
 * Read the dev stand-in user, or null when none is configured.
 * Only call this behind `import.meta.env.DEV`.
 */
export function readDevAuthUser(): User | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(DEV_AUTH_USER_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    log.warn({ error: String(error) }, 'Ignoring malformed dev auth user');
    return null;
  }
  if (!isDevAuthUserConfig(parsed)) {
    log.warn('Ignoring dev auth user without a uid');
    return null;
  }

  const token = `dev-token:${parsed.uid}`;
  const devUser = {
    uid: parsed.uid,
    email: parsed.email ?? null,
    displayName: parsed.displayName ?? null,
    photoURL: null,
    phoneNumber: null,
    isAnonymous: false,
    emailVerified: false,
    providerData: [],
    refreshToken: '',
    getIdToken: () => Promise.resolve(token),
    getIdTokenResult: () =>
      Promise.resolve({
        token,
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toUTCString(),
        claims: {},
      }),
    reload: () => Promise.resolve(),
    delete: () => Promise.resolve(),
  };

  // The object implements the subset of firebase's User that this app reads.
  return devUser as unknown as User;
}
