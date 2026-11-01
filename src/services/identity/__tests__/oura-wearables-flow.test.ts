/**
 * The one Oura connect path: the wearables flow (/wearables/oura/*) keeps, reads and removes
 * the person's grant in the sealed oura_tokens/{uid} store the voice agent reads too, and asks
 * Oura for exactly the scopes the Oura app registers.
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
let tokenCalls: URLSearchParams[];

function ouraGrants(accessToken: string): void {
  tokenCalls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: { body: string }) => {
      tokenCalls.push(new URLSearchParams(init.body));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_token: accessToken,
          refresh_token: `refresh-of-${accessToken}`,
          expires_in: 86400,
          token_type: 'bearer',
        }),
        text: async () => '',
      };
    })
  );
}

beforeEach(() => {
  h.db = createMergeFakeFirestore(state);
  state.docs.clear();
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  process.env.OURA_CLIENT_ID = 'oura-client';
  process.env.OURA_CLIENT_SECRET = 'oura-secret';
  process.env.OURA_REDIRECT_URI = 'https://app.ferni.ai/wearables/oura/callback';
  vi.resetModules();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.OURA_REDIRECT_URI;
});

describe('the wearables flow for Oura', () => {
  it('exchange, save, status, token and unlink all use oura_tokens/{uid}', async () => {
    const wearables = await import('../../../servers/token/oauth/wearables.js');

    ouraGrants('access-5');
    const tokens = await wearables.exchangeCode('oura', 'the-code', 'state');
    expect(tokens?.access_token).toBe('access-5');
    expect(tokenCalls[0].get('redirect_uri')).toBe('https://app.ferni.ai/wearables/oura/callback');
    expect(tokenCalls[0].get('code')).toBe('the-code');

    await wearables.saveTokens('oura', 'u1', tokens!);
    expect(doc('u1')?.encrypted).toEqual(expect.any(String));
    expect(JSON.stringify(doc('u1'))).not.toContain('access-5'); // sealed at rest

    const status = (await wearables.getAllConnectionStatuses('u1')).find(
      (s) => s.provider === 'oura'
    );
    expect(status).toMatchObject({ configured: true, linked: true });
    expect(await wearables.getValidToken('oura', 'u1')).toBe('access-5');

    await wearables.removeTokens('oura', 'u1');
    expect(doc('u1')).toBeUndefined();
    const after = (await wearables.getAllConnectionStatuses('u1')).find(
      (s) => s.provider === 'oura'
    );
    expect(after?.linked).toBe(false);
  });

  it('a person who never connected is not linked and has no token', async () => {
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    const status = (await wearables.getAllConnectionStatuses('nobody')).find(
      (s) => s.provider === 'oura'
    );
    expect(status).toMatchObject({ configured: true, linked: false });
    expect(await wearables.getValidToken('oura', 'nobody')).toBeNull();
  });

  it('one person’s unlink leaves another’s grant', async () => {
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    ouraGrants('access-a');
    await wearables.saveTokens('oura', 'u1', (await wearables.exchangeCode('oura', 'c', 's'))!);
    ouraGrants('access-b');
    await wearables.saveTokens('oura', 'u2', (await wearables.exchangeCode('oura', 'c', 's'))!);
    await wearables.removeTokens('oura', 'u1');
    expect(await wearables.getValidToken('oura', 'u2')).toBe('access-b');
  });

  it('refuses the exchange without the app credentials', async () => {
    delete process.env.OURA_CLIENT_SECRET;
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    ouraGrants('never');
    expect(await wearables.exchangeCode('oura', 'c', 's')).toBeNull();
    expect(tokenCalls).toEqual([]);
  });

  it('authorizes with exactly the registered scopes and redirect, none invented', async () => {
    const wearables = await import('../../../servers/token/oauth/wearables.js');
    const url = new URL(wearables.buildAuthUrl('oura', 'opaque-state')!);
    expect(url.searchParams.get('scope')?.split(' ').sort()).toEqual(
      ['daily', 'heartrate', 'personal', 'session', 'spo2', 'tag', 'workout'].sort()
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://app.ferni.ai/wearables/oura/callback'
    );
    expect(url.searchParams.get('state')).toBe('opaque-state');
  });
});
