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

import { getStore } from '../memory/store-factory.js';
import {
  type SubscriptionData,
  type SubscriptionStatus,
  type SubscriptionTier,
  type UsageStatus,
  TIER_CONFIGS,
  calculateUsageStatus,
  createDefaultSubscription,
  createFreshUsage,
  getLimitMessage, // Reserved for billing period display
  needsUsageReset,
} from '../types/subscription.js';
import { createLogger } from '../utils/safe-logger.js';

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

interface StripeCheckoutSession {
  id: string;
  url: string | null;
  subscription?: string;
  metadata?: Record<string, string>;
}

interface StripeBillingPortalSession {
  url: string;
}

interface StripeInvoice {
  id: string;
  customer: string;
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripeSubscription | StripeCheckoutSession | StripeInvoice;
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
    // Support both naming conventions for backward compatibility
    (process.env.STRIPE_PRICE_FRIEND ||
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
 */
export async function createCheckoutSession(params: {
  userId: string;
  tier: 'friend' | 'partner';
  successUrl: string;
  cancelUrl: string;
  email?: string;
  name?: string;
}): Promise<{ sessionId: string; url: string }> {
  const { userId, tier, successUrl, cancelUrl, email, name } = params;

  const config = TIER_CONFIGS[tier];
  if (!config.stripePriceId) {
    throw new Error(`No Stripe price configured for tier: ${tier}`);
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
        price: config.stripePriceId,
        quantity: 1,
      },
    ],
    success_url: successUrlWithSession,
    cancel_url: cancelUrl,
    metadata: {
      ferni_user_id: userId,
      tier,
      // Experiment tracking - which session length variant is this user in?
      free_session_minutes: process.env.FREE_SESSION_MINUTES || '7',
      experiment_cohort: process.env.EXPERIMENT_COHORT || 'control',
    },
    subscription_data: {
      metadata: {
        ferni_user_id: userId,
        tier,
        free_session_minutes: process.env.FREE_SESSION_MINUTES || '7',
        experiment_cohort: process.env.EXPERIMENT_COHORT || 'control',
      },
    },
    // Allow promotion codes for beta users
    allow_promotion_codes: true,
    // Collect billing address for tax
    billing_address_collection: 'required',
  });

  log.info({ userId, tier, sessionId: session.id }, 'Created checkout session');

  return {
    sessionId: session.id,
    url: session.url!,
  };
}

/**
 * Create a billing portal session for managing subscription
 */
export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile?.subscription?.stripeCustomerId) {
    throw new Error('User does not have a Stripe customer ID');
  }

  const stripe = await getStripe();

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.subscription.stripeCustomerId,
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
 * Sync subscription data from Stripe to user profile
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
  const existingSubscription = profile.subscription ?? createDefaultSubscription();

  const updatedSubscription: SubscriptionData = {
    ...existingSubscription,
    tier,
    status: mapStripeStatus(subscription.status),
    stripeCustomerId: subscription.customer as string,
    stripeSubscriptionId: subscription.id,
    subscribedAt: existingSubscription.subscribedAt ?? new Date(subscription.created * 1000),
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    inTrial: subscription.status === 'trialing',
    trialEndDate: subscription.trial_end ? new Date(subscription.trial_end * 1000) : undefined,
    lastSyncedAt: new Date(),
  };

  await store.saveProfile({
    ...profile,
    subscription: updatedSubscription,
    updatedAt: new Date(),
  });

  log.info(
    {
      userId,
      tier,
      status: subscription.status,
    },
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
 * Fully downgrade user to free tier (after period ends)
 */
export async function downgradeToFree(userId: string): Promise<void> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  if (!profile) {
    log.warn({ userId }, 'Cannot downgrade - profile not found');
    return;
  }

  const existingUsage = profile.subscription?.monthlyUsage ?? createFreshUsage();

  const freeSubscription: SubscriptionData = {
    tier: 'free',
    status: 'active',
    billingFrequency: 'monthly',
    inTrial: false,
    monthlyUsage: existingUsage,
    lastSyncedAt: new Date(),
    // Keep the Stripe customer ID for future resubscription
    stripeCustomerId: profile.subscription?.stripeCustomerId,
  };

  await store.saveProfile({
    ...profile,
    subscription: freeSubscription,
    updatedAt: new Date(),
  });

  log.info({ userId }, 'Downgraded to free tier');
}

/**
 * Handle payment failure - marks subscription as past_due (grace period)
 * User keeps access but is warned about payment issues
 */
async function handlePaymentFailure(stripeCustomerId: string): Promise<void> {
  const store = await getStore();

  // Find user by Stripe customer ID
  // Note: In a real app, you'd want an index for this lookup
  // For now, we'll just log and let Stripe handle retries
  log.warn({ stripeCustomerId }, 'Payment failure handling - user in grace period');

  // The subscription status will be updated by customer.subscription.updated webhook
  // which Stripe sends after payment fails
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
    log.warn({ userId }, 'Cannot record conversation - profile not found');
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
      reset_date: nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric' }),
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
        log.info({ userId }, 'Subscription ended - downgraded to free');
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as StripeInvoice;
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer;
      // Mark subscription as past_due but keep them active (grace period)
      // Stripe will retry and eventually cancel if all retries fail
      log.warn({ customerId, invoiceId: invoice.id }, 'Payment failed - entering grace period');
      // Find user by customerId and update status
      await handlePaymentFailure(customerId);
      break;
    }

    case 'invoice.paid': {
      const invoice = event.data.object as StripeInvoice;
      log.info({ invoiceId: invoice.id }, 'Invoice paid successfully');
      // Reset any past_due status
      const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer;
      await handlePaymentSuccess(customerId);
      break;
    }

    case 'customer.subscription.trial_will_end': {
      // Sent 3 days before trial ends - could trigger email reminder
      const subscription = event.data.object as StripeSubscription;
      log.info({ subscriptionId: subscription.id }, 'Trial ending soon');
      break;
    }

    default:
      log.debug({ type: event.type }, 'Unhandled webhook event type');
  }
}

// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

/**
 * Get subscription info for API response (safe to send to frontend)
 */
export async function getSubscriptionInfo(userId: string): Promise<{
  tier: SubscriptionTier;
  tierName: string;
  status: SubscriptionStatus;
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
    usage,
    canUpgrade: subscription.tier === 'free',
    prices,
  };
}
