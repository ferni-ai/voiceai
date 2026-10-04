/**
 * Open a per-user WebSocket as the signed-in user.
 *
 * The server's per-user sockets (/ws/life-context, /ws/insights,
 * /ws/user-events, /ws/director) take the user from a verified Firebase ID
 * token at the upgrade. Without one the upgrade is refused (401), and any
 * userId the client names, in the URL or in a message, is ignored.
 *
 * Browsers cannot set an Authorization header on a WebSocket, so the token is
 * offered as a `bearer.<token>` subprotocol next to `ferni.v1`, which the
 * server selects. It never goes in the URL: Cloud Run and the Google front end
 * log the full request URL, which would write a live credential into logs.
 *
 * @module services/authed-websocket
 */
import { getAuthToken } from './firebase-auth.service.js';

/** The non-secret subprotocol the server selects. */
export const WS_PROTOCOL = 'ferni.v1';

/**
 * Open `url` with the signed-in user's ID token. `userId` and `token` query
 * parameters are dropped: the server ignores them, so sending them only leaks.
 * Throws when no one is signed in, so callers' existing error paths run.
 */
export async function openAuthedWebSocket(url: string): Promise<WebSocket> {
  const token = await getAuthToken();
  if (!token) {
    throw new Error('Not signed in: per-user WebSockets need a Firebase ID token');
  }
  const target = new URL(url);
  target.searchParams.delete('userId');
  target.searchParams.delete('token');
  return new WebSocket(target.toString(), [WS_PROTOCOL, `bearer.${token}`]);
}
