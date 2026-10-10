/**
 * Stripe Subscription Service
 *
 * Handles all Stripe-related subscription operations for Ferni.
 * Philosophy: Subscriptions are relationship commitments, not transactions.
 *
 * This service:
 * - Creates checkout sessions for upgrades
 * - Manages subscription lifecycle
 * - Tracks usage against limits
 * - Syncs status with user profiles
 *
 * Note: Stripe is an optional dependency. If not installed, functions
 * will throw when called but the module will still compile.
 */

import { getStore } from '../../memory/store-factory.js';
import {
  type SubscriptionData,
  type SubscriptionStatus,
  type SubscriptionTier,
  type UsageStatus,
  TIER_CONFIGS,
  calculateUsageStatus,
  createDefaultSubscription,
  createFreshUsage,
  getLimitMessage,
  needsUsageReset,
} from '../../types/subscription.js';
import { createLogger } from '../../utils/safe-logger.js';
import {
  awardContributionSeeds,
  awardFoundingSeeds,
  type SeedFundInvoice,
  type SeedFundPaymentIntent,
} from '../seeds/payment-bonuses.js';
import { finops } from '../observability/finops.js';
import { billingSourceOf, type BillingSource } from './billing-source.js';
import { nextSubscriptionFromStripe } from './paying-twice.js';

const log = createLogger({ module: 'StripeSubscription' });

// ============================================================================
// STRIPE TYPES (Minimal types for optional dependency)
// ============================================================================

/**
 * Minimal Stripe types for when the stripe package isn't installed.
 * These mirror the shapes we actually use from the Stripe SDK.
 */
interface StripeCustomer {
  id: string;
  email?: string | null;
  name?: string | null;
  metadata: Record<string, string>;
}

interface StripeSubscription {
  id: string;
  status: string;
  customer: string;
  created: number;
  current_period_end: number;
  trial_end: number | null;
  metadata: Record<string, string>;
}

interface StripeSubscriptionWithItems extends StripeSubscription {
  items: {
    data: Array<{
      price: {
        unit_amount: number | null;
        recurring?: { interval: string };
      };
    }>;
  };
}

interface StripeCheckoutSession {
  id: string;
  url: string | null;
  subscription?: string;
  metadata?: Record<string, string>;
}

interface StripeBillingPortalSession {
  url: string;
}

interface StripeInvoice extends SeedFundInvoice {
  customer: string;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice | SeedFundPaymentIntent;
  };
}

interface StripeClient {
  customers: {
    create: (params: {
      email?: string;
      name?: string;
      metadata?: Record<string, string>;
    }) => Promise<StripeCustomer>;
  };
  checkout: {
    sessions: {
      create: (params: Record<string, unknown>) => Promise<StripeCheckoutSession>;
    };
  };
  billingPortal: {
    sessions: {
      create: (params: {
        customer: string;
        return_url: string;
      }) => Promise<StripeBillingPortalSession>;
    };
  };
  subscriptions: {
    retrieve: (id: string) => Promise<StripeSubscription>;
    list: (params: {
      status?: string;
      limit?: number;
      expand?: string[];
    }) => AsyncIterable<StripeSubscriptionWithItems>;
  };
  webhooks: {
    constructEvent: (payload: string | Buffer, signature: string, secret: string) => StripeEvent;
  };
}

// Factory function type for dynamic loading
type StripeFactory = (secretKey: string, options: Record<string, unknown>) => StripeClient;

// ============================================================================
// STRIPE CLIENT (Optional Dependency)
// ============================================================================

let stripeClient: StripeClient | null = null;
let createStripeClient: StripeFactory | null = null;

/**
 * Lazily load Stripe module
 */
async function loadStripe(): Promise<void> {
  if (createStripeClient) return;
  try {
    const stripeModule = await import('stripe');
    const StripeClass = stripeModule.default;
    // Create a factory function that wraps the constructor
    createStripeClient = (secretKey: string, options: Record<string, unknown>): StripeClient => {
      return new StripeClass(secretKey, options) as unknown as StripeClient;
    };
  } catch {
    throw new Error('Stripe is not installed. Run: npm install stripe');
  }
}

/**
 * Get or create Stripe client
 */
async function getStripe(): Promise<StripeClient> {
  if (!stripeClient) {
    await loadStripe();
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    if (!createStripeClient) {
      throw new Error('Stripe module failed to load');
    }
    stripeClient = createStripeClient(secretKey, {
      // Use a stable API version - check Stripe docs for latest
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }
  return stripeClient;
}

/**
 * Check if Stripe is configured
 */
export function isStripeConfigured(): boolean {
  return !!(
    process.env.STRIPE_SECRET_KEY &&
    process.env.STRIPE_WEBHOOK_SECRET &&
    // Support multiple naming conventions for backward compatibility
    // New: STRIPE_PRICE_FOUNDING_MEMBER / STRIPE_PRICE_FOUNDING_PATRON
    // Old: STRIPE_PRICE_FRIEND / STRIPE_PRICE_PARTNER
    // Legacy: STRIPE_FRIEND_PRICE_ID / STRIPE_PARTNER_PRICE_ID
    (process.env.STRIPE_PRICE_FOUNDING_MEMBER ||
      process.env.STRIPE_PRICE_FOUNDING_PATRON ||
      process.env.STRIPE_PRICE_FRIEND ||
      process.env.STRIPE_FRIEND_PRICE_ID ||
      process.env.STRIPE_PRICE_PARTNER ||
      process.env.STRIPE_PARTNER_PRICE_ID)
  );
}

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

/**
 * Get or create a Stripe customer for a user
 */
export async function getOrCreateCustomer(
  userId: string,
  email?: string,
  name?: string
): Promise<string> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  // Return existing customer ID if we have one
  if (profile?.subscription?.stripeCustomerId) {
    return profile.subscription.stripeCustomerId;
  }

  const stripe = await getStripe();

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      ferni_user_id: userId,
    },
  });

  log.info({ userId, customerId: customer.id }, 'Created Stripe customer');

  // Save customer ID to profile
  if (profile) {
    const subscription = profile.subscription ?? createDefaultSubscription();
    subscription.stripeCustomerId = customer.id;
    await store.saveProfile({ ...profile, subscription, updatedAt: new Date() });
  }

  return customer.id;
}

// ============================================================================
// CHECKOUT & PORTAL
// ============================================================================

/**
 * Create a checkout session for subscribing
 *
 * Supports multi-currency pricing via the `currency` parameter.
 * If not specified, defaults to USD pricing.
 */
export async function createCheckoutSession(params: {
  userId: string;
  tier: 'friend' | 'partner';
  successUrl: string;
  cancelUrl: string;
  email?: string;
  name?: string;
  currency?: string; // e.g., 'USD', 'EUR', 'JPY', etc.
  /** Extra subscription metadata (garden-routes marks Seed Fund gifts) */
  metadata?: Record<string, string>;
}): Promise<{ sessionId: string; url: string }> {
  const { userId, tier, successUrl, cancelUrl, email, name, currency } = params;

  // Get the appropriate price ID based on currency
  let priceId: string;
  if (currency && currency !== 'USD') {
    // Use locale-specific price ID from pricing module
    try {
      const { getStripePriceId } = await import('../../i18n/pricing.js');
      priceId = getStripePriceId(tier, currency as 'USD');
    } catch {
      // Fallback to default USD price
      const config = TIER_CONFIGS[tier];
      if (!config.stripePriceId) {
        throw new Error(`No Stripe price configured for tier: ${tier}`);
      }
      priceId = config.stripePriceId;
    }
  } else {
    // Default to USD price from tier config
    const config = TIER_CONFIGS[tier];
    if (!config.stripePriceId) {
      throw new Error(`No Stripe price configured for tier: ${tier}`);
    }
    priceId = config.stripePriceId;
  }

  const stripe = await getStripe();
  const customerId = await getOrCreateCustomer(userId, email, name);

  // Build success URL - append session_id correctly based on existing query params
  const successUrlWithSession = successUrl.includes('?')
    ? `${successUrl}&session_id={CHECKOUT_SESSION_ID}`
    : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`;

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrlWithSession,
    cancel_url: cancelUrl,
    metadata: {
      ferni_user_id: userId,
      tier,
      currency: currency || 'USD',
      // Experiment tracking - which session length variant is this user in?
      free_session_minutes: process.env.FREE_SESSION_MINUTES || '7',
      experiment_cohort: process.env.EXPERIMENT_COHORT || 'control',
    },
    subscription_data: {
      metadata: {
        ferni_user_id: userId,
        tier,
        currency: currency || 'USD',
        free_session_minutes: process.env.FREE_SESSION_MINUTES || '7',
        experiment_cohort: process.env.EXPERIMENT_COHORT || 'control',
        ...params.metadata,
      },
    },
    // Allow promotion codes for beta users
    allow_promotion_codes: true,
    // Collect billing address for tax
    billing_address_collection: 'required',
  });

  log.info(
    { userId, tier, currency: currency || 'USD', sessionId: session.id },
    'Created checkout session'
  );

  return {
    sessionId: session.id,
    url: session.url!,
  };
}

/** The user's Stripe customer id, or null when they've never been a Stripe customer. */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const profile = await (await getStore()).getProfile(userId);
  return profile?.subscription?.stripeCustomerId ?? null;
}

/** Create a billing portal session for managing subscription */
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const customer = await getStripeCustomerId(userId);
  if (!customer) throw new Error('User does not have a Stripe customer ID');
  const stripe = await getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer,
    return_url: returnUrl,
  });
  log.info({ userId }, 'Created billing portal session');
  return { url: session.url };
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

/**
 * Map Stripe subscription status to our status type
 */
function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
  const statusMap: Record<string, SubscriptionStatus> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'incomplete',
    incomplete_expired: 'incomplete_expired',
    paused: 'paused',
  };
  return statusMap[stripeStatus] ?? 'active';
}

/**
 * Sync subscription data from Stripe to user profile. Someone also paying in
 * the App Store keeps the higher plan (paying-twice.ts), whichever side it's on.
 */
export async function syncSubscriptionFromStripe(
  userId: string,
  subscription: StripeSubscription
): Promise<SubscriptionData> {
  const store = await getStore();
  const profile = await store.getProfile(userId);
  if (!profile) {
    log.warn({ userId }, 'Cannot sync subscription - profile not found');
    throw new Error('User profile not found');
  }
  const tier = (subscription.metadata.tier as SubscriptionTier) ?? 'friend';
  const now = new Date();
  const updatedSubscription = nextSubscriptionFromStripe(
    profile.subscription ?? createDefaultSubscription(),
    {
      tier,
      status: mapStripeStatus(subscription.status),
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      createdAt: new Date(subscription.created * 1000),
      periodEnd: new Date(subscription.current_period_end * 1000),
      trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
    },
    now
  );
  await store.saveProfile({ ...profile, subscription: updatedSubscription, updatedAt: now });
  log.info(
    { userId, tier, status: subscription.status, provider: updatedSubscription.provider },
    'Synced subscription from Stripe'
  );
  return updatedSubscription;
}

/**
 * Handle subscription cancellation
 */
export async function handleCancellation(userId: string): Promise<void> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot handle cancellation - profile not found');
    return;
  }

  const subscription = profile.subscription ?? createDefaultSubscription();

  // Downgrade to free tier but keep current period access
  const updatedSubscription: SubscriptionData = {
    ...subscription,
    status: 'canceled',
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.info({ userId }, 'Subscription marked as canceled');
}

/**
 * The Stripe subscription ended: drop to free (keeping usage and the Stripe
 * customer for a resubscription), unless a live App Store plan takes over.
 */
export async function downgradeToFree(userId: string): Promise<void> {
  const store = await getStore();
  const profile = await store.getProfile(userId);
  if (!profile) {
    log.warn({ userId }, 'Cannot downgrade - profile not found');
    return;
  }
  const now = new Date();
  const current = profile.subscription ?? {
    ...createDefaultSubscription(),
    monthlyUsage: createFreshUsage(),
  };
  const next = nextSubscriptionFromStripe(current, 'ended', now);
  await store.saveProfile({ ...profile, subscription: next, updatedAt: now });
  log.info({ userId, tier: next.tier, provider: next.provider }, 'Stripe subscription ended');
}

/** Payment failed: only logged. Stripe retries; customer.subscription.updated sets status. */
async function handlePaymentFailure(stripeCustomerId: string): Promise<void> {
  log.warn({ stripeCustomerId }, 'Payment failure handling - user in grace period');
}

/**
 * Handle successful payment - clears any past_due status
 */
async function handlePaymentSuccess(stripeCustomerId: string): Promise<void> {
  log.info({ stripeCustomerId }, 'Payment successful - subscription active');
  // Status will be updated by customer.subscription.updated webhook
}

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Record a conversation and update usage
 * Returns the updated usage status
 */
export async function recordConversation(
  userId: string,
  durationMinutes = 0
): Promise<UsageStatus> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.debug({ userId }, 'Cannot record conversation - profile not found (new/anonymous user)');
    return {
      tier: 'free',
      usage: createFreshUsage(),
      conversationsRemaining: 5,
      minutesRemaining: 30,
      sessionLimitMinutes: 15,
      canStartConversation: true,
      statusMessage: "Something went wrong, but let's keep talking.",
      approachingLimit: false,
      atLimit: false,
      teamAccess: 'ferni-only',
      // Soft cap fields (default for unknown user)
      softConversationCap: 30,
      conversationsUsed: 0,
      approachingSoftCap: false,
      pastSoftCap: false,
      softCapMessage: null,
    };
  }

  const subscription = profile.subscription ?? createDefaultSubscription();

  // Reset usage if new month
  if (needsUsageReset(subscription.monthlyUsage)) {
    subscription.monthlyUsage = createFreshUsage();
  }

  // Increment usage
  subscription.monthlyUsage.conversationCount++;
  subscription.monthlyUsage.minutesTalked += durationMinutes;
  subscription.monthlyUsage.lastUpdated = new Date();

  // Save updated profile
  await store.saveProfile({
    ...profile,
    subscription,
    totalConversations: (profile.totalConversations ?? 0) + 1,
    totalMinutesTalked: (profile.totalMinutesTalked ?? 0) + durationMinutes,
    updatedAt: new Date(),
  });

  const status = calculateUsageStatus(subscription);

  log.debug(
    {
      userId,
      conversationCount: subscription.monthlyUsage.conversationCount,
      remaining: status.conversationsRemaining,
    },
    'Recorded conversation'
  );

  return status;
}

/**
 * Get current usage status for a user
 */
export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    // Return generous default for new users
    return {
      tier: 'free',
      usage: createFreshUsage(),
      conversationsRemaining: 5,
      minutesRemaining: 30,
      sessionLimitMinutes: 15,
      canStartConversation: true,
      statusMessage: 'Ready to meet you!',
      approachingLimit: false,
      atLimit: false,
      teamAccess: 'ferni-only',
      // Soft cap fields (default for new user)
      softConversationCap: 30,
      conversationsUsed: 0,
      approachingSoftCap: false,
      pastSoftCap: false,
      softCapMessage: null,
    };
  }

  const subscription = profile.subscription ?? createDefaultSubscription();
  return calculateUsageStatus(subscription);
}

/**
 * Check if user can start a new conversation
 */
export async function canStartConversation(userId: string): Promise<{
  allowed: boolean;
  reason?: string;
  upgradePrompt?: string;
}> {
  const status = await getUsageStatus(userId);

  if (status.canStartConversation) {
    // Add soft prompt if approaching limit
    if (status.approachingLimit) {
      return {
        allowed: true,
        upgradePrompt: getLimitMessage('approaching', {
          remaining: String(status.conversationsRemaining),
        }),
      };
    }
    return { allowed: true };
  }

  // At limit
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  nextMonth.setDate(1);

  return {
    allowed: false,
    reason: 'Monthly conversation limit reached',
    upgradePrompt: getLimitMessage('atLimit', {
      reset_date: nextMonth.toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
    }),
  };
}

// ============================================================================
// WEBHOOK HANDLING
// ============================================================================

/**
 * Verify and parse a Stripe webhook event
 */
export async function verifyWebhook(
  payload: string | Buffer,
  signature: string
): Promise<StripeEvent> {
  const stripe = await getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET not configured');
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

/**
 * Handle Stripe webhook events
 */
export async function handleWebhookEvent(event: StripeEvent): Promise<void> {
  log.info({ type: event.type, id: event.id }, 'Processing Stripe webhook');

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as StripeCheckoutSession;
      const userId = session.metadata?.ferni_user_id;
      if (userId && session.subscription) {
        const stripe = await getStripe();
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await syncSubscriptionFromStripe(userId, subscription);

        // 🧪 EXPERIMENT TRACKING: Log conversion with experiment cohort
        const experimentCohort = session.metadata?.experiment_cohort || 'control';
        const freeSessionMinutes = session.metadata?.free_session_minutes || '7';
        const tier = session.metadata?.tier || 'friend';

        log.info(
          {
            userId,
            tier,
            experimentCohort,
            freeSessionMinutes,
            conversionEvent: 'subscription_upgrade',
          },
          '🧪 EXPERIMENT CONVERSION: Subscription activated from checkout'
        );
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object as StripeSubscription;
      const userId = subscription.metadata?.ferni_user_id;
      if (userId) {
        await syncSubscriptionFromStripe(userId, subscription);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscription;
      const userId = subscription.metadata?.ferni_user_id;
      if (userId) {
        await downgradeToFree(userId);
        log.info({ userId }, 'Stripe subscription deleted');
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Grace period: Stripe retries, then cancels; customer.subscription.updated follows
      const invoice = event.data.object as StripeInvoice;
      log.warn({ customerId: invoice.customer, invoiceId: invoice.id }, 'Payment failed');
      await handlePaymentFailure(invoice.customer);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as StripeInvoice;
      log.info({ invoiceId: invoice.id }, 'Invoice paid successfully');
      await handlePaymentSuccess(invoice.customer);
      // The first invoice of a Seed Fund monthly gift pays the founding bonus (once, by key)
      await awardFoundingSeeds(invoice);
      break;
    }

    // Signed, so the Seed Fund bonus is paid here, not by the unsigned /api/monetization/webhook
    case 'payment_intent.succeeded':
      await awardContributionSeeds(event.data.object as SeedFundPaymentIntent);
      break;

    case 'customer.subscription.trial_will_end': {
      // Sent 3 days before trial ends - could trigger email reminder
      const subscription = event.data.object as StripeSubscription;
      log.info({ subscriptionId: subscription.id }, 'Trial ending soon');
      break;
    }

    default:
      log.debug({ type: event.type }, 'Unhandled webhook event type');
  }

  // After any subscription-related event, sync MRR to FinOps
  if (
    event.type.startsWith('customer.subscription.') ||
    event.type.startsWith('checkout.session.')
  ) {
    try {
      await syncMRRToFinOps();
    } catch (err) {
      log.warn({ error: String(err) }, 'Failed to sync MRR to FinOps (non-fatal)');
    }
  }
}

// ============================================================================
// FINOPS MRR SYNC
// ============================================================================

/**
 * Sync Monthly Recurring Revenue from Stripe to FinOps.
 * Calculates MRR from all active subscriptions.
 */
export async function syncMRRToFinOps(): Promise<{ mrr: number; subscriptionCount: number }> {
  if (!isStripeConfigured()) {
    log.debug('Stripe not configured, skipping MRR sync');
    return { mrr: 0, subscriptionCount: 0 };
  }

  const stripe = await getStripe();
  let mrr = 0;
  let subscriptionCount = 0;

  // Fetch all active subscriptions and sum up MRR
  // Use iteration to handle pagination
  for await (const subscription of stripe.subscriptions.list({
    status: 'active',
    limit: 100,
    expand: ['data.items.data.price'],
  })) {
    subscriptionCount++;

    // Sum up the MRR from subscription items
    for (const item of subscription.items.data) {
      const { price } = item;
      if (price && price.unit_amount) {
        // Convert to monthly amount
        if (price.recurring?.interval === 'month') {
          mrr += price.unit_amount / 100; // Stripe stores in cents
        } else if (price.recurring?.interval === 'year') {
          mrr += price.unit_amount / 100 / 12; // Convert annual to monthly
        }
      }
    }
  }

  // Also count trialing subscriptions (will convert)
  for await (const subscription of stripe.subscriptions.list({
    status: 'trialing',
    limit: 100,
    expand: ['data.items.data.price'],
  })) {
    // Count trialing but don't add to MRR (not yet paying)
    subscriptionCount++;
  }

  // Update FinOps with the calculated MRR
  finops.setMonthlyRevenue(mrr);

  log.info({ mrr, subscriptionCount }, 'Synced MRR to FinOps');
  return { mrr, subscriptionCount };
}

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/** Get subscription info for API response (safe to send to frontend) */
export async function getSubscriptionInfo(userId: string): Promise<{
  tier: SubscriptionTier;
  tierName: string;
  status: SubscriptionStatus;
  /** Where the paid plan is billed, so the web only offers the Stripe portal for Stripe. */
  billingSource: BillingSource;
  usage: UsageStatus;
  canUpgrade: boolean;
  prices: Array<{
    tier: SubscriptionTier;
    name: string;
    priceInCents: number;
    description: string;
  }>;
}> {
  const store = await getStore();
  const profile = await store.getProfile(userId);
  const subscription = profile?.subscription ?? createDefaultSubscription();
  const usage = calculateUsageStatus(subscription);
  const config = TIER_CONFIGS[subscription.tier];

  // Get upgrade options
  const prices = (['friend', 'partner'] as const)
    .filter((tier) => TIER_CONFIGS[tier].stripePriceId)
    .map((tier) => ({
      tier,
      name: TIER_CONFIGS[tier].name,
      priceInCents: TIER_CONFIGS[tier].priceInCents,
      description: TIER_CONFIGS[tier].description,
    }));

  return {
    tier: subscription.tier,
    tierName: config.name,
    status: subscription.status,
    billingSource: billingSourceOf(subscription),
    usage,
    canUpgrade: subscription.tier === 'free',
    prices,
  };
}
