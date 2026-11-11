/**
 * Signs requests in for a test that runs real routes against firebase-admin (the menu
 * contracts on the emulator): the bearer token decodes as `decode` says, and its account
 * exists and is live. Every ID token check also looks the account up
 * (services/identity/token-revocation.ts), so faking verifyIdToken alone leaves that
 * lookup unanswered and every request a 503.
 */
import type { Auth, DecodedIdToken, UserInfo, UserRecord } from 'firebase-admin/auth';
import { vi } from 'vitest';

export function signInWithFakeTokens(
  auth: Auth,
  decode: (token: string) => Partial<DecodedIdToken> & { uid: string }
): void {
  vi.spyOn(auth, 'verifyIdToken').mockImplementation(
    async (token: string) =>
      ({
        auth_time: Math.floor(Date.now() / 1000) - 60,
        ...decode(token),
      }) as DecodedIdToken
  );
  const provider = { providerId: 'password', uid: 'linked' } as UserInfo;
  const account: Partial<UserRecord> = { disabled: false, providerData: [provider] };
  vi.spyOn(auth, 'getUser').mockImplementation(
    async (uid: string) => ({ ...account, uid }) as UserRecord
  );
}
