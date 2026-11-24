/**
 * The HTTP door for /api/monetization/*: optional auth, the body, the router,
 * the reply. The router only sees what this hands it, so who the caller is
 * (uid, admin, anonymous Firebase sign-in) comes from the verified token here,
 * never from the request body.
 *
 * @module api/monetization-http
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { optionalAuthAsync } from './auth-middleware.js';
import { parseRawBody } from './helpers.js';
import { handleMonetizationRequest } from './monetization-routes.js';
import { parseMonetizationBody } from './monetization-webhook.js';

const log = createLogger({ module: 'MonetizationHttp' });

export async function serveMonetizationRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  searchParams: URLSearchParams
): Promise<void> {
  try {
    // SECURITY: the verified caller, for IDOR protection and partner-vote weighting
    const auth = await optionalAuthAsync(req);

    let body: unknown = undefined;
    if (req.method === 'POST' || req.method === 'PUT') {
      // parseRawBody avoids a race with the async auth check, with a timeout and a size cap
      const rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });
      body = parseMonetizationBody(pathname, rawBody);
    }

    const response = await handleMonetizationRequest({
      method: req.method || 'GET',
      pathname,
      query: Object.fromEntries(searchParams),
      body,
      headers: req.headers,
      authUserId: auth?.userId,
      isAdmin: auth?.isAdmin ?? false,
      isAnonymous: auth?.isAnonymous === true,
    });
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
  } catch (err) {
    log.error({ error: String(err) }, 'Monetization route error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
