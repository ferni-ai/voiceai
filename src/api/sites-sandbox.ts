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

/** How a site's HTML was made. Written by the server at deploy time, never taken from a request. */
export type SiteKind = 'generated' | 'uploaded';

/**
 * Headers for every response that carries a published site's own content.
 *
 * Uploaded HTML, and any record without a known kind, is sandboxed. Pages our
 * own templates rendered (generate-and-deploy) encode every input, which
 * page-generator's template-safety test enforces, and their voice call needs
 * the app origin (device id in storage, same-origin /token, microphone). So
 * they skip the sandbox, and their policy allows only what the templates load:
 * the pinned LiveKit client, Google Fonts, /token and LiveKit. Inline script
 * stays allowed (the templates' boot script is inline); no unsafe-eval.
 */
export function siteHeaders(kind: unknown): Record<string, string> {
  const local =
    process.env.NODE_ENV === 'development' ? ' http://localhost:* ws://localhost:*' : '';
  const connect = `connect-src 'self'${local} https://*.livekit.cloud wss://*.livekit.cloud`;
  const ownPolicy =
    kind === 'generated'
      ? [
          "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net/npm/livekit-client@2.0.0/ https://cdn.jsdelivr.net/npm/livekit-client@2.1.0/",
          connect,
          "form-action 'self'",
        ]
      : [
          USER_SITE_SANDBOX,
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://apis.google.com https://js.stripe.com",
          `${connect} https://*.firebaseio.com https://*.googleapis.com https://api.stripe.com https://api.cartesia.ai https://cdn.jsdelivr.net`,
        ];

  const csp = [
    ...ownPolicy,
    "default-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com https://constellation-static.web.vanguard.com data:",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob: https:",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "base-uri 'self'",
  ].join('; ');

  return { 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' };
}
