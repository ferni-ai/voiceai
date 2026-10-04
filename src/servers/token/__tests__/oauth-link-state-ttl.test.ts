/**
 * Firestore TTL only deletes documents whose TTL field is a Timestamp. expiresAt
 * is a number, so stored OAuth states also carry ttlAt (a Date → Timestamp) for
 * the oauth_link_states TTL policy to act on.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

const set = vi.fn(async (_data: Record<string, unknown>) => undefined);
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collection: () => ({ doc: () => ({ set }) }) }),
}));

process.env.OAUTH_STATE_STORE = 'firestore';
const { createOAuthLinkState, setOAuthLinkStore, OAUTH_LINK_TTL_MS } =
  await import('../oauth-link-state.js');

describe('oauth link state Firestore TTL field', () => {
  afterEach(() => setOAuthLinkStore(null));

  it('stores ttlAt as a Date equal to expiresAt', async () => {
    const req = { headers: {} } as unknown as IncomingMessage;
    const res = { setHeader: vi.fn(), getHeader: vi.fn() } as unknown as ServerResponse;
    const before = Date.now();

    const state = await createOAuthLinkState(req, res, {
      uid: 'uid-A',
      provider: 'google',
      returnUrl: '/',
    });

    expect(state).toBeTruthy();
    const written = set.mock.calls[0][0] as { expiresAt: number; ttlAt: unknown };
    expect(written.ttlAt).toBeInstanceOf(Date);
    expect((written.ttlAt as Date).getTime()).toBe(written.expiresAt);
    expect(written.expiresAt).toBeGreaterThanOrEqual(before + OAUTH_LINK_TTL_MS);
  });
});
