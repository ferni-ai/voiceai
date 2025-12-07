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
import { createLogger } from '../utils/logger.js';
import type { UserProfile } from '../types/user-profile.js';
import {
  type SubscriptionTier,
  type SubscriptionData,
  type SubscriptionStatus,
  type UsageStatus,
  TIER_CONFIGS,
  createDefaultSubscription,
  calculateUsageStatus,
  getCurrentPeriod,
  needsUsageReset,
  createFreshUsage,
  getLimitMessage,
} from '../types/subscription.js';

const log = createLogger({ module: 'StripeSubscription' });

// ============================================================================
// STRIPE CLIENT (Optional Dependency)
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let stripeClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let StripeConstructor: any = null;

/**
 * Lazily load Stripe module
 */
async function loadStripe(): Promise<void> {
  if (StripeConstructor) return;
  try {
    const stripeModule = await import('stripe');
    StripeConstructor = stripeModule.default;
  } catch {
    throw new Error('Stripe is not installed. Run: npm install stripe');
  }
}

/**
 * Get or create Stripe client
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getStripe(): Promise<any> {
  if (!stripeClient) {
    await loadStripe();
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    stripeClient = new StripeConstructor(secretKey, {
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
    (process.env.STRIPE_PRICE_FRIEND || process.env.STRIPE_PRICE_PARTNER)
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
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: {
      ferni_user_id: userId,
      tier,
    },
    subscription_data: {
      metadata: {
        ferni_user_id: userId,
        tier,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStripeStatus(stripeStatus: any): SubscriptionStatus {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncSubscriptionFromStripe(
  userId: string,
  subscription: any // Stripe.Subscription
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

// ============================================================================
// USAGE TRACKING
// ============================================================================

/**
 * Record a conversation and update usage
 * Returns the updated usage status
 */
export async function recordConversation(
  userId: string,
  durationMinutes: number = 0
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
      canStartConversation: true,
      statusMessage: "Something went wrong, but let's keep talking.",
      approachingLimit: false,
      atLimit: false,
    };
  }

  let subscription = profile.subscription ?? createDefaultSubscription();

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
      canStartConversation: true,
      statusMessage: 'Ready to meet you!',
      approachingLimit: false,
      atLimit: false,
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function verifyWebhook(payload: string | Buffer, signature: string): Promise<any> {
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function handleWebhookEvent(event: any): Promise<void> {
  log.info({ type: event.type, id: event.id }, 'Processing Stripe webhook');

  switch (event.type) {
    case 'checkout.session.completed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = event.data.object as any;
      const userId = session.metadata?.ferni_user_id;
      if (userId && session.subscription) {
        const stripe = await getStripe();
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await syncSubscriptionFromStripe(userId, subscription);
        log.info({ userId }, 'Subscription activated from checkout');
      }
      break;
    }

    case 'customer.subscription.updated': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = event.data.object as any;
      const userId = subscription.metadata?.ferni_user_id;
      if (userId) {
        await syncSubscriptionFromStripe(userId, subscription);
      }
      break;
    }

    case 'customer.subscription.deleted': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subscription = event.data.object as any;
      const userId = subscription.metadata?.ferni_user_id;
      if (userId) {
        await downgradeToFree(userId);
        log.info({ userId }, 'Subscription ended - downgraded to free');
      }
      break;
    }

    case 'invoice.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      const customerId = invoice.customer as string;
      // Log for monitoring, but Stripe handles retry logic
      log.warn({ customerId, invoiceId: invoice.id }, 'Payment failed');
      break;
    }

    case 'invoice.paid': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any;
      log.info({ invoiceId: invoice.id }, 'Invoice paid successfully');
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

