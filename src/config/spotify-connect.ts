/**
 * Whether the Spotify connect flow can run: the OAuth client id and secret are
 * both set. POST /auth/oauth/start answers 503 "isn't available right now"
 * when this is false (servers/api/routes/oauth-start.ts), and the music tool
 * offers a Spotify link only when it is true (music-honesty.ts).
 *
 * The route runs in the UI server and the music tool in the voice agent, each
 * with its own environment: this tests the environment it is given.
 *
 * @module config/spotify-connect
 */
import type { Env } from './env-flag.js';

export function isSpotifyConnectConfigured(env: Env = process.env): boolean {
  return !!env.SPOTIFY_CLIENT_ID && !!env.SPOTIFY_CLIENT_SECRET;
}
