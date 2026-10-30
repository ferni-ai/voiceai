/**
 * Whether a caller has linked Spotify: a read-only look at the grant the
 * Spotify connect callback writes (servers/token/oauth/spotify.ts, which owns
 * the record and its encryption), bogle_users/{uid}/spotify_links/data.
 *
 * Only presence is read, never the token. The collection name is repeated
 * here because services/ can't import from servers/; a test pins the two
 * together. When the generic user OAuth store lands (lane S2) this reader
 * moves onto it.
 *
 * @module services/identity/spotify-link-status
 */
import { createPersistenceStore } from '../persistence/index.js';

const store = createPersistenceStore<{ encrypted: string; updated_at: number }>({
  collection: 'spotify_links',
  holdWrites: () => false, // MINOR_CARE opt-out: credentials, not the caller's words
  documentId: 'data',
  useRootCollection: false, // bogle_users/{uid}/spotify_links/data
  syncIntervalMs: 2000,
});

/** Whether the user has a Spotify link. Throws when Firestore can't be read. */
export async function hasSpotifyLink(userId: string): Promise<boolean> {
  return !!(await store.load(userId, { fresh: true, strict: true }))?.encrypted;
}
