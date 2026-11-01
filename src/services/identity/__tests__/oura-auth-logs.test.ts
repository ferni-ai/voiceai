/**
 * Oura grant logs carry the error's name, the HTTP status and the endpoint, never a token.
 * A JSON parse error's message quotes the body it choked on, and on the token endpoint that
 * body is the grant itself; the revoke request's URL carries the access token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMergeFakeFirestore,
  newMergeFakeState,
} from '../../../tests/helpers/merge-fake-firestore.js';

const h = vi.hoisted(() => ({
  db: null as unknown,
  logged: [] as unknown[],
}));

vi.mock('../../superhuman/firestore-utils.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../superhuman/firestore-utils.js')>()),
  getFirestoreDb: () => h.db,
}));
vi.mock('../../../utils/safe-logger.js', async (importOriginal) => {
  const keep = (...args: unknown[]) => void h.logged.push(args);
  const logger = () => ({ debug: keep, info: keep, warn: keep, error: keep });
  return {
    ...(await importOriginal<typeof import('../../../utils/safe-logger.js')>()),
    createLogger: logger,
    getLogger: logger,
  };
});

const state = newMergeFakeState();
const TOKEN_URL = 'https://api.ouraring.com/oauth/token';
const HOUR = 3600 * 1000;
// A 200 whose body is not JSON but carries token material.
const RAW = 'access_token=FAKE123&refresh_token=FAKE456';
// No log line may carry any of these.
const SECRET_PARTS = ['access_tok', 'FAKE123', 'FAKE456', 'refresh_token=', 'access-live'];

/** Every call to Oura answers 200 with the raw, non-JSON body. */
function stubRawBody(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(RAW, { status: 200 }))
  );
}

function expectNoSecret(): void {
  const text = JSON.stringify(h.logged);
  for (const part of SECRET_PARTS) expect(text).not.toContain(part);
}

async function load() {
  vi.resetModules();
  return import('../oura-auth.js');
}

beforeEach(() => {
  h.db = createMergeFakeFirestore(state);
  state.docs.clear();
  state.writes.length = 0;
  h.logged.length = 0;
  process.env.OAUTH_ENCRYPTION_KEY = 'fixture-encryption-key';
  process.env.OURA_CLIENT_ID = 'oura-client';
  process.env.OURA_CLIENT_SECRET = 'oura-secret';
});
afterEach(() => vi.unstubAllGlobals());

describe('oura-auth logs', () => {
  it('a refresh answer that is not JSON is logged by error name, status and endpoint', async () => {
    const oura = await load();
    await oura.saveOuraTokens('u1', {
      access_token: 'access-old',
      refresh_token: 'refresh-old',
      expires_at: Date.now() - HOUR,
      token_type: 'bearer',
    });
    h.logged.length = 0;
    stubRawBody();

    expect(await oura.getOuraAccessToken('u1')).toEqual({ status: 'unavailable' });

    expect(h.logged).toEqual([
      [
        { error: 'SyntaxError', status: 200, endpoint: TOKEN_URL, userId: 'u1' },
        'Error refreshing Oura token',
      ],
    ]);
    expectNoSecret();
  });

  it('a code exchange answer that is not JSON is logged without the body', async () => {
    const oura = await load();
    stubRawBody();

    expect(await oura.exchangeAuthorizationCode('code-1', 'https://ferni.test/cb')).toBeNull();

    expect(h.logged).toEqual([
      [{ error: 'SyntaxError', status: 200, endpoint: TOKEN_URL }, 'Error exchanging Oura code'],
    ]);
    expectNoSecret();
  });

  it('a revoke that throws is logged without the URL that carries the access token', async () => {
    const oura = await load();
    await oura.saveOuraTokens('u1', {
      access_token: 'access-live',
      refresh_token: 'refresh-live',
      expires_at: Date.now() + HOUR,
      token_type: 'bearer',
    });
    h.logged.length = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        throw new TypeError(`fetch failed for ${String(input)}`);
      })
    );

    expect(await oura.disconnectOura('u1')).toEqual({ revoked: false });

    expect(h.logged).toContainEqual([
      { error: 'TypeError', endpoint: 'https://api.ouraring.com/oauth/revoke', userId: 'u1' },
      'Oura revoke request failed',
    ]);
    expectNoSecret();
  });
});
