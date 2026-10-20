/**
 * Keeping published sites off the app's origin.
 *
 * A published site is HTML and script written by its publisher (any signed-in
 * user), served under /sites/** on the app's own hosting. Without a sandbox its
 * script would run as the app: read the visitor's sign-in from storage and call
 * the API as them. Publishing also needs a real account.
 *
 * @module api/sites-sandbox
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { optionalAuthAsync } from './auth-middleware.js';
import { sendError } from './helpers.js';

/**
 * A published site is HTML and script written by its publisher, served from
 * the app's own host. The sandbox directive gives it an opaque origin, so its
 * script runs but cannot read the app's storage, cookies or sign-in, or call
 * the API as the visitor. No allow-same-origin: that would undo all of it.
 */
export const USER_SITE_SANDBOX = 'sandbox allow-scripts allow-forms allow-popups';

/**
 * Publishing puts content in front of other people, so it takes a real
 * account: an anonymous (guest) sign-in can't. Fails closed when no verified
 * identity is attached, except on a developer's machine.
 */
export async function refuseAnonymousPublisher(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const auth = await optionalAuthAsync(req).catch(() => null);
  const anonymous = auth ? auth.isAnonymous === true : process.env.NODE_ENV !== 'development';
  if (!anonymous) return false;
  sendError(res, 'Sign in with an account to publish a site', 403);
  return true;
}

/**
 * Headers for every response that carries a published site's own content.
 * Landing pages need LiveKit and inline scripts, so the policy is permissive
 * about sources; the sandbox is what keeps that script off the app's origin.
 */
export function userSiteHeaders(): Record<string, string> {
  const isDev = process.env.NODE_ENV === 'development';
  const connectSrc = isDev
    ? "connect-src 'self' http://localhost:* ws://localhost:* https://*.livekit.cloud wss://*.livekit.cloud https://*.firebaseio.com https://*.googleapis.com https://api.stripe.com https://api.cartesia.ai https://cdn.jsdelivr.net"
    : "connect-src 'self' https://*.livekit.cloud wss://*.livekit.cloud https://*.firebaseio.com https://*.googleapis.com https://api.stripe.com https://api.cartesia.ai https://cdn.jsdelivr.net";

  const landingPageCSP = [
    USER_SITE_SANDBOX,
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://constellation-static.web.vanguard.com data:",
    "img-src 'self' data: https: blob:",
    connectSrc,
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ].join('; ');

  return { 'Content-Security-Policy': landingPageCSP, 'X-Content-Type-Options': 'nosniff' };
}
