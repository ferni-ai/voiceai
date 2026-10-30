/**
 * With TOKEN_SEALING_KEY set, reading a Google Calendar link sealed under the
 * old key (LOG_HASH_SECRET) moves it to the new one; a key that opens nothing
 * reads as "not connected".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { createLogger: () => logger, getLogger: () => logger };
});

const db = vi.hoisted(() => ({ doc: null as { encrypted: string; updated_at: number } | null }));
const setImmediate = vi.hoisted(() => vi.fn());
vi.mock('../../persistence/index.js', () => ({
  createPersistenceStore: () => ({
    get: async () => db.doc,
    load: async () => db.doc,
    setImmediate: async (_uid: string, data: { encrypted: string; updated_at: number }) => {
      setImmediate(data);
      db.doc = data;
    },
    delete: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  }),
}));

const { getTokens, shutdownTokenStore } = await import('../google-calendar-token-store.js');
const { encryptData, keyIdOf } = await import('../../../utils/token-encryption.js');

const SEAL = Buffer.alloc(32, 7).toString('base64');
const LEGACY = 'fixture-log-hash-secret';
const TOKENS = { access_token: 'at', refresh_token: 'rt', expires_at: 1_900_000_000_000 };
const saved = { ...process.env };
const kid = () => (JSON.parse(db.doc!.encrypted) as { kid: string }).kid;

describe('google calendar token store re-seal on read', () => {
  beforeEach(async () => {
    await shutdownTokenStore();
    setImmediate.mockClear();
    delete process.env.TOKEN_SEALING_KEY;
    delete process.env.OAUTH_ENCRYPTION_KEY;
    process.env.LOG_HASH_SECRET = LEGACY;
    db.doc = { encrypted: encryptData(TOKENS), updated_at: 123 };
  });
  afterEach(() => Object.assign(process.env, saved));

  it('re-seals a legacy link on first read and keeps updated_at', async () => {
    process.env.TOKEN_SEALING_KEY = SEAL;
    expect(await getTokens('u1')).toEqual(TOKENS);
    await vi.waitFor(() => expect(setImmediate).toHaveBeenCalledTimes(1));
    expect(kid()).toBe(keyIdOf(SEAL));
    expect(db.doc!.updated_at).toBe(123);

    delete process.env.LOG_HASH_SECRET; // rotated away
    await shutdownTokenStore();
    expect(await getTokens('u1')).toEqual(TOKENS);
  });

  it('without TOKEN_SEALING_KEY the stored link is never rewritten', async () => {
    const before = db.doc!.encrypted;
    expect(await getTokens('u2')).toEqual(TOKENS);
    await new Promise((r) => setTimeout(r, 20));
    expect(setImmediate).not.toHaveBeenCalled();
    expect(db.doc!.encrypted).toBe(before);
  });

  it('a link no key opens reads as not connected, and is not touched', async () => {
    process.env.TOKEN_SEALING_KEY = SEAL;
    process.env.LOG_HASH_SECRET = 'a-different-log-secret';
    const before = db.doc!.encrypted;
    expect(await getTokens('u3')).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(setImmediate).not.toHaveBeenCalled();
    expect(db.doc!.encrypted).toBe(before);
  });
});
