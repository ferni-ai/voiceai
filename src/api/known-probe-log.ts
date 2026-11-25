/**
 * The log line for a request with no credential, for a poll the platform sends us.
 *
 * LiveKit Cloud checks each pod with `GET /worker`, the status route of the LiveKit agents SDK
 * (`@livekit/agents` http_server.js). Our worker does not run the SDK's worker, so the route is
 * not served here, and it needs an admin like any other route that is not public. Prod showed one
 * poll per pod about every 5 minutes, 14 warnings an hour, once #3763 made 401 the answer (#4292).
 *
 * The 401 stays. For an exact `/worker` the first one per process is logged at info with the
 * user-agent's product token, so the next log read says who is polling, then the rest at debug.
 * Every other route still warns.
 *
 * @module api/known-probe-log
 */
import type { IncomingMessage } from 'http';

import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'AuthMiddleware' });

const KNOWN_PLATFORM_POLLS: ReadonlySet<string> = new Set(['/worker']);

let named = false;

/** The URL is a platform poll we do not serve. Exact match only. */
function isKnownPlatformPoll(url: string | undefined): boolean {
  return url !== undefined && KNOWN_PLATFORM_POLLS.has(url);
}

/** The product token of a User-Agent ("Name/1.2 (...)" gives "Name"); nothing else of it is kept. */
function userAgentProduct(req: IncomingMessage): string {
  const header = req.headers['user-agent'];
  const ua = Array.isArray(header) ? header[0] : header;
  if (!ua) return 'none';
  return /^[A-Za-z0-9._-]{1,24}/.exec(ua)?.[0] ?? 'other';
}

/** A request with no credential: a warn, except a known platform poll (see the file header). */
export function logUnauthorized(req: IncomingMessage): void {
  const fields = { url: req.url, method: req.method };
  if (!isKnownPlatformPoll(req.url)) {
    log.warn(fields, 'Unauthorized request');
  } else if (!named) {
    named = true;
    log.info(
      { ...fields, userAgent: userAgentProduct(req) },
      'Unauthorized request from a known platform poll; later ones are logged at debug'
    );
  } else {
    log.debug(fields, 'Unauthorized request from a known platform poll');
  }
}
