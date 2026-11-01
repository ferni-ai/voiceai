/**
 * The per-user Spotify link store is delete only, and lives where account
 * deletion erases it.
 *
 * Ferni no longer links a person's Spotify (Developer Policy III.3). Up to 5
 * dev-mode accounts may still hold tokens: nothing may read or write them, an
 * unlink must remove them, and they must sit under bogle_users/{uid}, which
 * account deletion erases with everything under it (USER_RECORD_ROOTS).
 *
 * REAL token/oauth/spotify.ts; mocked: the Firestore-backed persistence store
 * (one in-memory map per collection, recording the options it was made with).
 */
import { describe, expect, it, vi } from 'vitest';
import { USER_RECORD_ROOTS } from '../../../services/platform/user-stores.js';

const collections = vi.hoisted(() => new Map<string, Map<string, unknown>>());
const options = vi.hoisted(() => [] as Array<{ collection: string; useRootCollection?: boolean }>);

vi.mock('../../../services/persistence/index.js', () => ({
  createPersistenceStore: (opts: { collection: string; useRootCollection?: boolean }) => {
    options.push(opts);
    const docs = () => {
      if (!collections.has(opts.collection)) collections.set(opts.collection, new Map());
      return collections.get(opts.collection) as Map<string, unknown>;
    };
    return {
      get: async (id: string) => docs().get(id) ?? null,
      delete: async (id: string) => void docs().delete(id),
      shutdown: async () => undefined,
    };
  },
}));

const spotify = await import('../oauth/spotify.js');

describe('Spotify link store (delete only)', () => {
  it('exposes no way to read, save or refresh a link', () => {
    expect(Object.keys(spotify).sort()).toEqual([
      'SPOTIFY_LINK_COLLECTION',
      'removeTokens',
      'shutdown',
    ]);
  });

  it("removeTokens deletes that uid's old link and no one else's", async () => {
    const links = new Map<string, unknown>([
      ['uid-A', { encrypted: 'a', updated_at: 1 }],
      ['uid-B', { encrypted: 'b', updated_at: 1 }],
    ]);
    collections.set(spotify.SPOTIFY_LINK_COLLECTION, links);

    await spotify.removeTokens('uid-A');
    expect([...links.keys()]).toEqual(['uid-B']);
  });

  it('is a per-user store under bogle_users/{uid}, which account deletion erases', () => {
    const store = options.find((o) => o.collection === spotify.SPOTIFY_LINK_COLLECTION);
    expect(store?.useRootCollection).toBe(false); // bogle_users/{uid}/spotify_links/data
    expect(USER_RECORD_ROOTS).toContain('bogle_users');
  });
});
