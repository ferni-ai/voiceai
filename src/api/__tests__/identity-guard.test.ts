import type { IncomingMessage } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const optionalAuthAsync = vi.fn();
vi.mock('../auth-middleware.js', () => ({ optionalAuthAsync: (...a: unknown[]) => optionalAuthAsync(...a) }));

const { enforceVerifiedIdentity, isAnonymousIdentity } = await import('../identity-guard.js');

const jwt = (claims: object) =>
  `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.sig`;
const FIREBASE = `Bearer ${jwt({ iss: 'https://securetoken.google.com/johnb-2025' })}`;

function req(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers: { ...headers } } as unknown as IncomingMessage;
}

describe('identity guard', () => {
  beforeEach(() => optionalAuthAsync.mockReset());

  it('recognises anonymous device identities', () => {
    expect(isAnonymousIdentity('device:device_1712_abc')).toBe(true);
    expect(isAnonymousIdentity('device_1712_abc')).toBe(true);
    expect(isAnonymousIdentity('fb-uid-123')).toBe(false);
  });

  it('strips a client-sent x-firebase-uid when there is no credential', async () => {
    const r = req('/api/export', { 'x-firebase-uid': 'victim' });
    expect(await enforceVerifiedIdentity(r)).toBeNull();
    expect(r.headers['x-firebase-uid']).toBeUndefined();
    expect(optionalAuthAsync).not.toHaveBeenCalled();
  });

  it('sets x-firebase-uid from a verified token', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'alice' });
    const r = req('/api/profile', { authorization: FIREBASE, 'x-firebase-uid': 'victim' });
    expect(await enforceVerifiedIdentity(r)).toBe('alice');
    expect(r.headers['x-firebase-uid']).toBe('alice');
  });

  it('drops an unverified userId query for a real account but keeps anonymous ones', async () => {
    const spoof = req('/api/memories?userId=victim&limit=5');
    await enforceVerifiedIdentity(spoof);
    expect(spoof.url).toBe('/api/memories?limit=5');

    const anon = req('/api/memories?userId=device%3Adevice_1_a');
    await enforceVerifiedIdentity(anon);
    expect(anon.url).toBe('/api/memories?userId=device%3Adevice_1_a');
  });

  it('keeps x-user-id only when it matches the verified user or is anonymous', async () => {
    optionalAuthAsync.mockResolvedValue({ userId: 'alice' });
    const mismatch = req('/api/x', { authorization: FIREBASE, 'x-user-id': 'victim' });
    await enforceVerifiedIdentity(mismatch);
    expect(mismatch.headers['x-user-id']).toBeUndefined();

    const match = req('/api/x', { authorization: FIREBASE, 'x-user-id': 'alice' });
    await enforceVerifiedIdentity(match);
    expect(match.headers['x-user-id']).toBe('alice');

    optionalAuthAsync.mockResolvedValue(null);
    const anon = req('/api/x', { 'x-user-id': 'device:device_9_z' });
    await enforceVerifiedIdentity(anon);
    expect(anon.headers['x-user-id']).toBe('device:device_9_z');
  });

  it('does not send non-Firebase bearer tokens (e.g. Scheduler OIDC) to Firebase auth', async () => {
    const oidc = req('/api/jobs/memory-decay', {
      authorization: `Bearer ${jwt({ iss: 'https://accounts.google.com' })}`,
    });
    expect(await enforceVerifiedIdentity(oidc)).toBeNull();
    expect(optionalAuthAsync).not.toHaveBeenCalled();
  });
});
