/**
 * POST /api/auth/migrate is retired: every caller gets 410 Gone, and nothing
 * is read, written or migrated.
 *
 * The route stays mounted so old clients get a clean 410 rather than falling
 * through to another handler. The real auth middleware and migration modules
 * are loaded; token verification, rate limiting and storage are faked, and
 * the fakes count every call.
 */
import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createUserProfile } from '../../types/user-profile.js';

const { calls, db, docs, store } = await vi.hoisted(async () => {
  const { fakeFirestoreTree } =
    await import('../../services/identity/__tests__/fake-firestore-tree.js');
  const { InMemoryStore: Store } = await import('../../memory/storage/in-memory-store.js');
  const calls = { reads: 0, writes: 0 };
  const READ = /^(get|find|list|load|search|query|count|has|exists)/i;
  // Counts every method called on the object and on whatever those calls return
  const counting = <T extends object>(target: T): T =>
    new Proxy(target, {
      get(obj, key, receiver) {
        const value = Reflect.get(obj, key, receiver) as unknown;
        if (typeof value !== 'function' || typeof key !== 'string') return value;
        return (...args: unknown[]) => {
          if (READ.test(key)) calls.reads++;
          else calls.writes++;
          const out = (value as (...a: unknown[]) => unknown).apply(obj, args);
          const wrap = (v: unknown) => (v && typeof v === 'object' ? counting(v) : v);
          return out instanceof Promise ? out.then(wrap) : wrap(out);
        };
      },
    });
  const tree = fakeFirestoreTree();
  return { calls, db: counting(tree.db), docs: tree.docs, store: counting(new Store()) };
});

vi.mock('../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => db }));
vi.mock('../../memory/firestore-store.js', () => ({ getFirestoreStore: () => store }));
vi.mock('../../services/identity/firebase-auth.js', () => ({
  // "tok-<name>" verifies as a full account; "anon-<name>" as an anonymous one
  verifyFirebaseToken: vi.fn(async (token: string) => {
    const [kind, name] = token.split('-');
    if (kind !== 'tok' && kind !== 'anon') return null;
    return {
      uid: `uid-${name}`.padEnd(28, '0'),
      email: kind === 'tok' ? `${name}@example.com` : undefined,
      claims: { firebase: { sign_in_provider: kind === 'tok' ? 'google.com' : 'anonymous' } },
    };
  }),
  isVerifiedToken: (r: unknown) => r !== null && typeof r === 'object',
  claimsFirebaseIssuer: () => true,
}));
vi.mock('../auth-middleware.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../auth-middleware.js')>()),
  rateLimit: () => false,
}));
// The real migration modules, every export spied
vi.mock('../../services/user-migration.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/user-migration.js')>();
  return {
    ...real,
    migrateUserData: vi.fn(real.migrateUserData),
    getMigratedUid: vi.fn(real.getMigratedUid),
    isAlreadyMigrated: vi.fn(real.isAlreadyMigrated),
  };
});
vi.mock('../../services/identity/identity-linking.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../services/identity/identity-linking.js')>();
  return { ...real, linkIdentity: vi.fn(real.linkIdentity) };
});

const { handleMigrationRoutes } = await import('../migration-routes.js');
const migration = await import('../../services/user-migration.js');
const linking = await import('../../services/identity/identity-linking.js');

const DEVICE = 'device_test_001';

async function post(
  body: Record<string, unknown>,
  token?: string
): Promise<{ handled: boolean; status: number; body: unknown }> {
  const req = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
    url: '/api/auth/migrate',
    method: 'POST',
    headers: {
      host: 'localhost',
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    socket: { remoteAddress: '127.0.0.1' },
  });
  let status = 0;
  let text = '';
  const res = {
    statusCode: 200,
    writableEnded: false,
    headersSent: false,
    writeHead(s: number) {
      status = s;
      return this;
    },
    setHeader: () => {},
    end(b?: string) {
      text = b ?? '';
    },
  };
  const handled = await handleMigrationRoutes(
    req as unknown as IncomingMessage,
    res as unknown as ServerResponse,
    '/api/auth/migrate'
  );
  return { handled, status: status || res.statusCode, body: text ? JSON.parse(text) : null };
}

describe('POST /api/auth/migrate is retired', () => {
  beforeEach(async () => {
    docs.clear();
    // A legacy device profile with data, as an old client would name it
    await store.saveProfile(createUserProfile(`device:${DEVICE}`, 'Sam Rivera'));
    docs.set(`bogle_users/device:${DEVICE}`, { totalConversations: 4 });
    docs.set(`bogle_users/device:${DEVICE}/journal/j1`, { text: 'hello' });
    calls.reads = 0;
    calls.writes = 0;
    vi.mocked(migration.migrateUserData).mockClear();
    vi.mocked(migration.getMigratedUid).mockClear();
    vi.mocked(migration.isAlreadyMigrated).mockClear();
    vi.mocked(linking.linkIdentity).mockClear();
  });

  it.each([
    ['no auth', undefined],
    ['an anonymous Firebase token', 'anon-sam'],
    ['a full-account token', 'tok-sam'],
  ])('answers 410 Gone to %s and touches nothing', async (_label, token) => {
    const { handled, status, body } = await post(
      { deviceId: DEVICE, firebaseUid: 'uid-sam'.padEnd(28, '0') },
      token
    );
    expect(handled).toBe(true);
    expect(status).toBe(410);
    expect(body).toEqual({ error: 'gone' });
    expect(calls).toEqual({ reads: 0, writes: 0 });
    expect(migration.migrateUserData).not.toHaveBeenCalled();
    expect(migration.getMigratedUid).not.toHaveBeenCalled();
    expect(migration.isAlreadyMigrated).not.toHaveBeenCalled();
    expect(linking.linkIdentity).not.toHaveBeenCalled();
    expect(docs.get(`bogle_users/device:${DEVICE}`)).toEqual({ totalConversations: 4 });
    expect([...docs.keys()].some((p) => p.startsWith('bogle_users/uid-'))).toBe(false);
  });

  it('still answers the status route, so 410 is not a catch-all', async () => {
    const req = {
      url: `/api/auth/migration-status?deviceId=${DEVICE}`,
      method: 'GET',
      headers: { host: 'localhost' },
    };
    let status = 0;
    const res = {
      writeHead: (s: number) => void (status = s),
      setHeader: () => {},
      end: () => {},
    };
    const handled = await handleMigrationRoutes(
      req as unknown as IncomingMessage,
      res as unknown as ServerResponse,
      '/api/auth/migration-status'
    );
    expect(handled).toBe(true);
    expect(status).toBe(200);
  });
});
