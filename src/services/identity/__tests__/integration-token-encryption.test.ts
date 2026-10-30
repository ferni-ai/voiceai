/**
 * Every integration token store writes ciphertext, reads both the sealed and
 * the legacy plaintext shape, removes the token on disconnect, and never logs
 * a token. Runs each store's real write/read/disconnect code against an
 * in-memory Firestore with real merge/update/delete semantics.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
  };
  const logger = { debug: fn, info: fn, warn: fn, error: fn, trace: fn, fatal: fn };
  return {
    calls,
    logger: { ...logger, child: () => logger },
    db: null as unknown as ReturnType<typeof createMergeFakeFirestore>,
  };
});

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => h.logger,
  getLogger: () => h.logger,
}));

vi.mock('@google-cloud/firestore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@google-cloud/firestore')>()),
  Firestore: function FakeFirestore() {
    return h.db;
  },
}));

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => h.db,
}));

vi.mock('jose', () => ({
  importPKCS8: async () => ({}),
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setSubject() {
      return this;
    }
    setAudience() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return 'client-secret-jwt';
    }
  },
}));

// The persistence store, with its real merge-write behaviour, over the fake db.
vi.mock('../../persistence/index.js', async () => {
  const { cleanForFirestore } = await import('../../../utils/firestore-utils.js');
  return {
    createPersistenceStore: (cfg: {
      collection: string;
      documentId?: string;
      useRootCollection?: boolean;
    }) => {
      const ref = (id: string) =>
        cfg.useRootCollection
          ? h.db.collection(cfg.collection).doc(id)
          : h.db
              .collection('bogle_users')
              .doc(id)
              .collection(cfg.collection)
              .doc(cfg.documentId ?? 'data');
      return {
        get: async (id: string) => (await ref(id).get()).data() ?? null,
        setImmediate: async (id: string, data: Record<string, unknown>) =>
          ref(id).set(cleanForFirestore({ ...data, _updatedAt: 'now', _userId: id }), {
            merge: true,
          }),
        delete: async (id: string) => ref(id).delete(),
        shutdown: async () => undefined,
      };
    },
  };
});

// The Firestore-backed profile store: getProfile/saveProfile (merge) + getDatabase.
vi.mock('../../../memory/store-factory.js', () => {
  const profileRef = (uid: string) => h.db.collection('bogle_users').doc(uid);
  const store = {
    getProfile: async (uid: string) => (await profileRef(uid).get()).data() ?? null,
    getOrCreateProfile: async (uid: string) => {
      const existing = (await profileRef(uid).get()).data();
      if (existing) return existing;
      await profileRef(uid).set({ id: uid, name: 'fixture' });
      return { id: uid, name: 'fixture' };
    },
    saveProfile: async (p: { id: string }) =>
      profileRef(p.id).set(JSON.parse(JSON.stringify(p)), { merge: true }),
    getDatabase: async () => h.db,
  };
  return { getStore: async () => store };
});

const ACCESS = 'fixture-access-token-0001';
const REFRESH = 'fixture-refresh-token-0002';
const state = newMergeFakeState();
const doc = (path: string) => state.docs.get(path);
const noRawToken = (v: unknown) => {
  const s = JSON.stringify(v);
  expect(s).not.toContain(ACCESS);
  expect(s).not.toContain(REFRESH);
};

describe('integration token stores encrypt at rest', () => {
  const savedEnv = { ...process.env };
  beforeAll(() => {
    h.db = createMergeFakeFirestore(state);
    process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
    process.env.OURA_CLIENT_ID = 'oura-client';
    process.env.OURA_CLIENT_SECRET = 'oura-secret';
    process.env.OURA_REDIRECT_URI = 'https://example.test/cb';
    process.env.APPLE_CLIENT_ID = 'apple-client';
    process.env.APPLE_TEAM_ID = 'team';
    process.env.APPLE_KEY_ID = 'kid';
    process.env.APPLE_PRIVATE_KEY = 'pk';
  });
  beforeEach(() => {
    state.docs.clear();
    state.writes.length = 0;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    // No token value ever reaches the logger.
    const logged = h.calls.splice(0);
    noRawToken(logged.map((args) => args.map(String).join(' ') + JSON.stringify(args)));
  });
  afterAll(() => {
    process.env = savedEnv;
  });

  const tokenResponse = (extra: Record<string, unknown> = {}) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          access_token: ACCESS,
          refresh_token: REFRESH,
          expires_in: 3600,
          token_type: 'Bearer',
          ...extra,
        }),
      }))
    );

  it('oura: sealed write, both reads, disconnect deletes', async () => {
    const oura = await import('../oura-auth.js');
    tokenResponse();
    expect((await oura.exchangeCodeForTokens('code', 'u-oura')).success).toBe(true);
    const stored = doc('oura_tokens/u-oura');
    expect(stored?.encrypted).toEqual(expect.any(String));
    noRawToken(stored);

    state.docs.set('oura_tokens/u-legacy', {
      access_token: ACCESS,
      refresh_token: REFRESH,
      expires_at: Date.now() + 9e6,
    });
    expect(await oura.getValidAccessToken('u-legacy')).toBe(ACCESS);

    state.docs.set('oura_tokens/u-sealed', structuredClone(stored!));
    expect(await oura.getValidAccessToken('u-sealed')).toBe(ACCESS);

    await oura.deleteUserTokens('u-oura');
    expect(doc('oura_tokens/u-oura')).toBeUndefined();
  });

  it('a key mismatch is logged with the store and reason, not read as "not connected" silently', async () => {
    const oura = await import('../oura-auth.js');
    tokenResponse();
    await oura.exchangeCodeForTokens('code', 'u-kid-a');
    const sealed = structuredClone(doc('oura_tokens/u-kid-a')!);
    process.env.OAUTH_ENCRYPTION_KEY = 'fixture-other-key';
    try {
      state.docs.set('oura_tokens/u-kid-b', sealed);
      h.calls.length = 0;
      expect(await oura.getValidAccessToken('u-kid-b')).toBeNull();
      const warning = h.calls.find(
        (args) => (args[0] as { reason?: string } | undefined)?.reason === 'kid-mismatch'
      );
      expect(warning?.[0]).toMatchObject({ store: 'oura_tokens', reason: 'kid-mismatch' });
      expect(JSON.stringify(warning)).not.toContain('u-kid-b');
    } finally {
      process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
    }
  });

  it.each([
    ['ecobee', '../ecobee-auth.js', 'ecobee_tokens'],
  ])('%s: sealed write, both reads, disconnect deletes', async (_name, path, collection) => {
    const mod = (await import(path)) as typeof import('../ecobee-auth.js');
    const tokens = {
      access_token: ACCESS,
      refresh_token: REFRESH,
      expires_at: 1,
      user_id: 'x',
    } as never;
    await mod.storeUserTokens('u-1', tokens);
    const stored = doc(`${collection}/u-1`);
    expect(stored?.encrypted).toEqual(expect.any(String));
    noRawToken(stored);

    state.docs.set(`${collection}/u-legacy`, {
      access_token: ACCESS,
      refresh_token: REFRESH,
      expires_at: 1,
    });
    expect((await mod.getUserTokens('u-legacy'))?.access_token).toBe(ACCESS);
    state.docs.set(`${collection}/u-sealed`, structuredClone(stored!));
    expect((await mod.getUserTokens('u-sealed'))?.refresh_token).toBe(REFRESH);

    await mod.deleteUserTokens('u-1');
    expect(doc(`${collection}/u-1`)).toBeUndefined();
  });

  it('apple calendar: sealed write, both reads, disconnect deletes', async () => {
    const apple = await import('../apple-signin-oauth.js');
    const idToken = `h.${Buffer.from(JSON.stringify({ sub: 's' })).toString('base64')}.sig`;
    tokenResponse({ id_token: idToken });
    expect((await apple.handleAppleCallback('code', 'u-apple')).success).toBe(true);
    const stored = doc('apple_calendar_tokens/u-apple');
    expect(stored?.encrypted).toEqual(expect.any(String));
    noRawToken(stored);
    expect((await apple.getTokens('u-apple'))?.accessToken).toBe(ACCESS);

    state.docs.set('apple_calendar_tokens/u-legacy', {
      accessToken: ACCESS,
      refreshToken: REFRESH,
      idToken,
      expiresAt: 1,
    });
    expect((await apple.getTokens('u-legacy'))?.refreshToken).toBe(REFRESH);

    await apple.removeTokens('u-apple');
    expect(doc('apple_calendar_tokens/u-apple')).toBeUndefined();
  });

  it('spotify server account: legacy plaintext is replaced, not merged beside the ciphertext', async () => {
    state.docs.set('spotify_tokens/global', {
      access_token: 'old-a',
      refresh_token: REFRESH,
      expires_at: 1,
      scope: 's',
    });
    const spotify = await import('../../../servers/api/services/spotify.js');
    await spotify.loadTokens();
    expect(spotify.getRefreshToken()).toBe(REFRESH); // legacy read

    await spotify.saveTokens(ACCESS, REFRESH, 3600);
    const stored = doc('spotify_tokens/global');
    expect(stored?.encrypted).toEqual(expect.any(String));
    expect(stored).not.toHaveProperty('access_token');
    expect(stored).not.toHaveProperty('refresh_token');
    noRawToken(stored);
  });

  it('plaid: sealed over legacy, both reads, disconnect deletes', async () => {
    const path = 'bogle_users/u-plaid/plaid_tokens/data';
    state.docs.set(path, {
      access_token: ACCESS,
      item_id: 'item',
      institution: {},
      linked_at: 'x',
    });
    const plaid = await import('../../../servers/api/services/plaid.js');
    expect((await plaid.getToken('u-plaid'))?.access_token).toBe(ACCESS); // legacy read

    await plaid.storeToken('u-plaid', ACCESS, 'item');
    const stored = doc(path);
    expect(stored?.encrypted).toEqual(expect.any(String));
    expect(stored).not.toHaveProperty('access_token');
    noRawToken(stored);

    await plaid.removeToken('u-plaid');
    expect(doc(path)).toBeUndefined();
  });

  it('linkedin: sealed profile field replaces legacy, disconnect leaves no token field', async () => {
    state.docs.set('bogle_users/u-li', {
      id: 'u-li',
      name: 'fixture',
      linkedInTokens: {
        accessToken: ACCESS,
        refreshToken: REFRESH,
        expiresAt: new Date(Date.now() + 9e6).toISOString(),
        scope: [],
        lastSync: 'x',
      },
    });
    const linkedin = await import('../../linkedin/index.js');
    expect(await linkedin.initializeLinkedIn('u-li')).toBe(true); // legacy read
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );

    await linkedin.connectLinkedIn('u-li', ACCESS, REFRESH, 3600, ['r_liteprofile']);
    const field = doc('bogle_users/u-li')?.linkedInTokens as Record<string, unknown>;
    expect(Object.keys(field)).toEqual(['encrypted']);
    noRawToken(doc('bogle_users/u-li'));

    await linkedin.disconnectLinkedIn('u-li');
    expect(doc('bogle_users/u-li')).not.toHaveProperty('linkedInTokens');
    expect(doc('bogle_users/u-li')?.name).toBe('fixture');
  });

  it('biometrics: sealed profile field, both reads, clear leaves no token field', async () => {
    const tp = await import('../../biometrics/token-persistence.js');
    const bio = {
      platform: 'oura',
      accessToken: ACCESS,
      refreshToken: REFRESH,
      tokenExpiry: new Date(),
      lastSync: new Date(),
    };
    await tp.persistTokens('u-bio', bio as never);
    const field = doc('bogle_users/u-bio')?.biometricTokens as Record<string, unknown>;
    expect(Object.keys(field)).toEqual(['encrypted']);
    noRawToken(doc('bogle_users/u-bio'));
    expect((await tp.loadTokens('u-bio'))?.accessToken).toBe(ACCESS);

    state.docs.set('bogle_users/u-old', {
      id: 'u-old',
      biometricTokens: {
        platform: 'oura',
        accessToken: ACCESS,
        refreshToken: REFRESH,
        tokenExpiry: 'x',
        lastSync: 'x',
      },
    });
    expect((await tp.loadTokens('u-old'))?.refreshToken).toBe(REFRESH);

    await tp.clearPersistedTokens('u-old');
    expect(doc('bogle_users/u-old')).not.toHaveProperty('biometricTokens');
    await tp.clearPersistedTokens('u-none'); // no profile: no throw, nothing created
    expect(doc('bogle_users/u-none')).toBeUndefined();
  });
});
