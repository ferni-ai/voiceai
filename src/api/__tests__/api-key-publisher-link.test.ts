/**
 * An API key works only while its publisher is still linked to the account
 * that minted it, and that account is itself sound: not anonymous, a verified
 * email, equal to the publisher's email.
 *
 * Firebase-token requests re-check the publisher link on every call, but
 * requireApiKeyAuth accepted any enabled key on its own, so a key minted
 * through a link that was later cleared or replaced kept working. Real
 * middleware; Firestore and Firebase Auth are in-memory fakes at the client
 * boundary.
 */
import type { ServerResponse } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface User {
  email?: string;
  emailVerified: boolean;
  disabled?: boolean;
  providerData: object[];
}
const users = vi.hoisted(() => new Map<string, User | Error>());
const getUser = vi.hoisted(() =>
  vi.fn(async (uid: string) => {
    const user = users.get(uid);
    if (user instanceof Error) throw user;
    if (!user) throw Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    return user;
  })
);
vi.mock('firebase-admin/app', () => ({
  getApps: () => [{}],
  initializeApp: vi.fn(),
  applicationDefault: vi.fn(),
}));
vi.mock('firebase-admin/auth', () => ({ getAuth: () => ({ getUser }) }));

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
const { resetApiKeyLinkCache } = await import('../v2/developers/shared/api-key-link.js');

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

const SOUND: User = { email: 'Owner@Example.com', emailVerified: true, providerData: [{}] };

beforeEach(() => {
  store.clear();
  users.clear();
  users.set('uid-owner', SOUND);
  getUser.mockClear();
  resetApiKeyLinkCache();
  vi.restoreAllMocks();
});

/** A key minted by the publisher's linked account, so only that account's soundness decides. */
function linkedTo(uid: string, user: User | Error | undefined) {
  if (user) users.set(uid, user);
  linkPublisher(uid);
  keyDoc({ publisherId: 'pub-1', createdByUid: uid });
}

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

describe('requireApiKeyAuth requires the linked account to be sound', () => {
  it('refuses a key when the linked account is anonymous', async () => {
    linkedTo('uid-anon', { ...SOUND, providerData: [] });
    const { auth, status } = await callWithKey();
    expect(auth).toBeNull();
    expect(status).toBe(401);
  });

  it('refuses a key when the linked account is disabled', async () => {
    linkedTo('uid-disabled', { ...SOUND, disabled: true });
    const { auth, status } = await callWithKey();
    expect(getUser).toHaveBeenCalledWith('uid-disabled');
    expect(auth).toBeNull();
    expect(status).toBe(401);
  });

  it('refuses a key when the linked account email is not verified', async () => {
    linkedTo('uid-unverified', { ...SOUND, emailVerified: false });
    expect((await callWithKey()).status).toBe(401);
  });

  it("refuses a key when the linked account email is not the publisher's", async () => {
    linkedTo('uid-other', { ...SOUND, email: 'other@example.com' });
    expect((await callWithKey()).status).toBe(401);
  });

  it('refuses a key when the linked account was deleted', async () => {
    linkedTo('uid-deleted', undefined);
    const { status, body } = await callWithKey();
    expect(getUser).toHaveBeenCalledWith('uid-deleted');
    expect(status).toBe(401);
    expect(body).toContain('key revoked: re-link your account');
  });

  it('fails closed on any other Auth error, and does not cache it', async () => {
    linkedTo(
      'uid-flaky',
      Object.assign(new Error('backend down'), { code: 'auth/internal-error' })
    );
    const failed = await callWithKey();
    expect(failed.status).toBe(401);
    expect(failed.body).toContain('Authentication failed');

    users.set('uid-flaky', SOUND);
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('caches a sound account for five minutes', async () => {
    linkedTo('uid-owner', SOUND);
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
    expect(getUser).toHaveBeenCalledTimes(1);

    clock.mockReturnValue(now + 5 * 60 * 1000 + 1);
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
    expect(getUser).toHaveBeenCalledTimes(2);
  });

  it('never caches an unsound result', async () => {
    linkedTo('uid-late', { ...SOUND, emailVerified: false });
    expect((await callWithKey()).status).toBe(401);

    users.set('uid-late', SOUND);
    expect((await callWithKey()).auth?.publisherId).toBe('pub-1');
    expect(getUser).toHaveBeenCalledTimes(2);
  });
});
