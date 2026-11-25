/**
 * Who is told when the house Spotify token is found revoked or a new one is
 * stored (spotify-auth.ts reports both), so tools can follow Spotify's state
 * without polling.
 *
 * @module services/identity/spotify-availability
 */
import { getLogger } from '../../utils/safe-logger.js';

const listeners = new Set<() => void>();

/** Subscribe to Spotify availability changes; returns the unsubscribe. */
export function onSpotifyAvailabilityChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tell every listener; one that throws is logged and the rest still run. */
export function notifySpotifyAvailabilityChange(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      getLogger().warn({ error: String(error) }, 'Spotify availability listener failed');
    }
  }
}
