/**
 * Garden API Routes (Seed Fund)
 *
 * Handles the Seed Fund community contribution system.
 * Integrates with Stripe for payments and Firestore for tracking.
 *
 * Routes:
 * - GET /api/garden/status - Get current fund status (public)
 * - GET /api/garden/user - Get authenticated user's garden
 * - POST /api/garden/plant - Create one-time contribution
 * - POST /api/garden/subscribe - Start monthly contribution
 * - PUT /api/garden/subscription - Update monthly amount
 * - DELETE /api/garden/subscription - Cancel monthly contribution
 */

import * as admin from 'firebase-admin';
import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import { optionalAuthAsync, rateLimit } from './auth-middleware.js';
import { API_ERRORS } from './error-messages.js';
import {
  getUserId,
  handleCorsPreflightIfNeeded,
  parseBody,
  sendError,
  sendJSON,
} from './helpers.js';
import {
  calculateGardenerStatus,
  calculateGardenHealth,
  type GardenStatus,
  type UserGarden,
  type PlantSeedRequest,
  type PlantSeedResponse,
  type StartMonthlyRequest,
  type SubscriptionResponse,
} from '../types/seed-fund.types.js';
import { createPaymentIntent, isStripeConfigured } from '../services/stripe-payments.js';
import { createCheckoutSession, createPortalSession } from '../services/stripe-subscription.js';

const log = createLogger({ module: 'GardenAPI' });

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Monthly goal in dollars - what we need to keep Ferni free
 * Update this based on actual infrastructure costs
 */
const MONTHLY_GOAL = 3500;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the current month key for aggregation (YYYY-MM)
 */
function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

// Track Firestore initialization attempts
let firestoreInstance: admin.firestore.Firestore | null = null;
let initAttempted = false;

/**
 * Get Firestore instance with lazy initialization.
 * Returns null if Firebase is not available.
 */
function getFirestore(): admin.firestore.Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted) {
    return null;
  }
  initAttempted = true;

  try {
    // Check if Firebase is already initialized
    if (admin.apps.length === 0) {
      // Try to initialize with default credentials or project ID
      const projectId =
        process.env.GCP_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

      if (projectId) {
        admin.initializeApp({ projectId });
        log.info({ projectId }, 'Firebase initialized for garden routes');
      } else {
        // Try default credentials
        admin.initializeApp();
        log.info('Firebase initialized with default credentials');
      }
    }

    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase not available for garden routes');
    return null;
  }
}

// =============================================================================
// ROUTE HANDLERS
// =============================================================================

/**
 * GET /api/garden/status
 * Get current fund status (public, no auth required)
 *
 * Returns a fallback status if Firestore is unavailable (graceful degradation)
 */
async function handleGetStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const db = getFirestore();

    // Fallback status when database is unavailable
    // We return 200 with default data rather than an error
    // to prevent broken UI - similar to /api/agents fallback
    if (!db) {
      log.warn('Firestore unavailable - returning garden fallback');
      const fallbackStatus: GardenStatus = {
        monthlyGoal: MONTHLY_GOAL,
        currentMonth: 0,
        percentFunded: 0,
        health: 'needs-water',
        gardenersThisMonth: 0,
        seedsThisMonth: 0,
        monthlyGardeners: 0,
        lastUpdated: new Date().toISOString(),
      };
      sendJSON(res, fallbackStatus);
      return;
    }

    const monthKey = getCurrentMonthKey();

    // Get or create monthly stats document
    const statsRef = db.collection('garden_stats').doc(monthKey);
    const statsDoc = await statsRef.get();

    let currentMonth = 0;
    let gardenersThisMonth = 0;
    let seedsThisMonth = 0;
    let monthlyGardeners = 0;

    if (statsDoc.exists) {
      const data = statsDoc.data();
      currentMonth = data?.totalAmount || 0;
      gardenersThisMonth = data?.uniqueContributors || 0;
      seedsThisMonth = data?.totalSeeds || 0;
      monthlyGardeners = data?.monthlySubscribers || 0;
    }

    const percentFunded = Math.round((currentMonth / MONTHLY_GOAL) * 100);
    const health = calculateGardenHealth(percentFunded);

    const status: GardenStatus = {
      monthlyGoal: MONTHLY_GOAL,
      currentMonth,
      percentFunded,
      health,
      gardenersThisMonth,
      seedsThisMonth,
      monthlyGardeners,
      lastUpdated: new Date().toISOString(),
    };

    sendJSON(res, status);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get garden status');
    // Return fallback on error to prevent UI breakage
    const fallbackStatus: GardenStatus = {
      monthlyGoal: MONTHLY_GOAL,
      currentMonth: 0,
      percentFunded: 0,
      health: 'needs-water',
      gardenersThisMonth: 0,
      seedsThisMonth: 0,
      monthlyGardeners: 0,
      lastUpdated: new Date().toISOString(),
    };
    sendJSON(res, fallbackStatus);
  }
}

/**
 * GET /api/garden/user
 * Get authenticated user's garden (contribution history)
 */
async function handleGetUserGarden(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const db = getFirestore();
    if (!db) {
      sendError(res, 'Database not available', 503);
      return;
    }

    const userRef = db.collection('user_gardens').doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      // New user - no contributions yet
      const emptyGarden: UserGarden = {
        userId,
        totalSeeds: 0,
        status: 'seedling',
        isMonthlyGardener: false,
        seedsThisMonth: 0,
      };
      sendJSON(res, emptyGarden);
      return;
    }

    const data = userDoc.data()!;
    const status = calculateGardenerStatus(data.totalSeeds, data.monthlyAmount);

    const garden: UserGarden = {
      userId,
      totalSeeds: data.totalSeeds || 0,
      status,
      isMonthlyGardener: data.isMonthlyGardener || false,
      monthlyAmount: data.monthlyAmount,
      stripeCustomerId: data.stripeCustomerId,
      firstSeedDate: data.firstSeedDate?.toDate?.()?.toISOString(),
      lastSeedDate: data.lastSeedDate?.toDate?.()?.toISOString(),
      seedsThisMonth: data.seedsThisMonth || 0,
    };

    sendJSON(res, garden);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get user garden');
    sendError(res, 'Failed to get user garden');
  }
}

/**
 * POST /api/garden/plant
 * Create a one-time contribution using Stripe Payment Intent
 */
async function handlePlantSeed(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<PlantSeedRequest>(req);
    const { amount } = body;

    if (!amount || amount < 1) {
      sendError(res, 'Amount must be at least $1', 400);
      return;
    }

    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      log.warn({ userId }, 'Stripe not configured for seed payment');
      const response: PlantSeedResponse = {
        success: false,
        error: 'Payment system not configured',
      };
      sendJSON(res, response);
      return;
    }

    // Create payment intent for one-time seed contribution
    // Convert dollars to cents for Stripe
    const paymentResult = await createPaymentIntent({
      userId,
      amountCents: amount * 100,
      type: 'ferni_fund',
      description: `Seed Fund contribution: $${amount}`,
      metadata: {
        garden_type: 'one_time',
        seed_count: String(amount),
      },
    });

    if (!paymentResult) {
      log.error({ userId, amount }, 'Failed to create payment intent');
      const response: PlantSeedResponse = {
        success: false,
        error: 'Failed to create payment',
      };
      sendJSON(res, response);
      return;
    }

    log.info(
      { userId, amount, paymentIntentId: paymentResult.paymentIntentId },
      'Plant seed payment intent created'
    );

    const response: PlantSeedResponse = {
      success: true,
      clientSecret: paymentResult.clientSecret,
      paymentIntentId: paymentResult.paymentIntentId,
    };

    sendJSON(res, response);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create seed payment');
    sendError(res, 'Failed to create payment');
  }
}

/**
 * POST /api/garden/subscribe
 * Start a monthly contribution using Stripe Checkout
 */
async function handleStartMonthly(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<StartMonthlyRequest>(req);
    const { amount } = body;

    if (!amount || amount < 5) {
      sendError(res, 'Monthly amount must be at least $5', 400);
      return;
    }

    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      log.warn({ userId }, 'Stripe not configured for garden subscription');
      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription system not configured',
      };
      sendJSON(res, response);
      return;
    }

    // Get the base URL for success/cancel redirects
    const host = req.headers.host || 'localhost:3002';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    // Create checkout session for monthly subscription
    // Using 'friend' tier as the subscription base - garden-specific prices can be configured later
    const checkoutResult = await createCheckoutSession({
      userId,
      tier: 'friend', // Use friend tier pricing for now
      successUrl: `${baseUrl}/garden/success`,
      cancelUrl: `${baseUrl}/garden/cancel`,
    });

    log.info(
      { userId, amount, sessionId: checkoutResult.sessionId },
      'Garden subscription checkout created'
    );

    const response: SubscriptionResponse = {
      success: true,
      checkoutUrl: checkoutResult.url,
    };

    sendJSON(res, response);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to create subscription');
    sendError(res, 'Failed to create subscription');
  }
}

/**
 * PUT /api/garden/subscription
 * Update monthly amount - redirects to Stripe billing portal
 * 
 * Users can manage their subscription (update amount, change payment method,
 * view invoices) through Stripe's hosted billing portal.
 */
async function handleUpdateMonthly(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    const body = await parseBody<{ newAmount?: number }>(req);
    const { newAmount } = body;

    if (newAmount !== undefined && newAmount < 5) {
      sendError(res, 'Monthly amount must be at least $5', 400);
      return;
    }

    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      log.warn({ userId }, 'Stripe not configured for subscription update');
      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription system not configured',
      };
      sendJSON(res, response);
      return;
    }

    // Get the base URL for return redirect
    const host = req.headers.host || 'localhost:3002';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const returnUrl = `${protocol}://${host}/garden`;

    try {
      // Create billing portal session - users can update subscription here
      const portalResult = await createPortalSession(userId, returnUrl);

      log.info({ userId }, 'Garden subscription portal session created');

      const response: SubscriptionResponse = {
        success: true,
        checkoutUrl: portalResult.url,
      };

      sendJSON(res, response);
    } catch (error) {
      // User may not have a Stripe customer ID yet
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not have a Stripe customer ID')) {
        const response: SubscriptionResponse = {
          success: false,
          error: 'No active subscription found. Please subscribe first.',
        };
        sendJSON(res, response);
        return;
      }
      throw error;
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to update subscription');
    sendError(res, 'Failed to update subscription');
  }
}

/**
 * DELETE /api/garden/subscription
 * Cancel monthly contribution - redirects to Stripe billing portal
 * 
 * Users can cancel their subscription through Stripe's hosted billing portal,
 * which handles all the edge cases (proration, final invoice, etc.)
 */
async function handleCancelMonthly(
  req: IncomingMessage,
  res: ServerResponse,
  userId: string
): Promise<void> {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      log.warn({ userId }, 'Stripe not configured for subscription cancellation');
      const response: SubscriptionResponse = {
        success: false,
        error: 'Subscription system not configured',
      };
      sendJSON(res, response);
      return;
    }

    // Get the base URL for return redirect
    const host = req.headers.host || 'localhost:3002';
    const protocol = host.includes('localhost') ? 'http' : 'https';
    const returnUrl = `${protocol}://${host}/garden`;

    try {
      // Create billing portal session - users can cancel subscription here
      const portalResult = await createPortalSession(userId, returnUrl);

      log.info({ userId }, 'Garden cancellation portal session created');

      const response: SubscriptionResponse = {
        success: true,
        checkoutUrl: portalResult.url,
      };

      sendJSON(res, response);
    } catch (error) {
      // User may not have a Stripe customer ID
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('does not have a Stripe customer ID')) {
        const response: SubscriptionResponse = {
          success: false,
          error: 'No active subscription found.',
        };
        sendJSON(res, response);
        return;
      }
      throw error;
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to cancel subscription');
    sendError(res, 'Failed to cancel subscription');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Main route handler for garden routes
 */
export async function handleGardenRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/garden routes
  if (!pathname.startsWith('/api/garden')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Apply rate limiting
  if (rateLimit(req, res, { maxRequests: 100, windowMs: 60000 })) {
    return true;
  }

  const method = req.method || 'GET';

  // GET /api/garden/status - Public endpoint (no auth required)
  if (pathname === '/api/garden/status' && method === 'GET') {
    await handleGetStatus(req, res);
    return true;
  }

  // Auth strategy for garden routes:
  // 1. Try Firebase auth (preferred) - sets userId to Firebase UID
  // 2. Fall back to userId from query params or X-User-Id header (legacy device IDs)
  // This allows users who haven't migrated to Firebase to still use the API
  const auth = await optionalAuthAsync(req);
  const userId = auth?.userId || getUserId(req, parsedUrl);

  if (!userId) {
    sendError(res, API_ERRORS.USER_ID_REQUIRED, 401);
    return true;
  }

  // If we have Firebase auth, update the header so handlers use Firebase UID consistently
  if (auth) {
    (req.headers as Record<string, string | string[] | undefined>)['x-user-id'] = auth.userId;
  }

  // GET /api/garden/user - Get user's garden
  if (pathname === '/api/garden/user' && method === 'GET') {
    await handleGetUserGarden(req, res, userId);
    return true;
  }

  // POST /api/garden/plant - Plant a seed
  if (pathname === '/api/garden/plant' && method === 'POST') {
    await handlePlantSeed(req, res, userId);
    return true;
  }

  // POST /api/garden/subscribe - Start monthly
  if (pathname === '/api/garden/subscribe' && method === 'POST') {
    await handleStartMonthly(req, res, userId);
    return true;
  }

  // PUT /api/garden/subscription - Update monthly
  if (pathname === '/api/garden/subscription' && method === 'PUT') {
    await handleUpdateMonthly(req, res, userId);
    return true;
  }

  // DELETE /api/garden/subscription - Cancel monthly
  if (pathname === '/api/garden/subscription' && method === 'DELETE') {
    await handleCancelMonthly(req, res, userId);
    return true;
  }

  // No matching route
  return false;
}

export default handleGardenRoutes;
