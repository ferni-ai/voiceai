/**
 * Music that says so when Spotify isn't connected (MUSIC_HONEST_WHEN_UNLINKED).
 *
 * The shared house Spotify refresh token was revoked (invalid_grant) on
 * 2026-10-22, and every music request fell back to a 30-second iTunes preview
 * without a word. The tool also told callers to "link your account in
 * settings", but the connect route answers 503 where no client secret is set,
 * and the agent plays from the one house token whoever links (integration
 * audit, 2026-10-29).
 *
 * With the flag on:
 * - a request for a Spotify song (listening intent) gets a structured
 *   `spotify: unavailable` result with the reason class and a short true line,
 *   and asks before playing a preview;
 * - the notices say Spotify isn't connected right now.
 * No string offers to link Spotify, flag on or off: per-user Spotify will not
 * be built (Spotify Developer Policy III.3 bans voice-assistant control), so
 * Ferni can't play from a caller's own account. What works is the in-house
 * player: full songs while the house Spotify works, 30-second previews when
 * it doesn't (honest-promises sweep, 2026-10-30).
 *
 * @module tools/domains/entertainment/music-honesty
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import {
  getSpotifyAccessToken,
  isSpotifyConfigured,
  isSpotifyRefreshRevoked,
} from '../../../services/identity/spotify-auth.js';

/** Why Spotify can't be used: no client or token set, token revoked, or the refresh failed. */
type SpotifyUnavailableReason = 'not_configured' | 'revoked' | 'auth_failed';

const PREVIEWS_ONLY = "Spotify isn't connected right now, so I can only play short previews.";
/** Said instead of offering to link Spotify, which can't be done. */
export const NOT_YOUR_SPOTIFY = "I can't play from your own Spotify account.";
/** Told to the model with preview notices: there is no link path to offer. */
export const NO_LINK_OFFER =
  "Don't offer to link their Spotify: Ferni can't play from a caller's own account.";

export function musicHonestOn(env: Env = process.env): boolean {
  return flagOn('MUSIC_HONEST_WHEN_UNLINKED', env);
}

function spotifyUnavailableReason(): SpotifyUnavailableReason {
  if (!isSpotifyConfigured()) return 'not_configured';
  return isSpotifyRefreshRevoked() ? 'revoked' : 'auth_failed';
}

/** What useSpotify says when Spotify isn't linked, flag on or off. */
export function notLinkedReply(): string {
  return `${PREVIEWS_ONLY} ${NOT_YOUR_SPOTIFY}`;
}

/** Told to the model with the first ambient preview of a call (flag on). */
export function honestPreviewNotice(): string {
  return ` These are 30-second previews because Spotify isn't connected right now. Say so once, briefly. ${NO_LINK_OFFER}`;
}

/**
 * The reply to a request for a Spotify song when Spotify can't be used, or
 * null to carry on as before (flag off, or a token turns out to work).
 */
export async function listeningUnavailable(env: Env = process.env): Promise<string | null> {
  if (!musicHonestOn(env)) return null;
  if (await getSpotifyAccessToken()) return null;
  return JSON.stringify({
    spotify: 'unavailable',
    reason: spotifyUnavailableReason(),
    say: `${PREVIEWS_ONLY} Want a preview?`,
  });
}
