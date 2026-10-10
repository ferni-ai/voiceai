/**
 * Spotify links are read only from the uid-keyed collection.
 *
 * The old spotify_oauth_tokens collection was keyed by a device_id the client
 * named in /spotify/login, so anyone could have saved their own Spotify link
 * under another person's uid. Now links are keyed by the verified uid; reading
 * the old collection by uid would hand the victim the attacker's planted link.
 *
 * REAL token/oauth/spotify.ts; mocked: the Firestore-backed persistence store
 * (one in-memory map per collection) and token encryption.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());

vi.mock('../../../services/persistence/index.js', () => ({
  // Reads go through the shared map each call, so a test can seed any collection.
  createPersistenceStore: ({ collection }: { collection: string }) => {
    const docs = () => {
      if (!collections.has(collection)) collections.set(collection, new Map());
      return collections.get(collection) as Map<string, unknown>;
    };
    return {
      get: async (id: string) => docs().get(id) ?? null,
      setImmediate: async (id: string, value: unknown) => void docs().set(id, value),
      delete: async (id: string) => void docs().delete(id),
      shutdown: async () => undefined,
    };
  },
}));
vi.mock('../../shared/encryption.js', () => ({
  encryptData: (v: unknown) => JSON.stringify(v),
  decryptData: (v: string) => JSON.parse(v) as unknown,
}));

const spotify = await import('../oauth/spotify.js');

const planted = { access_token: 'attacker-access', refresh_token: 'r', expires_at: 9e15 };

beforeEach(async () => {
  collections.clear();
  await spotify.removeTokens('uid-victim'); // clears the module's decrypted cache
});

describe('Spotify link store', () => {
  it('never reads a record planted under a uid in the old device-keyed collection', async () => {
    const legacy = new Map<string, unknown>([
      ['uid-victim', { encrypted: JSON.stringify(planted), updated_at: 1 }],
    ]);
    collections.set('spotify_oauth_tokens', legacy);

    expect(spotify.SPOTIFY_LINK_COLLECTION).not.toBe('spotify_oauth_tokens');
    expect(await spotify.getTokens('uid-victim')).toBeNull();
    expect(await spotify.getValidToken('uid-victim')).toBeNull();
  });

  it('round-trips a link saved for the uid', async () => {
    await spotify.saveTokens('uid-victim', { ...planted, access_token: 'own-access' });
    expect(collections.get(spotify.SPOTIFY_LINK_COLLECTION)?.has('uid-victim')).toBe(true);
    expect(await spotify.getValidToken('uid-victim')).toBe('own-access');
  });
});
