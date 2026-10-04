/**
 * Who is on the other end of a WebSocket: decided at the upgrade, from a
 * verified Firebase ID token only.
 *
 * Node's 'upgrade' event never reaches the HTTP request listener, so
 * bindVerifiedIdentity (servers/api/request-identity.ts) does not run for
 * WebSockets. The per-user sockets used to take the user from ?userId= or
 * from a message body, so a client with no credentials could stream any
 * user's data.
 *
 * Browsers cannot set an Authorization header on a WebSocket. The client
 * offers two subprotocols: `ferni.v1` and `bearer.<token>` (every JWT
 * character is legal in a subprotocol). The token is never read from the URL:
 * Cloud Run and the Google front end log the full request URL before this
 * server sees it, so a URL token would write a live credential into request
 * logs. Each WebSocketServer selects `ferni.v1` (selectWsProtocol), so the
 * response never echoes the bearer entry.
 *
 * Only a Firebase ID token is accepted here. API keys and dev-mode headers are
 * not, so a key holder cannot name a user through X-User-Id. There is no
 * development bypass: an unverifiable token means no identity (fail closed).
 *
 * @module services/identity/ws-identity
 */
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { verifyFirebaseToken } from './firebase-auth.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'WsIdentity' });

/** The non-secret subprotocol the server selects. */
export const WS_PROTOCOL = 'ferni.v1';
const BEARER_PROTOCOL_PREFIX = 'bearer.';

/**
 * handleProtocols for every per-user WebSocketServer: select `ferni.v1`, or
 * select nothing (the browser then fails the connection). Never select, and
 * so never echo, the bearer entry.
 */
export function selectWsProtocol(protocols: Set<string>): string | false {
  return protocols.has(WS_PROTOCOL) ? WS_PROTOCOL : false;
}

/** The token from a `bearer.<token>` entry in Sec-WebSocket-Protocol. */
function bearerFromProtocols(request: IncomingMessage): string | null {
  const header = request.headers['sec-websocket-protocol'];
  const offered = typeof header === 'string' ? header.split(',') : [];
  for (const entry of offered) {
    const value = entry.trim();
    if (value.startsWith(BEARER_PROTOCOL_PREFIX) && value.length > BEARER_PROTOCOL_PREFIX.length) {
      return value.slice(BEARER_PROTOCOL_PREFIX.length);
    }
  }
  return null;
}

/**
 * Verify the Firebase ID token on a WebSocket upgrade request.
 * Returns the verified uid, or null when there is no valid token. Never throws.
 */
export async function verifyUpgradeIdentity(request: IncomingMessage): Promise<string | null> {
  const token = bearerFromProtocols(request);
  if (!token) return null;
  try {
    const verified = await verifyFirebaseToken(token);
    if (!verified || 'expired' in verified) return null;
    return verified.uid || null;
  } catch (error) {
    // Verifier unavailable (e.g. Firebase not initialized in production).
    log.warn({ error: String(error) }, 'WebSocket token verification failed; rejecting');
    return null;
  }
}

/** Refuse an upgrade that carries no verified identity. */
export function rejectUpgrade(socket: Duplex): void {
  if (socket.writable) {
    socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  }
  socket.destroy();
}

/** The pathname of an upgrade request (no query). */
export function upgradePath(request: IncomingMessage): string {
  return new URL(request.url || '/', 'http://local').pathname;
}
