/**
 * Apple In-App Purchase API Routes
 *
 * Endpoints for:
 * - Receipt verification from iOS app
 * - App Store Server Notifications webhook
 * - Subscription status queries
 *
 * These work alongside Stripe routes - users can subscribe via either.
 */

import type { IncomingMessage, ServerResponse } from 'http';

import { appleIAP, isAppleConfigured } from '../services/apple-iap.js';
import {
  appAccountTokenFor,
  claimAppleTransaction,
  getAppleVerifier,
} from '../services/billing/apple-signed-data.js';
import { createLogger } from '../utils/safe-logger.js';
import { resolveActingUser } from './acting-user.js';
import { optionalAuthAsync } from './auth-middleware.js';
import { parseBody } from './helpers.js';

const log = createLogger({ module: 'AppleIAPRoutes' });

// ============================================================================
// TYPES
// ============================================================================

interface RequestContext {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  /** Verified caller (never from the body); set by handleAppleRoutes. */
  authUserId?: string;
  isAdmin?: boolean;
}

interface ResponseContext {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

type RouteHandler = (ctx: RequestContext) => Promise<ResponseContext>;

// ============================================================================
// ROUTE HANDLERS
// ============================================================================

/**
 * POST /api/apple/verify
 * Verify a receipt from the iOS app
 */
async function verifyReceipt(ctx: RequestContext): Promise<ResponseContext> {
  if (!isAppleConfigured()) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Apple IAP not configured' },
    };
  }

  const body = ctx.body as { receiptData?: string; userId?: string } | undefined;

  // The receipt is attached to the verified caller; naming another user needs admin.
  const actor = resolveActingUser(ctx.authUserId, ctx.isAdmin, body?.userId);
  if (!actor.ok) {
    return {
      status: actor.status,
      headers: { 'Content-Type': 'application/json' },
      body: { error: actor.error },
    };
  }

  if (!body?.receiptData) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'receiptData is required' },
    };
  }

  try {
    // Verified with Apple's library, then bound to this user (first claim owns it).
    const claim = await claimAppleTransaction(actor.userId, body.receiptData);
    if (!claim.ok) {
      return {
        status: claim.status,
        headers: { 'Content-Type': 'application/json' },
        body: { error: claim.error },
      };
    }
    const { productId, expiresDate, environment } = claim.transaction;
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        isValid: true,
        tier: (productId && appleIAP.productToTier[productId]) || 'free',
        status: expiresDate && expiresDate > Date.now() ? 'active' : 'expired',
        expiresDate: expiresDate ? new Date(expiresDate).toISOString() : undefined,
        environment,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId: actor.userId }, 'Receipt verification failed');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Verification failed' },
    };
  }
}

/**
 * GET /api/apple/status
 * Get subscription status for a user
 */
async function getStatus(ctx: RequestContext): Promise<ResponseContext> {
  if (!isAppleConfigured()) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Apple IAP not configured' },
    };
  }

  const { userId, transactionId } = ctx.query;

  if (!userId || !transactionId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and transactionId are required' },
    };
  }

  try {
    const result = await appleIAP.syncSubscription(userId, transactionId);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        tier: result.tier,
        status: result.status,
        expiresDate: result.expiresDate?.toISOString(),
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Status check failed');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Status check failed' },
    };
  }
}

/**
 * POST /api/apple/webhook
 * App Store Server Notifications v2 webhook
 *
 * Apple sends signed JWS payloads here when subscription status changes.
 */
async function handleWebhook(ctx: RequestContext): Promise<ResponseContext> {
  if (!isAppleConfigured()) {
    log.warn('Received Apple webhook but IAP not configured');
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Apple IAP not configured' },
    };
  }

  const body = ctx.body as { signedPayload?: string } | undefined;

  if (!body?.signedPayload) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'signedPayload is required' },
    };
  }

  // Nothing in the payload is trusted until Apple's library verifies it
  // (signature chain to Apple's root, our bundle id, app and environment).
  const verifier = getAppleVerifier();
  if (!verifier) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: "Notifications can't be verified right now" },
    };
  }
  try {
    await verifier.verifyAndDecodeNotification(body.signedPayload);
  } catch (error) {
    log.warn({ error: String(error) }, 'Rejected Apple webhook with an invalid signature');
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Invalid signature' },
    };
  }

  try {
    const result = await appleIAP.handleNotification(body.signedPayload);

    if (!result.success) {
      log.warn({ error: result.error }, 'Apple webhook processing failed');
      // Still return 200 to acknowledge receipt
      // Apple will retry if we return error status
    }

    log.info(
      { notificationType: result.notificationType, userId: result.userId },
      'Processed Apple webhook'
    );

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { received: true },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Apple webhook error');
    // Return 200 to prevent Apple from retrying
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { received: true, error: 'Processing error' },
    };
  }
}

/**
 * GET /api/apple/account-token
 * The appAccountToken for the signed-in user. The iOS app passes it to StoreKit
 * at purchase, which binds the purchase to this account (see apple-signed-data).
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function getAccountToken(ctx: RequestContext): Promise<ResponseContext> {
  if (!ctx.authUserId) {
    return {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Authentication required' },
    };
  }
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: { appAccountToken: appAccountTokenFor(ctx.authUserId) },
  };
}

/**
 * GET /api/apple/products
 * Get available product IDs for the iOS app
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function getProducts(_ctx: RequestContext): Promise<ResponseContext> {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      products: Object.entries(appleIAP.productIds).map(([key, productId]) => ({
        key,
        productId,
        tier: appleIAP.productToTier[productId] || 'free',
      })),
    },
  };
}

/**
 * GET /api/apple/cancel-instructions
 * Get instructions for canceling Apple subscription
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function getCancelInstructions(_ctx: RequestContext): Promise<ResponseContext> {
  const instructions = appleIAP.getCancellationInstructions();

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: instructions,
  };
}

// ============================================================================
// ROUTE MAPPING
// ============================================================================

const routes: {
  GET: Record<string, RouteHandler>;
  POST: Record<string, RouteHandler>;
} = {
  GET: {
    '/api/apple/status': getStatus,
    '/api/apple/products': getProducts,
    '/api/apple/account-token': getAccountToken,
    '/api/apple/cancel-instructions': getCancelInstructions,
  },
  POST: {
    '/api/apple/verify': verifyReceipt,
    '/api/apple/webhook': handleWebhook,
  },
};

// ============================================================================
// REQUEST HANDLER
// ============================================================================

// parseBody imported from './helpers.js'

/**
 * Parse query string from URL
 */
function parseQuery(url: string): Record<string, string> {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return {};

  const queryString = url.slice(queryStart + 1);
  const params: Record<string, string> = {};

  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }

  return params;
}

/**
 * Check if this route should be handled by Apple IAP routes
 */
export function isAppleRoute(pathname: string): boolean {
  return pathname.startsWith('/api/apple/');
}

/**
 * Handle Apple IAP API requests
 */
export async function handleAppleRoutes(
  req: IncomingMessage,
  res: ServerResponse
): Promise<boolean> {
  const url = req.url || '/';
  const pathname = url.split('?')[0];
  const method = req.method || 'GET';

  // Check if this is an Apple route
  if (!isAppleRoute(pathname)) {
    return false;
  }

  // Find the handler
  const methodRoutes = routes[method as keyof typeof routes];
  const handler = methodRoutes?.[pathname];

  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return true;
  }

  try {
    // Parse request
    const body = method === 'POST' ? await parseBody(req) : undefined;
    const query = parseQuery(url);

    const auth = pathname === '/api/apple/webhook' ? null : await optionalAuthAsync(req);

    const ctx: RequestContext = {
      method,
      pathname,
      query,
      body,
      headers: req.headers as Record<string, string | string[] | undefined>,
      authUserId: auth?.userId,
      isAdmin: auth?.isAdmin ?? false,
    };

    // Execute handler
    const response = await handler(ctx);

    // Send response
    res.writeHead(response.status, response.headers);
    res.end(JSON.stringify(response.body));
  } catch (error) {
    log.error({ error: String(error), pathname }, 'Apple route error');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }

  return true;
}

export default { isAppleRoute, handleAppleRoutes };
