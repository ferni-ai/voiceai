/**
 * Authenticates Twilio media-stream WebSocket handshakes for the stream bridge.
 *
 * @module services/voice/twilio-stream-auth
 */

import type { IncomingMessage } from 'http';
import { validateTwilioSignature } from '../outreach/webhooks/twilio-webhooks.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'twilio-stream-auth' });

/**
 * True only when the WebSocket handshake carries a valid X-Twilio-Signature.
 *
 * Every stream's `start` message becomes a live call: its customParameters pick
 * the room and are dispatched to the voice agent. Without this check anyone who
 * can reach the endpoint could open a stream and start a call that names any
 * user. Twilio signs the handshake over the wss:// URL it called (Twilio's
 * security docs note a trailing "/" sometimes has to be added), so the URL is
 * rebuilt behind the proxy and each spelling of it is tried. With no auth token
 * configured the validator refuses everything.
 */
export function isTwilioSignedHandshake(req: IncomingMessage): boolean {
  const signature = req.headers['x-twilio-signature'];
  if (typeof signature !== 'string' || !signature) return false;

  const forwarded = req.headers['x-forwarded-host'];
  const host =
    (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || req.headers.host;
  const pathAndQuery = req.url || '/';
  const [path, query] = pathAndQuery.split('?', 2);
  const suffix = query === undefined ? '' : `?${query}`;
  const paths = path.endsWith('/') ? [path] : [path, `${path}/`];

  const urls = host
    ? ['wss', 'https'].flatMap((scheme) => paths.map((p) => `${scheme}://${host}${p}${suffix}`))
    : [];
  // The URL our TwiML told Twilio to open is what Twilio signs, whatever host
  // header the request arrives with behind the proxy.
  const configured = process.env.TWILIO_STREAM_WEBHOOK_URL;
  if (configured) urls.push(configured, configured.endsWith('/') ? configured : `${configured}/`);

  return urls.some((url) => validateTwilioSignature(signature, url, {}));
}

export function rejectHandshake(
  socket: { write: (s: string) => void; destroy: () => void },
  url?: string
) {
  log.warn({ url }, 'Rejected Twilio stream connection without a valid Twilio signature');
  socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  socket.destroy();
}
