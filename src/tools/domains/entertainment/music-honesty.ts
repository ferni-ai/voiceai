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
 * - the notices that used to say "link Spotify" say what is true, and offer a
 *   link only when the connect route is configured (config/spotify-connect.ts)
 *   and the reason is not a revoked house token, which a caller's own link
 *   does not repair.
 * With it off every string below is the one main shipped.
 *
 * @module tools/domains/entertainment/music-honesty
 */
import { flagOn, type Env } from '../../../config/env-flag.js';
import { isSpotifyConnectConfigured } from '../../../config/spotify-connect.js';
import {
  getSpotifyAccessToken,
  isSpotifyConfigured,
  isSpotifyRefreshRevoked,
} from '../../../services/identity/spotify-auth.js';

/** Why Spotify can't be used: no client or token set, token revoked, or the refresh failed. */
type SpotifyUnavailableReason = 'not_configured' | 'revoked' | 'auth_failed';

const LEGACY_HINT = '\n\nPS: Link your Spotify for full songs instead of previews!';
const LEGACY_NOT_LINKED =
  "Spotify isn't linked yet. Link your account in settings to enjoy full songs!";
const PREVIEWS_ONLY = "Spotify isn't connected right now, so I can only play short previews.";

export function musicHonestOn(env: Env = process.env): boolean {
  return flagOn('MUSIC_HONEST_WHEN_UNLINKED', env);
}

function spotifyUnavailableReason(): SpotifyUnavailableReason {
  if (!isSpotifyConfigured()) return 'not_configured';
  return isSpotifyRefreshRevoked() ? 'revoked' : 'auth_failed';
}

/** A link only helps when the connect route works and the house token isn't what's broken. */
function mayOfferLink(reason: SpotifyUnavailableReason, env: Env): boolean {
  return reason !== 'revoked' && isSpotifyConnectConfigured(env);
}

/** The PS after an iTunes preview when Spotify isn't linked. */
export function previewLinkHint(spotifyLinked: boolean, env: Env = process.env): string {
  if (spotifyLinked) return '';
  if (!musicHonestOn(env)) return LEGACY_HINT;
  return mayOfferLink(spotifyUnavailableReason(), env) ? LEGACY_HINT : '';
}

/** What useSpotify says when Spotify isn't linked. */
export function notLinkedReply(env: Env = process.env): string {
  if (!musicHonestOn(env)) return LEGACY_NOT_LINKED;
  const offer = mayOfferLink(spotifyUnavailableReason(), env)
    ? ' You can link it in settings.'
    : '';
  return PREVIEWS_ONLY + offer;
}

/** Told to the model with the first ambient preview of a call (flag on). */
export function honestPreviewNotice(env: Env = process.env): string {
  const offer = mayOfferLink(spotifyUnavailableReason(), env)
    ? ' Offer to link Spotify for full songs.'
    : '';
  return ` These are 30-second previews because Spotify isn't connected right now. Say so once, briefly.${offer}`;
}

/**
 * The reply to a request for a Spotify song when Spotify can't be used, or
 * null to carry on as before (flag off, or a token turns out to work).
 */
export async function listeningUnavailable(env: Env = process.env): Promise<string | null> {
  if (!musicHonestOn(env)) return null;
  if (await getSpotifyAccessToken()) return null;
  const reason = spotifyUnavailableReason();
  const offer = mayOfferLink(reason, env) ? ' You can link it in settings.' : '';
  return JSON.stringify({
    spotify: 'unavailable',
    reason,
    say: `${PREVIEWS_ONLY}${offer} Want a preview?`,
  });
}
