/**
 * Oura grant lifecycle: a refresh Oura refuses with invalid_grant means "connect again"
 * (kept on the record, the grant is not deleted), anything else is "unavailable" and
 * marks nothing; disconnect revokes at Oura and deletes; the wearables flow hands its
 * exchange, save, unlink and status to this store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof createMergeFakeFirestore>,
}));

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: async () => null,
    setImmediate: async () => undefined,
    delete: async () => undefined,
    shutdown: async () => undefined,
  }),
}));

const state = newMergeFakeState();
const doc = (uid: string) => state.docs.get(`oura_tokens/${uid}`);
const HOUR = 3600 * 1000;

type Reply = { status: number; body: unknown };
let replies: Array<(url: string) => Reply | undefined>;
let fetchCalls: string[];

function stubOura(...handlers: Array<(url: string) => Reply | undefined>): void {
  replies = handlers;
  fetchCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      fetchCalls.push(url);
      const hit = replies.map((r) => r(url)).find(Boolean) ?? { status: 404, body: {} };
      return {
        ok: hit.status >= 200 && hit.status < 300,
        status: hit.status,
        json: async () => hit.body,
        text: async () => JSON.stringify(hit.body),
      };
    })
  );
}
const tokenEndpoint = (r: Reply) => (url: string) =>
  url.startsWith('https://api.ouraring.com/oauth/token') ? r : undefined;
const revokeEndpoint = (r: Reply) => (url: string) =>
  url.startsWith('https://api.ouraring.com/oauth/revoke') ? r : undefined;
const granted = (n: number) => ({
  status: 200,
  body: {
    access_token: `access-${n}`,
    refresh_token: `refresh-${n}`,
    expires_in: 86400,
    token_type: 'bearer',
  },
});

async function load() {
  vi.resetModules();
  return import('../oura-auth.js');
}

/** A person whose grant lapsed an hour ago, so the next read has to refresh. */
async function seedExpired(oura: Awaited<ReturnType<typeof load>>, uid = 'u1') {
  await oura.saveOuraTokens(uid, {
    access_token: 'access-old',
    refresh_token: 'refresh-old',
    expires_at: Date.now() - HOUR,
    token_type: 'bearer',
  });
}

beforeEach(() => {
  h.db = createMergeFakeFirestore(state);
  state.docs.clear();
  state.writes.length = 0;
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  process.env.OURA_CLIENT_ID = 'oura-client';
  process.env.OURA_CLIENT_SECRET = 'oura-secret';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('reading a grant', () => {
  it('says not_connected when the person never connected', async () => {
    const oura = await load();
    expect(await oura.getOuraAccessToken('nobody')).toEqual({ status: 'not_connected' });
    expect(await oura.getOuraLink('nobody')).toBe('not_connected');
  });

  it('returns the stored token while it is fresh, with no call to Oura', async () => {
    const oura = await load();
    stubOura();
    await oura.saveOuraTokens('u1', {
      access_token: 'access-live',
      refresh_token: 'refresh-live',
      expires_at: Date.now() + HOUR,
      token_type: 'bearer',
    });
    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'ok', token: 'access-live' });
    expect(fetchCalls).toEqual([]);
  });

  it('refreshes a lapsed token and keeps the rotated pair', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint(granted(2)));
    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'ok', token: 'access-2' });
    const body = JSON.stringify(doc('u1'));
    expect(body).not.toContain('access-2'); // sealed at rest
    expect(doc('u1')?.needsReauthAt).toBeUndefined();
  });

  it('two reads at once make one refresh (Oura refresh tokens are single-use)', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint(granted(2)));
    const [a, b] = await Promise.all([
      oura.getOuraAccessToken('u1'),
      oura.getOuraAccessToken('u1'),
    ]);
    expect(a).toEqual({ status: 'ok', token: 'access-2' });
    expect(b).toEqual(a);
    expect(fetchCalls).toHaveLength(1);
  });
});

describe('a refresh Oura refuses', () => {
  it('invalid_grant is needs_reauth: kept on the record, grant not deleted, asked only once', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } }));

    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'needs_reauth' });
    expect(doc('u1')?.needsReauthAt).toEqual(expect.any(String));
    expect(doc('u1')?.encrypted).toEqual(expect.any(String));
    expect(await oura.getOuraLink('u1')).toBe('needs_reauth');

    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'needs_reauth' });
    expect(fetchCalls).toHaveLength(1);
  });

  it('survives a restart: another process reading the record also says needs_reauth', async () => {
    const first = await load();
    await seedExpired(first);
    stubOura(tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } }));
    await first.getOuraAccessToken('u1');

    const second = await load(); // a fresh process: empty cache
    expect(await second.getOuraAccessToken('u1')).toEqual({ status: 'needs_reauth' });
    expect(fetchCalls).toHaveLength(1);
  });

  it.each([
    ['a server error', 503, { error: 'unavailable' }],
    ['our own client being refused', 401, { error: 'invalid_client' }],
    ['a bad request that is not a revoked grant', 400, { error: 'invalid_request' }],
  ])('%s is unavailable and marks nothing', async (_name, status, body) => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint({ status, body }));
    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'unavailable' });
    expect(doc('u1')?.needsReauthAt).toBeUndefined();
    expect(await oura.getOuraLink('u1')).toBe('connected');
  });

  it('a network failure is unavailable, not needs_reauth', async () => {
    const oura = await load();
    await seedExpired(oura);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('socket hang up')))
    );
    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'unavailable' });
    expect(doc('u1')?.needsReauthAt).toBeUndefined();
  });

  it('a token the agent already rotated is used, not flagged (the refresh race)', async () => {
    const oura = await load();
    await seedExpired(oura);
    // The other process rotates the pair while ours is in flight; Oura then refuses our spent token.
    const other = await load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await other.saveOuraTokens('u1', {
          access_token: 'access-rotated',
          refresh_token: 'refresh-rotated',
          expires_at: Date.now() + HOUR,
          token_type: 'bearer',
        });
        const body = { error: 'invalid_grant' };
        return {
          ok: false,
          status: 400,
          json: async () => body,
          text: async () => JSON.stringify(body),
        };
      })
    );
    await oura.getOuraLink('u1'); // load into cache
    const result = await oura.getOuraAccessToken('u1');
    expect(result).toEqual({ status: 'ok', token: 'access-rotated' });
    expect(doc('u1')?.needsReauthAt).toBeUndefined();
  });

  it('connecting again clears needs_reauth', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } }));
    await oura.getOuraAccessToken('u1');

    stubOura(tokenEndpoint(granted(3)));
    const fresh = await oura.exchangeAuthorizationCode(
      'code',
      'https://app.ferni.ai/wearables/oura/callback'
    );
    await oura.saveOuraTokens('u1', fresh!);
    expect(await oura.getOuraLink('u1')).toBe('connected');
    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'ok', token: 'access-3' });
    expect(doc('u1')?.needsReauthAt).toBeUndefined();
  });
});

describe('code exchange', () => {
  it('a refused code saves nothing', async () => {
    const oura = await load();
    stubOura(tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } }));
    expect(await oura.exchangeAuthorizationCode('bad', 'https://x/cb')).toBeNull();
    expect(state.docs.size).toBe(0);
  });
});

describe('disconnect', () => {
  it('revokes at Oura with the stored token, then deletes the record', async () => {
    const oura = await load();
    stubOura();
    await oura.saveOuraTokens('u1', {
      access_token: 'access-live',
      refresh_token: 'refresh-live',
      expires_at: Date.now() + HOUR,
      token_type: 'bearer',
    });
    stubOura(revokeEndpoint({ status: 200, body: {} }));
    expect(await oura.disconnectOura('u1')).toEqual({ revoked: true });
    expect(fetchCalls).toEqual(['https://api.ouraring.com/oauth/revoke?access_token=access-live']);
    expect(doc('u1')).toBeUndefined();
    expect(await oura.getOuraLink('u1')).toBe('not_connected');
  });

  it('deletes the record even when Oura does not confirm, and says so', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(revokeEndpoint({ status: 500, body: {} }));
    expect(await oura.disconnectOura('u1')).toEqual({ revoked: false });
    expect(doc('u1')).toBeUndefined();
  });
});

describe('the wearables flow, with Oura revoking', () => {
  it('unlink revokes at Oura with the stored token, then deletes the record', async () => {
    const oura = await load();
    stubOura();
    await oura.saveOuraTokens('u1', {
      access_token: 'access-5',
      refresh_token: 'refresh-5',
      expires_at: Date.now() + HOUR,
      token_type: 'bearer',
    });
    vi.resetModules();
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    stubOura(revokeEndpoint({ status: 200, body: {} }));
    await wearables.removeTokens('oura', 'u1');
    expect(fetchCalls[0]).toContain('/oauth/revoke?access_token=access-5');
    expect(doc('u1')).toBeUndefined();
  });

  it('status says needs_reauth and not linked after Oura revokes the grant', async () => {
    const oura = await load();
    await seedExpired(oura);
    stubOura(tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } }));
    await oura.getOuraAccessToken('u1');

    vi.resetModules();
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    const status = (await wearables.getAllConnectionStatuses('u1')).find(
      (s) => s.provider === 'oura'
    );
    expect(status).toMatchObject({ linked: false, needs_reauth: true });
    expect(await wearables.getValidToken('oura', 'u1')).toBeNull();
  });

  it('a connected person’s status carries no needs_reauth', async () => {
    const oura = await load();
    await oura.saveOuraTokens('u1', {
      access_token: 'a',
      refresh_token: 'r',
      expires_at: Date.now() + HOUR,
      token_type: 'bearer',
    });
    vi.resetModules();
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    const status = (await wearables.getAllConnectionStatuses('u1')).find(
      (s) => s.provider === 'oura'
    );
    expect(status).toMatchObject({ linked: true });
    expect(status?.needs_reauth).toBeUndefined();
  });
});
