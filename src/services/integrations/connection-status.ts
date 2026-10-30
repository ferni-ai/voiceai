/**
 * Has this caller linked this provider? One answer, read from the stores the
 * connect callbacks actually write.
 *
 * IntegrationHub.isConnectedAsync reads users/{uid}/oauth_tokens/{provider},
 * which no connect flow writes, so the service-availability note told every
 * caller "Google Calendar / Spotify / Gmail: NOT CONNECTED, do not offer",
 * linked or not. The real records are bogle_users/{uid}/google_calendar_tokens
 * (Calendar and Gmail share one Google grant) and bogle_users/{uid}/spotify_links.
 *
 * Four answers, and a read failure is its own: 'unknown'. Callers must not
 * turn 'unknown' into "not connected" (that is how a linked caller gets
 * refused) or into "connected".
 *
 * @module services/integrations/connection-status
 */
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ConnectionStatus' });

export type LinkProvider = 'google_calendar' | 'gmail' | 'spotify';
export type LinkState = 'connected' | 'needs_reauth' | 'not_connected' | 'unknown';

const GMAIL_READ_SCOPE = 'gmail.readonly';

/** Providers this reader covers; anything else is not its to answer. */
export function isLinkProvider(id: string): id is LinkProvider {
  return id === 'google_calendar' || id === 'gmail' || id === 'spotify';
}

async function googleState(
  userId: string,
  provider: 'google_calendar' | 'gmail'
): Promise<LinkState> {
  const { readTokenState } = await import('../identity/google-calendar-token-store.js');
  const state = await readTokenState(userId);
  if (state.kind === 'absent') return 'not_connected';
  if (state.kind === 'unreadable') return 'unknown'; // linked, but this process can't open it
  const { tokens } = state;
  // Gmail rides the Calendar grant: a grant whose recorded scopes lack Gmail
  // (consent screen box unticked) has no inbox. Unrecorded scopes are not held against it.
  if (provider === 'gmail' && tokens.scope && !tokens.scope.includes(GMAIL_READ_SCOPE)) {
    return 'not_connected';
  }
  const { isTokenPermanentlyFailed } = await import('../identity/google-calendar-oauth.js');
  const cannotRefresh = !tokens.refresh_token && tokens.expires_at <= Date.now();
  return isTokenPermanentlyFailed(userId) || cannotRefresh ? 'needs_reauth' : 'connected';
}

async function spotifyState(userId: string): Promise<LinkState> {
  const { hasSpotifyLink } = await import('../identity/spotify-link-status.js');
  return (await hasSpotifyLink(userId)) ? 'connected' : 'not_connected';
}

/** The caller's link state for one provider. Never throws. */
export async function getLinkState(userId: string, provider: LinkProvider): Promise<LinkState> {
  try {
    return provider === 'spotify'
      ? await spotifyState(userId)
      : await googleState(userId, provider);
  } catch (error) {
    log.warn(
      { provider, userId: userId.substring(0, 8), error: String(error) },
      'Link state unknown'
    );
    return 'unknown';
  }
}
