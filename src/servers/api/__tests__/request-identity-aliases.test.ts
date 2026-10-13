/**
 * The door rewrites every way a request can name a user, not only ?userId=.
 *
 * /api/conversation/cost read ?user_id=, which the door left alone, so in
 * production a request with no token could read any user's session costs.
 */
import type { IncomingMessage } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const optionalAuthAsync = vi.fn();
vi.mock('../../../api/auth-middleware.js', () => ({ optionalAuthAsync }));

const { bindVerifiedIdentity } = await import('../request-identity.js');

function req(url: string, headers: Record<string, string> = {}): IncomingMessage {
  return { url, headers: { ...headers } } as unknown as IncomingMessage;
}
const PROD = { NODE_ENV: 'production' };
const QUERY_ALIASES = [
  'userId',
  'user_id',
  'userid',
  'UserID',
  'uid',
  'firebase_uid',
  'firebaseUid',
];
const HEADER_ALIASES = ['x-user-id', 'x-userid', 'x-uid'];

describe('bindVerifiedIdentity covers every user alias', () => {
  beforeEach(() => optionalAuthAsync.mockReset());

  it.each(QUERY_ALIASES)('removes ?%s= from an anonymous request', async (alias) => {
    const r = req(`/api/conversation/cost?${alias}=victim&format=json`);
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/conversation/cost?format=json');
  });

  it.each(QUERY_ALIASES)('replaces ?%s= with the verified uid', async (alias) => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const r = req(`/api/conversation/cost?${alias}=victim`, { authorization: 'Bearer t' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe(`/api/conversation/cost?${alias}=real-user`);
  });

  it('rewrites several aliases in one request', async () => {
    const r = req('/api/x?user_id=victim&uid=victim&q=1');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/x?q=1');
  });

  it.each(HEADER_ALIASES)('drops a client-supplied %s header without a credential', async (h) => {
    const r = req('/api/x', { [h]: 'victim' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.headers[h]).toBeUndefined();
  });

  it.each(HEADER_ALIASES)('sets %s to the verified uid', async (h) => {
    optionalAuthAsync.mockResolvedValue({ userId: 'real-user' });
    const r = req('/api/x', { authorization: 'Bearer t', [h]: 'victim' });
    await bindVerifiedIdentity(r, PROD);
    expect(r.headers[h]).toBe('real-user');
  });

  it('leaves params that only look similar alone', async () => {
    const r = req('/token?username=Sam&user_email=a%40b.c&isNewUser=1');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/token?username=Sam&user_email=a%40b.c&isNewUser=1');
  });

  it('keeps an anonymous visitor id under any alias on public endpoints', async () => {
    const r = req('/api/landing/visit?user_id=visitor-1');
    await bindVerifiedIdentity(r, PROD);
    expect(r.url).toBe('/api/landing/visit?user_id=visitor-1');
  });
});
