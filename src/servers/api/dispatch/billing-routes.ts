/**
 * Billing routes: subscriptions, monetization and Apple IAP.
 *
 * Each route parses its own body and has its own inner error handler.
 *
 * Part of the core API chain: dispatched inside the shared "API route error"
 * boundary in core-routes.ts.
 */

import { createLogger } from '../../../utils/safe-logger.js';
import { optionalAuthAsync } from '../../../api/auth-middleware.js';
import { parseRawBody } from '../../../api/helpers.js';
import {
  handleSubscriptionRequest,
  isSubscriptionRoute,
} from '../../../api/subscription-routes.js';
import {
  handleMonetizationRequest,
  isMonetizationRoute,
} from '../../../api/monetization-routes.js';
import { handleAppleRoutes, isAppleRoute } from '../../../api/apple-iap-routes.js';
import type { RouteContext } from './route-context.js';

const log = createLogger({ module: 'APIServer' });

/**
 * Returns true when the request is finished.
 */
export async function dispatchBillingRoutes(ctx: RouteContext): Promise<boolean> {
  const { req, res, pathname, parsedUrl } = ctx;

  // Subscription routes
  if (isSubscriptionRoute(pathname)) {
    try {
      // Skip auth for webhooks (they use signature verification)
      const isWebhook = pathname.endsWith('/webhook');

      // SECURITY: Get authenticated user for IDOR protection
      // Webhooks don't need auth (they use Stripe signature verification)
      let authUserId: string | undefined;
      let isAdmin = false;
      if (!isWebhook) {
        const auth = await optionalAuthAsync(req);
        if (auth) {
          authUserId = auth.userId;
          isAdmin = auth.isAdmin;
        }
      }

      let body: unknown = undefined;
      let rawBody: string | undefined;

      if (req.method === 'POST' || req.method === 'PUT') {
        // Use parseRawBody to avoid race condition with async auth check
        // Also adds timeout, max size limit, and proper error handling
        rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });

        if (isWebhook) {
          // Webhooks need raw body for signature verification
          body = rawBody;
        } else {
          try {
            body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            body = rawBody;
          }
        }
      }

      const ctx = {
        method: req.method || 'GET',
        pathname,
        query: Object.fromEntries(parsedUrl.searchParams),
        body,
        // Exact bytes for Stripe webhook signature verification
        rawBody,
        headers: req.headers,
        // SECURITY: Pass authenticated user to prevent IDOR attacks
        authUserId,
        isAdmin,
      };

      const response = await handleSubscriptionRequest(ctx);
      res.writeHead(response.status, response.headers);
      res.end(JSON.stringify(response.body));
      return true;
    } catch (err) {
      log.error({ error: String(err) }, 'Subscription route error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return true;
    }
  }

  // Monetization routes
  if (isMonetizationRoute(pathname)) {
    try {
      // SECURITY: Get authenticated user for IDOR protection
      let authUserId: string | undefined;
      let isAdmin = false;
      const auth = await optionalAuthAsync(req);
      if (auth) {
        authUserId = auth.userId;
        isAdmin = auth.isAdmin;
      }

      let body: unknown = undefined;

      if (req.method === 'POST' || req.method === 'PUT') {
        // Use parseRawBody to avoid race condition with async auth check
        // Also adds timeout, max size limit, and proper error handling
        const rawBody = await parseRawBody(req, { timeoutMs: 30000, maxBytes: 1024 * 1024 });
        try {
          body = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          body = {};
        }
      }

      const ctx = {
        method: req.method || 'GET',
        pathname,
        query: Object.fromEntries(parsedUrl.searchParams),
        body,
        headers: req.headers,
        // SECURITY: Pass authenticated user to prevent IDOR attacks
        authUserId,
        isAdmin,
      };

      const response = await handleMonetizationRequest(ctx);
      res.writeHead(response.status, response.headers);
      res.end(JSON.stringify(response.body));
      return true;
    } catch (err) {
      log.error({ error: String(err) }, 'Monetization route error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return true;
    }
  }

  // Apple IAP routes
  if (isAppleRoute(pathname)) {
    try {
      const handled = await handleAppleRoutes(req, res);
      if (handled) return true;
    } catch (err) {
      log.error({ error: String(err) }, 'Apple IAP route error');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
      return true;
    }
  }

  return false;
}
