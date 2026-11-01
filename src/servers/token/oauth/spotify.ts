/**
 * Per-user Spotify links: delete only.
 *
 * Ferni does not link a person's own Spotify account (Spotify Developer Policy
 * III.3 bars voice assistants that control Spotify, and Development Mode caps an
 * app at 5 users). Music is Sonos favourites, Apple MusicKit on device, and
 * links; the house account behind ambient playback is separate
 * (services/identity/spotify-auth.ts). Up to 5 dev-mode accounts linked before
 * 2026-10-30 may still have tokens here. Nothing reads them: they can only be
 * removed, by GET /spotify/unlink (routes/spotify.ts) or by account deletion,
 * which erases bogle_users/{uid} and everything under it
 * (services/platform/user-stores.ts USER_RECORD_ROOTS).
 */

import { createPersistenceStore } from '../../../services/persistence/index.js';
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'SpotifyLinks' });

/** Encrypted token data stored in Firestore */
interface EncryptedTokenData {
  encrypted: string;
  updated_at: number;
}

// bogle_users/{uid}/spotify_links/data, keyed by the verified Ferni uid.
export const SPOTIFY_LINK_COLLECTION = 'spotify_links';
const tokenStore = createPersistenceStore<EncryptedTokenData>({
  collection: SPOTIFY_LINK_COLLECTION,
  holdWrites: () => false, // MINOR_CARE opt-out: credentials, not the caller's words
  documentId: 'data',
  useRootCollection: false, // under bogle_users/{uid}, so account deletion erases it
  syncIntervalMs: 2000,
});

/** Remove a Ferni user's old Spotify link, if there is one. */
export async function removeTokens(userId: string): Promise<void> {
  try {
    await tokenStore.delete(userId);
    log.info({ userId: userId.substring(0, 8) }, 'Removed Spotify link tokens');
  } catch (err) {
    log.error(
      { error: (err as Error).message, userId: userId.substring(0, 8) },
      'Error removing Spotify link tokens'
    );
  }
}

/** Flush and stop the link store. */
export async function shutdown(): Promise<void> {
  await tokenStore.shutdown();
}
