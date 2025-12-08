/**
 * Subscription API Routes
 *
 * RESTful endpoints for subscription management.
 * Integrates with Stripe for payments and syncs with user profiles.
 *
 * Philosophy: Keep it simple. Let Stripe handle complexity.
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  isStripeConfigured,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionInfo,
  canStartConversation,
  recordConversation,
  verifyWebhook,
  handleWebhookEvent,
} from '../services/stripe-subscription.js';

const log = createLogger({ module: 'SubscriptionAPI' });

// ============================================================================
// TYPES
// ============================================================================

interface RequestContext {
  method: string;
  pathname: string;
  query: Record<string, string>;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
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
 * GET /api/subscription/status
 * Get current subscription status for a user
 */
async function getStatus(ctx: RequestContext): Promise<ResponseContext> {
  const userId = ctx.query.userId || ctx.headers['x-user-id'];

  if (!userId || typeof userId !== 'string') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    const info = await getSubscriptionInfo(userId);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: info,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get subscription status');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to get subscription status' },
    };
  }
}

/**
 * GET /api/subscription/can-start
 * Check if user can start a new conversation
 */
async function checkCanStart(ctx: RequestContext): Promise<ResponseContext> {
  const userId = ctx.query.userId || ctx.headers['x-user-id'];

  if (!userId || typeof userId !== 'string') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    const result = await canStartConversation(userId);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check conversation eligibility');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to check eligibility' },
    };
  }
}

/**
 * POST /api/subscription/checkout
 * Create a Stripe checkout session
 */
async function createCheckout(ctx: RequestContext): Promise<ResponseContext> {
  if (!isStripeConfigured()) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Stripe is not configured' },
    };
  }

  const body = ctx.body as {
    userId?: string;
    tier?: 'friend' | 'partner';
    successUrl?: string;
    cancelUrl?: string;
    email?: string;
    name?: string;
  };

  if (!body.userId || !body.tier) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId and tier are required' },
    };
  }

  if (body.tier !== 'friend' && body.tier !== 'partner') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'tier must be "friend" or "partner"' },
    };
  }

  try {
    const session = await createCheckoutSession({
      userId: body.userId,
      tier: body.tier,
      successUrl: body.successUrl || 'https://ferni.ai/subscription/success',
      cancelUrl: body.cancelUrl || 'https://ferni.ai/subscription/cancel',
      email: body.email,
      name: body.name,
    });

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: session,
    };
  } catch (error) {
    log.error({ error: String(error), userId: body.userId }, 'Failed to create checkout session');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to create checkout session' },
    };
  }
}

/**
 * POST /api/subscription/portal
 * Create a Stripe billing portal session
 */
async function createBillingPortal(ctx: RequestContext): Promise<ResponseContext> {
  if (!isStripeConfigured()) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Stripe is not configured' },
    };
  }

  const body = ctx.body as {
    userId?: string;
    returnUrl?: string;
  };

  if (!body.userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    const session = await createPortalSession(
      body.userId,
      body.returnUrl || 'https://ferni.ai/settings'
    );

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: session,
    };
  } catch (error) {
    log.error({ error: String(error), userId: body.userId }, 'Failed to create portal session');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to create portal session' },
    };
  }
}

/**
 * POST /api/subscription/record-conversation
 * Record a completed conversation for usage tracking
 */
async function recordConversationUsage(ctx: RequestContext): Promise<ResponseContext> {
  const body = ctx.body as {
    userId?: string;
    durationMinutes?: number;
  };

  if (!body.userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    const status = await recordConversation(body.userId, body.durationMinutes ?? 0);
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: status,
    };
  } catch (error) {
    log.error({ error: String(error), userId: body.userId }, 'Failed to record conversation');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to record conversation' },
    };
  }
}

/**
 * POST /api/subscription/webhook
 * Handle Stripe webhook events
 */
async function handleStripeWebhook(ctx: RequestContext): Promise<ResponseContext> {
  if (!isStripeConfigured()) {
    return {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Stripe is not configured' },
    };
  }

  const signature = ctx.headers['stripe-signature'];
  if (!signature || typeof signature !== 'string') {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Missing stripe-signature header' },
    };
  }

  try {
    // The body should be the raw string/buffer for webhook verification
    const payload = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body);
    const event = await verifyWebhook(payload, signature);
    await handleWebhookEvent(event);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: { received: true },
    };
  } catch (error) {
    log.error({ error: String(error) }, 'Webhook handling failed');
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Webhook verification failed' },
    };
  }
}

/**
 * GET /api/subscription/config
 * Get public subscription configuration (for frontend)
 */
async function getConfig(): Promise<ResponseContext> {
  const isConfigured = isStripeConfigured();

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      enabled: isConfigured,
      tiers: [
        {
          id: 'free',
          name: 'Getting Started',
          description: "We're just beginning our journey together",
          priceInCents: 0,
          conversationsPerMonth: 5,
          features: ['5 conversations/month', 'Basic memory', 'Single device'],
        },
        {
          id: 'friend',
          name: 'Your Life Coach',
          description: "I'm here whenever you need me",
          priceInCents: 999,
          conversationsPerMonth: null,
          features: [
            'Unlimited conversations',
            'Full memory persistence',
            'Cross-device sync',
            'Early access to new features',
          ],
          popular: true,
        },
        {
          id: 'partner',
          name: 'Partner in Growth',
          description: 'Together for the long haul',
          priceInCents: 1999,
          conversationsPerMonth: null,
          features: [
            'Everything in Friend',
            'Priority responses',
            'Family sharing (up to 4)',
            'Exclusive partner features',
          ],
        },
      ],
    },
  };
}

// ============================================================================
// ROUTER
// ============================================================================

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    '/api/subscription/status': getStatus,
    '/api/subscription/can-start': checkCanStart,
    '/api/subscription/config': getConfig,
  },
  POST: {
    '/api/subscription/checkout': createCheckout,
    '/api/subscription/portal': createBillingPortal,
    '/api/subscription/record-conversation': recordConversationUsage,
    '/api/subscription/webhook': handleStripeWebhook,
  },
};

/**
 * Route a subscription API request
 */
export function routeSubscriptionRequest(ctx: RequestContext): RouteHandler | null {
  const methodRoutes = routes[ctx.method];
  if (!methodRoutes) return null;

  return methodRoutes[ctx.pathname] || null;
}

/**
 * Check if a path is a subscription API route
 */
export function isSubscriptionRoute(pathname: string): boolean {
  return pathname.startsWith('/api/subscription/');
}

/**
 * Handle subscription API request (for integration with existing server)
 */
export async function handleSubscriptionRequest(ctx: RequestContext): Promise<ResponseContext> {
  const handler = routeSubscriptionRequest(ctx);

  if (!handler) {
    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Not found' },
    };
  }

  return handler(ctx);
}
