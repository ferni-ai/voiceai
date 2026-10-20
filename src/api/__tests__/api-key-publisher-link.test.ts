/**
 * An API key works only while its publisher is still linked to the account
 * that minted it.
 *
 * Firebase-token requests re-check the publisher link on every call, but
 * requireApiKeyAuth accepted any enabled key on its own, so a key minted
 * through a link that was later cleared or replaced kept working. Real
 * middleware; Firestore is an in-memory fake at the client boundary.
 */
import type { ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, Map<string, Record<string, unknown>>>());
vi.mock('@google-cloud/firestore', () => {
  const table = (name: string) => {
    const rows = store.get(name) ?? new Map<string, Record<string, unknown>>();
    store.set(name, rows);
    return rows;
  };
  const snapshot = (name: string, id: string) => ({
    id,
    exists: table(name).has(id),
    data: () => table(name).get(id),
  });
  const query = (name: string, filters: Array<[string, unknown]>) => ({
    where: (f: string, _op: string, v: unknown) => query(name, [...filters, [f, v]]),
    limit: () => query(name, filters),
    get: async () => {
      const docs = [...table(name).keys()]
        .filter((id) => filters.every(([f, v]) => table(name).get(id)?.[f] === v))
        .map((id) => snapshot(name, id));
      return { empty: docs.length === 0, docs, size: docs.length };
    },
  });
  class Firestore {
    collection(name: string) {
      return {
        where: (f: string, _op: string, v: unknown) => query(name, [[f, v]]),
        doc: (id: string) => ({
          id,
          get: async () => snapshot(name, id),
          update: async (data: Record<string, unknown>) => {
            table(name).set(id, { ...table(name).get(id), ...data });
          },
        }),
      };
    }
  }
  return { Firestore };
});

const { requireApiKeyAuth } = await import('../v2/developers/shared/middleware.js');

const KEY = 'pk_test_abcdefghijklmnopqrstuvwxyz012345';

function keyDoc(fields: Record<string, unknown>) {
  store.set('developer_api_keys', new Map([['key-1', { key: KEY, enabled: true, ...fields }]]));
}
function linkPublisher(firebaseUid: string | undefined) {
  const data: Record<string, unknown> = { email: 'owner@example.com' };
  if (firebaseUid) data.firebaseUid = firebaseUid;
  store.set('publishers', new Map([['pub-1', data]]));
}

async function callWithKey() {
  const res = { status: 0, body: '', writeHead: vi.fn(), end: vi.fn() };
  res.writeHead.mockImplementation((s: number) => (res.status = s));
  res.end.mockImplementation((b: string) => (res.body = b));
  const req: Parameters<typeof requireApiKeyAuth>[0] = Object.assign(Object.create(null), {
    headers: { 'x-api-key': KEY },
  });
  const auth = await requireApiKeyAuth(req, res as unknown as ServerResponse);
  return { auth, status: res.status, body: res.body };
}

beforeEach(() => store.clear());

describe('requireApiKeyAuth follows the publisher link', () => {
  it('(a) accepts a key minted by the account the publisher is linked to', async () => {
    linkPublisher('uid-owner');
    keyDoc({ publisherId: 'pub-1', createdByUid: 'uid-owner' });
    const { auth, status } = await callWithKey();
    expect(status).toBe(0);
    expect(auth?.publisherId).toBe('pub-1');
  });

  it('(b) refuses the same key once the publisher link is cleared', async () => {
    linkPublisher('uid-owner');
    keyDoc({ publisherId: 'pub-1', createdByUid: 'uid-owner' });
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');

    linkPublisher(undefined);
    const after = await callWithKey();
    expect(after.auth).toBeNull();
    expect(after.status).toBe(401);
    expect(after.body).toContain('key revoked: re-link your account');
  });

  it('(c) refuses a key minted by a different account than the current link', async () => {
    linkPublisher('uid-owner');
    keyDoc({ publisherId: 'pub-1', createdByUid: 'uid-stale' });
    const { auth, status } = await callWithKey();
    expect(auth).toBeNull();
    expect(status).toBe(401);
  });

  it('(c) treats the uid already stored on older keys as the minting account', async () => {
    linkPublisher('uid-owner');
    keyDoc({ publisherId: 'pub-1', firebaseUid: 'uid-stale' });
    expect((await callWithKey()).status).toBe(401);

    keyDoc({ publisherId: 'pub-1', firebaseUid: 'uid-owner' });
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
  });

  it('(d) accepts a key with no recorded account only while a link exists', async () => {
    keyDoc({ publisherId: 'pub-1' });
    linkPublisher('uid-owner');
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');

    linkPublisher(undefined);
    expect((await callWithKey()).status).toBe(401);
  });

  it('refuses a key whose publisher record is gone', async () => {
    keyDoc({ publisherId: 'pub-missing', createdByUid: 'uid-owner' });
    expect((await callWithKey()).status).toBe(401);
  });
});
