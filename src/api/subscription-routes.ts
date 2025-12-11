/**
 * Subscription API Routes
 *
 * RESTful endpoints for subscription management.
 * Integrates with Stripe for payments and syncs with user profiles.
 *
 * Philosophy: Keep it simple. Let Stripe handle complexity.
 */

import {
  checkTrialStatus,
  getTrialState,
  isEligibleForTrial,
  recordTrialTime,
  startTrial,
  TRIAL_DURATION_MS,
} from '../services/first-taste-trial.js';
import {
  canStartConversation,
  createCheckoutSession,
  createPortalSession,
  getSubscriptionInfo,
  handleWebhookEvent,
  isStripeConfigured,
  recordConversation,
  verifyWebhook,
} from '../services/stripe-subscription.js';
import {
  getMetricsForApi,
  initializeSubscriptionMetrics,
  trackStripeEvent,
} from '../services/subscription-metrics.js';
import { createLogger } from '../utils/safe-logger.js';

// Initialize subscription metrics on module load
initializeSubscriptionMetrics().catch(() => {
  // Non-fatal initialization - metrics will work on first request
});

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
 * POST /api/subscription/upgrade
 * Admin endpoint to manually upgrade a user (dev mode only)
 */
async function createAdminUpgrade(ctx: RequestContext): Promise<ResponseContext> {
  const body = ctx.body as {
    device_id?: string;
    userId?: string;
    tier?: 'free' | 'friend' | 'partner';
    admin_key?: string;
  };

  // SECURITY: Only allow admin upgrades in development OR with valid ADMIN_KEY
  const isDev = process.env.NODE_ENV !== 'production';
  const adminKey = process.env.ADMIN_KEY;

  // In production, REQUIRE ADMIN_KEY env var (no fallback!)
  if (!isDev) {
    if (!adminKey) {
      return {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'ADMIN_KEY not configured' },
      };
    }
    if (body.admin_key !== adminKey) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Unauthorized' },
      };
    }
  } else {
    // In development, allow 'dev-mode' key
    if (body.admin_key !== 'dev-mode' && body.admin_key !== adminKey) {
      return {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
        body: { error: 'Unauthorized - use admin_key: dev-mode in development' },
      };
    }
  }

  const userId = body.userId || body.device_id;
  if (!userId || !body.tier) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId/device_id and tier are required' },
    };
  }

  try {
    // Import and use the store to update subscription
    const { getStore } = await import('../memory/store-factory.js');
    const { createDefaultSubscription } = await import('../types/subscription.js');

    const store = await getStore();
    let profile = await store.getProfile(userId);

    if (!profile) {
      // Create a minimal profile for new users using proper interface
      const { createUserProfile } = await import('../types/user-profile.js');
      profile = createUserProfile(userId);
      profile.subscription = createDefaultSubscription();
    }

    // Update subscription tier
    const subscription = profile.subscription ?? createDefaultSubscription();
    subscription.tier = body.tier;
    subscription.status = 'active';
    subscription.lastSyncedAt = new Date();

    // Reset usage for upgrades
    if (body.tier !== 'free') {
      subscription.monthlyUsage = {
        period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
        conversationCount: 0,
        minutesTalked: 0,
        lastUpdated: new Date(),
      };
    }

    await store.saveProfile({
      ...profile,
      subscription,
      updatedAt: new Date(),
    });

    log.info({ userId, tier: body.tier }, 'Admin upgrade completed');

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        message: `Upgraded to ${body.tier}`,
        tier: body.tier,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Admin upgrade failed');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to upgrade' },
    };
  }
}

/**
 * POST /api/subscription/webhook
 * Handle Stripe webhook events
 *
 * IMPORTANT: The body MUST be the raw string for signature verification.
 * Stripe's webhook verification requires the exact bytes that were signed.
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

  // Body must be raw string - if it's an object, signature verification will fail
  if (typeof ctx.body !== 'string') {
    log.error(
      { bodyType: typeof ctx.body },
      'Webhook body must be raw string, got parsed object. Check body parsing in ui-server.js'
    );
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Invalid webhook payload format' },
    };
  }

  try {
    const event = await verifyWebhook(ctx.body, signature);
    await handleWebhookEvent(event);

    // Track event for metrics dashboard
    const eventData = event.data.object as unknown as Record<string, unknown>;
    const metadata = (eventData.metadata ?? {}) as Record<string, string>;
    await trackStripeEvent(event.type, {
      userId: metadata.ferni_user_id,
      subscriptionId: eventData.id as string,
      tier: metadata.tier,
      amount: eventData.amount_total as number | undefined,
    }).catch((err) => log.warn({ err }, 'Failed to track subscription event'));

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

// ============================================================================
// FIRST TASTE TRIAL ENDPOINTS
// ============================================================================

/**
 * GET /api/subscription/trial
 * Get trial status for a user.
 * Returns whether they're in trial, time remaining, etc.
 */
async function getTrialStatus(ctx: RequestContext): Promise<ResponseContext> {
  const userId = ctx.query.userId || (ctx.headers['x-user-id'] as string);
  const currentSessionTimeMs = parseInt(ctx.query.sessionTime as string) || 0;

  if (!userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    const status = await checkTrialStatus(userId, currentSessionTimeMs);
    const state = await getTrialState(userId);

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        ...status,
        trialDurationMs: TRIAL_DURATION_MS,
        trialTimeUsedMs: state.trialTimeUsedMs,
        isEligible: await isEligibleForTrial(userId),
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to get trial status');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to get trial status' },
    };
  }
}

/**
 * POST /api/subscription/trial/start
 * Start trial for a new user.
 */
async function startTrialEndpoint(ctx: RequestContext): Promise<ResponseContext> {
  const { userId } = ctx.body as { userId?: string };

  if (!userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    // Check if already started
    const isEligible = await isEligibleForTrial(userId);
    if (!isEligible) {
      const state = await getTrialState(userId);
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          reason: 'Trial already started',
          state,
        },
      };
    }

    const state = await startTrial(userId);
    log.info({ userId }, 'Trial started via API');

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        state,
        message: 'Welcome! Your first 7 minutes are on us.',
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to start trial');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to start trial' },
    };
  }
}

/**
 * POST /api/subscription/trial/record-time
 * Record time spent in current session.
 */
async function recordTrialTimeEndpoint(ctx: RequestContext): Promise<ResponseContext> {
  const { userId, sessionTimeMs } = ctx.body as { userId?: string; sessionTimeMs?: number };

  if (!userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  if (typeof sessionTimeMs !== 'number' || sessionTimeMs < 0) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'sessionTimeMs must be a positive number' },
    };
  }

  try {
    const state = await recordTrialTime(userId, sessionTimeMs);
    const status = await checkTrialStatus(userId, 0); // Pass 0 since we just recorded time

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        state,
        ...status,
      },
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to record trial time');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to record trial time' },
    };
  }
}

/**
 * GET /api/subscription/verify-session
 * Verify a checkout session completed successfully
 * Called by frontend after returning from Stripe to confirm payment
 */
async function verifyCheckoutSession(ctx: RequestContext): Promise<ResponseContext> {
  const sessionId = ctx.query.session_id;
  const userId = ctx.query.userId || (ctx.headers['x-user-id'] as string);

  if (!sessionId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'session_id is required' },
    };
  }

  if (!userId) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'userId is required' },
    };
  }

  try {
    // Get subscription info to check if it's been updated
    const info = await getSubscriptionInfo(userId);

    // If user is now on a paid tier, the webhook has processed
    const isPaid = info.tier !== 'free';

    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        verified: isPaid,
        tier: info.tier,
        status: info.status,
        message: isPaid
          ? 'Payment confirmed! Welcome to your new plan.'
          : 'Payment processing. This may take a moment.',
      },
    };
  } catch (error) {
    log.error({ error: String(error), sessionId }, 'Failed to verify checkout session');
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'Failed to verify session' },
    };
  }
}

/**
 * GET /api/subscription/config
 * Get public subscription configuration (for frontend)
 *
 * NEW: "Ferni Free Forever" model
 * - Free tier: Unlimited conversations with Ferni, 7-min sessions
 * - Premium: Longer sessions, team access, cosmetics
 */
async function getConfig(): Promise<ResponseContext> {
  const isConfigured = isStripeConfigured();

  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: {
      enabled: isConfigured,
      model: 'ferni-free-forever', // New monetization model identifier
      tiers: [
        {
          id: 'free',
          name: 'Ferni Forever',
          // Dynamic session time from env var for A/B testing
          description: `Talk to Ferni unlimited times, forever. ${process.env.FREE_SESSION_MINUTES || '7'} minutes per conversation.`,
          priceInCents: 0,
          conversationsPerMonth: null, // UNLIMITED with Ferni!
          sessionMinutes: parseInt(process.env.FREE_SESSION_MINUTES || '7', 10), // Configurable for experiments
          teamAccess: 'ferni-only',
          features: [
            'Unlimited conversations with Ferni',
            `${process.env.FREE_SESSION_MINUTES || '7'}-minute heart-to-hearts`,
            'Full memory — I remember everything',
            'Avatar & theme customization',
          ],
        },
        {
          id: 'friend',
          name: 'Your Life Coach',
          description: 'Unlimited time with Ferni + meet the whole team',
          priceInCents: 999,
          conversationsPerMonth: null,
          sessionMinutes: null, // Unlimited session time
          teamAccess: 'core-team',
          features: [
            'Talk as long as you need',
            'Meet the whole team (Maya, Peter, Alex, Jordan)',
            'Cosmetics shop access',
            'Sync across all your devices',
          ],
          popular: true,
        },
        {
          id: 'partner',
          name: 'Partner in Growth',
          description: 'Full team access + exclusive cosmetics + priority',
          priceInCents: 1999,
          conversationsPerMonth: null,
          sessionMinutes: null,
          teamAccess: 'full-team',
          features: [
            'Everything in Life Coach, plus:',
            'Full team access (including Nayan)',
            'Exclusive looks and themes',
            'Priority when you need us most',
            'Share with your family',
          ],
        },
      ],
      // Additional monetization options
      monetization: {
        tipJar: true,
        valueCapture: true,
        ferniFund: true,
        b2bAvailable: true,
        partnerships: true,
      },
    },
  };
}

// ============================================================================
// ROUTER
// ============================================================================

/**
 * Routes support both /subscription/* and /api/subscription/* for flexibility
 * Frontend uses /subscription/*, firebase rewrites use /subscription/**
 */
/**
 * GET /api/subscription/metrics
 * Get subscription metrics for admin dashboard
 */
async function getMetrics(_ctx: RequestContext): Promise<ResponseContext> {
  const metrics = await getMetricsForApi();
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    body: metrics,
  };
}

const routes: Record<string, Record<string, RouteHandler>> = {
  GET: {
    // With /api prefix (for API consistency)
    '/api/subscription/status': getStatus,
    '/api/subscription/can-start': checkCanStart,
    '/api/subscription/config': getConfig,
    '/api/subscription/verify-session': verifyCheckoutSession,
    '/api/subscription/trial': getTrialStatus,
    '/api/subscription/metrics': getMetrics,
    // Without /api prefix (frontend calls these directly)
    '/subscription/status': getStatus,
    '/subscription/can-start': checkCanStart,
    '/subscription/config': getConfig,
    '/subscription/verify-session': verifyCheckoutSession,
    '/subscription/trial': getTrialStatus,
    '/subscription/metrics': getMetrics,
  },
  POST: {
    // With /api prefix
    '/api/subscription/checkout': createCheckout,
    '/api/subscription/portal': createBillingPortal,
    '/api/subscription/record-conversation': recordConversationUsage,
    '/api/subscription/webhook': handleStripeWebhook,
    '/api/subscription/upgrade': createAdminUpgrade,
    '/api/subscription/trial/start': startTrialEndpoint,
    '/api/subscription/trial/record-time': recordTrialTimeEndpoint,
    // Without /api prefix (frontend calls these directly)
    '/subscription/checkout': createCheckout,
    '/subscription/portal': createBillingPortal,
    '/subscription/record-conversation': recordConversationUsage,
    '/subscription/trial/start': startTrialEndpoint,
    '/subscription/trial/record-time': recordTrialTimeEndpoint,
    '/subscription/webhook': handleStripeWebhook,
    '/subscription/upgrade': createAdminUpgrade,
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
 * Matches both /subscription/* and /api/subscription/*
 */
export function isSubscriptionRoute(pathname: string): boolean {
  return pathname.startsWith('/subscription/') || pathname.startsWith('/api/subscription/');
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
