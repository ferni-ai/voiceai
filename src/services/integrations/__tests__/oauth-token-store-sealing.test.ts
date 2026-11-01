/**
 * users/{uid}/oauth_tokens is sealed with the repo's token key chain and
 * refuses to store anything when there is no key: never plaintext, never a
 * key committed to the repo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const docs = new Map<string, Record<string, unknown>>();

function fakeDoc(path: string) {
  return {
    collection: (name: string) => fakeCollection(`${path}/${name}`),
    set: async (data: Record<string, unknown>, opts?: { merge?: boolean }) => {
      const base = opts?.merge ? (docs.get(path) ?? {}) : {};
      docs.set(path, applyWrite(base, data));
    },
    update: async (data: Record<string, unknown>) => {
      const cur = docs.get(path);
      if (!cur) throw Object.assign(new Error('not found'), { code: 5 });
      docs.set(path, applyWrite(cur, data));
    },
    get: async () => ({
      exists: docs.has(path),
      data: () => (docs.has(path) ? { ...docs.get(path) } : undefined),
      updateTime: undefined,
    }),
    delete: async () => void docs.delete(path),
  };
}
function fakeCollection(path: string) {
  return { doc: (id: string) => fakeDoc(`${path}/${id}`) };
}
const DELETE = Symbol('delete');
function applyWrite(base: Record<string, unknown>, data: Record<string, unknown>) {
  const out = { ...base };
  for (const [k, v] of Object.entries(data)) {
    if (v === DELETE) delete out[k];
    else out[k] = v;
  }
  return out;
}

vi.mock('@google-cloud/firestore', () => ({ FieldValue: { delete: () => DELETE } }));
vi.mock('../../../utils/firestore-utils.js', () => ({
  getFirestoreDb: () => ({ collection: (name: string) => fakeCollection(name) }),
  cleanForFirestore: <T>(v: T) => JSON.parse(JSON.stringify(v)) as T,
  recordDegradation: () => {},
}));

const { saveOAuthTokens, getOAuthTokens, updateOAuthTokens } =
  await import('../oauth-token-store.js');

const ACCESS = 'ya29.access-token-under-test-123';
const REFRESH = '1//refresh-token-under-test-456';
const DOC = 'users/u1/oauth_tokens/google';
const tokens = {
  accessToken: ACCESS,
  refreshToken: REFRESH,
  expiresAt: new Date(Date.now() + 3600_000),
  tokenType: 'Bearer',
  scope: 'a b',
};

const KEYS = [
  'TOKEN_SEALING_KEY',
  'TOKEN_SEALING_KEY_PREVIOUS',
  'OAUTH_ENCRYPTION_KEY',
  'LOG_HASH_SECRET',
];
const saved: Record<string, string | undefined> = {};
const savedNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  docs.clear();
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  process.env.NODE_ENV = savedNodeEnv;
});

describe('oauth-token-store sealing', () => {
  it('production with no key: save is refused with a typed code and nothing is stored', async () => {
    process.env.NODE_ENV = 'production';
    const result = await saveOAuthTokens('u1', 'google', tokens);
    expect(result).toMatchObject({ success: false, code: 'sealing_unavailable' });
    expect(docs.size).toBe(0);
  });

  it('outside production with no key: still refused (never plain JSON)', async () => {
    process.env.NODE_ENV = 'test';
    const result = await saveOAuthTokens('u1', 'google', tokens);
    expect(result.code).toBe('sealing_unavailable');
    expect(docs.size).toBe(0);
  });

  it('with a key: round-trips, and the stored bytes hold neither token', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    expect(await saveOAuthTokens('u1', 'google', tokens)).toEqual({ success: true });

    const stored = JSON.stringify(docs.get(DOC));
    expect(stored).not.toContain(ACCESS);
    expect(stored).not.toContain(REFRESH);
    expect(JSON.parse(docs.get(DOC)?.encrypted as string)).toMatchObject({ encrypted: true });

    const read = await getOAuthTokens('u1', 'google');
    expect(read?.accessToken).toBe(ACCESS);
    expect(read?.refreshToken).toBe(REFRESH);
  });

  it('a refresh without a new refresh token keeps the stored one, still sealed', async () => {
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    await saveOAuthTokens('u1', 'google', tokens);
    const NEW_ACCESS = 'ya29.refreshed-access-token-789';
    const result = await updateOAuthTokens('u1', 'google', {
      ...tokens,
      accessToken: NEW_ACCESS,
      refreshToken: undefined,
    });
    expect(result).toEqual({ success: true });
    expect(JSON.stringify(docs.get(DOC))).not.toContain(NEW_ACCESS);
    const read = await getOAuthTokens('u1', 'google');
    expect(read).toMatchObject({ accessToken: NEW_ACCESS, refreshToken: REFRESH });
  });

  it('production refresh with no key is refused and leaves the stored record unchanged', async () => {
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    await saveOAuthTokens('u1', 'google', tokens);
    const before = JSON.stringify(docs.get(DOC));
    delete process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = 'production';
    const result = await updateOAuthTokens('u1', 'google', { ...tokens, accessToken: 'x-new' });
    expect(result.code).toBe('sealing_unavailable');
    expect(JSON.stringify(docs.get(DOC))).toBe(before);
  });

  it('an old per-field record (no envelope) reads as not connected', async () => {
    process.env.LOG_HASH_SECRET = 'test-only-hash-secret';
    docs.set(DOC, {
      provider: 'google',
      accessToken: 'aa:bb:cc',
      status: 'connected',
      expiresAt: tokens.expiresAt.toISOString(),
      tokenType: 'Bearer',
    });
    expect(await getOAuthTokens('u1', 'google')).toBeNull();
  });
});
