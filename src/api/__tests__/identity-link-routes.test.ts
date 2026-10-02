/**
 * POST /api/identity/link merges anonymous memory into the caller's account
 * only with proof that the caller holds both identities.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFirestore } from '../../services/identity/__tests__/memory-firestore.js';
import { fakeRequest, fakeResponse } from './http-test-utils.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  tokens: new Map<string, { uid: string; isAnonymous: boolean } | { expired: true }>(),
}));

vi.mock('../../services/identity/firebase-auth.js', () => ({
  verifyFirebaseToken: async (token: string) => {
    const t = h.tokens.get(token);
    if (!t) return null;
    return 'expired' in t ? t : { ...t, emailVerified: true, claims: {}, expiresAt: 0 };
  },
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object' && !('expired' in r),
}));

vi.mock('../../utils/firestore-utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/firestore-utils.js')>();
  return { ...actual, getFirestoreDb: () => h.db };
});

vi.mock('../auth-middleware.js', () => ({ rateLimit: () => false }));

import { clearRedirectCache } from '../../services/identity/identity-redirect.js';
import { handleIdentityLinkRoutes } from '../identity-link-routes.js';

let db: MemoryFirestore;

async function link(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const out = fakeResponse();
  const handled = await handleIdentityLinkRoutes(
    fakeRequest({
      url: '/api/identity/link',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
    out.res,
    '/api/identity/link'
  );
  expect(handled).toBe(true);
  return out;
}

const asAccount = { authorization: 'Bearer account-token' };

beforeEach(() => {
  db = new MemoryFirestore();
  h.db = db;
  clearRedirectCache();
  h.tokens.clear();
  h.tokens.set('account-token', { uid: 'acctUid', isAnonymous: false });
  h.tokens.set('anon-token', { uid: 'anonUid', isAnonymous: true });
  h.tokens.set('other-account-token', { uid: 'otherUid', isAnonymous: false });
  h.tokens.set('expired-anon', { expired: true });
  db.put('bogle_users/anonUid', { name: 'Sam', totalConversations: 1 });
  db.put('bogle_users/anonUid/summaries/s1', { summary: 'hiking' });
});

describe('POST /api/identity/link', () => {
  it('merges a verified anonymous session into the signed-in account', async () => {
    const out = await link({ anonymousIdToken: 'anon-token' }, asAccount);
    expect(out.status()).toBe(200);
    expect(out.json()).toEqual({ results: [{ source: 'anonymous', outcome: 'merged' }] });
    expect(db.read('bogle_users/acctUid/summaries/s1')).toBeDefined();
    expect(db.read('bogle_users/anonUid')).toMatchObject({ mergedInto: 'acctUid' });
    expect(db.read('bogle_users/acctUid/linked_identities/anonUid')).toMatchObject({
      status: 'complete',
    });
  });

  it('is safe to call twice', async () => {
    await link({ anonymousIdToken: 'anon-token' }, asAccount);
    const again = await link({ anonymousIdToken: 'anon-token' }, asAccount);
    expect(again.status()).toBe(200);
    expect(db.read('bogle_users/acctUid')).toMatchObject({ totalConversations: 1 });
  });

  it('refuses without an account token', async () => {
    const out = await link({ anonymousIdToken: 'anon-token' });
    expect(out.status()).toBe(401);
    expect(db.read('bogle_users/anonUid/summaries/s1')).toBeDefined();
  });

  it('refuses when the "account" is itself anonymous', async () => {
    const out = await link(
      { anonymousIdToken: 'anon-token' },
      { authorization: 'Bearer anon-token' }
    );
    expect(out.status()).toBe(403);
  });

  it('refuses a raw anonymous uid without its token (no proof)', async () => {
    const out = await link({ anonymousUid: 'anonUid' }, asAccount);
    expect(out.status()).toBe(400);
    expect(db.read('bogle_users/acctUid/summaries/s1')).toBeUndefined();
  });

  it('refuses an invalid or expired anonymous token', async () => {
    for (const token of ['forged', 'expired-anon']) {
      const out = await link({ anonymousIdToken: token }, asAccount);
      expect(out.status()).toBe(401);
    }
    expect(db.read('bogle_users/anonUid/summaries/s1')).toBeDefined();
  });

  it('refuses to merge another real account presented as the "anonymous" side', async () => {
    const out = await link({ anonymousIdToken: 'other-account-token' }, asAccount);
    expect(out.status()).toBe(403);
  });

  it('will not move an identity a different account already claimed', async () => {
    await link({ anonymousIdToken: 'anon-token' }, asAccount);
    db.put('bogle_users/anonUid/summaries/late', { summary: 'late write' });
    const out = await link(
      { anonymousIdToken: 'anon-token' },
      { authorization: 'Bearer other-account-token' }
    );
    expect(out.status()).toBe(409);
    expect(out.json()).toEqual({ results: [{ source: 'anonymous', outcome: 'linked_elsewhere' }] });
    expect(db.read('bogle_users/otherUid/summaries/late')).toBeUndefined();
  });

  it('claims the caller’s device identity', async () => {
    db.put('bogle_users/device:dev-1234-5678/summaries/d1', { summary: 'from the browser' });
    const out = await link({ deviceId: 'dev-1234-5678' }, asAccount);
    expect(out.json()).toEqual({ results: [{ source: 'device', outcome: 'merged' }] });
    expect(db.read('bogle_users/acctUid/summaries/d1')).toBeDefined();
  });

  it('rejects malformed device ids and empty requests', async () => {
    expect((await link({ deviceId: '../../x' }, asAccount)).status()).toBe(400);
    expect((await link({}, asAccount)).status()).toBe(400);
  });

  it('ignores other paths', async () => {
    const out = fakeResponse();
    const handled = await handleIdentityLinkRoutes(
      fakeRequest({ url: '/api/identity/other' }),
      out.res,
      '/api/identity/other'
    );
    expect(handled).toBe(false);
  });
});
