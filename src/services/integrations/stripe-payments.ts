/**
 * Stripe Payments Service
 *
 * Handles one-time payments for Ferni's value-aligned monetization:
 * - Tips (gratitude-based)
 * - Value Capture (outcome-based contributions)
 * - Ferni Fund (pay-it-forward community pool)
 *
 * Philosophy: These aren't transactions - they're expressions of gratitude
 * and community support. Handle them with care.
 */

import { getConfig } from '../config/environment.js';
import { getStore } from '../memory/store-factory.js';
import { createDefaultMonetizationData, type UserMonetizationData } from '../types/monetization.js';
import { createLogger } from '../utils/safe-logger.js';
import { getCircuitBreaker } from '../utils/circuit-breaker.js';

const log = createLogger({ module: 'StripePayments' });

// Circuit breaker for Stripe API - prevents hammering a failing payment service
const stripeCircuitBreaker = getCircuitBreaker('stripe-payments', {
  failureThreshold: 3, // Open circuit after 3 failures (payments are critical)
  resetTimeout: 60_000, // Try again after 60s
  successThreshold: 2, // Need 2 successes to close
});

// ============================================================================
// STRIPE TYPES (for one-time payments)
// ============================================================================

interface StripePaymentIntent {
  id: string;
  client_secret: string;
  status: string;
  amount: number;
  currency: string;
  metadata: Record<string, string>;
}

interface StripeClient {
  paymentIntents: {
    create: (params: {
      amount: number;
      currency: string;
      metadata?: Record<string, string>;
      description?: string;
      automatic_payment_methods?: { enabled: boolean };
    }) => Promise<StripePaymentIntent>;
    retrieve: (id: string) => Promise<StripePaymentIntent>;
  };
}

// Factory function type for dynamic loading
type StripeFactory = (secretKey: string, options: Record<string, unknown>) => StripeClient;

// ============================================================================
// STRIPE CLIENT (Optional Dependency)
// ============================================================================

let stripeClient: StripeClient | null = null;
let createStripeClient: StripeFactory | null = null;

async function loadStripe(): Promise<void> {
  if (createStripeClient) return;
  try {
    const stripeModule = await import('stripe');
    const StripeClass = stripeModule.default;
    createStripeClient = (secretKey: string, options: Record<string, unknown>): StripeClient => {
      return new StripeClass(secretKey, options) as unknown as StripeClient;
    };
  } catch {
    throw new Error('Stripe is not installed. Run: npm install stripe');
  }
}

async function getStripe(): Promise<StripeClient> {
  if (!stripeClient) {
    await loadStripe();
    const secretKey = getConfig().payments.stripeSecretKey;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    if (!createStripeClient) {
      throw new Error('Stripe module failed to load');
    }
    stripeClient = createStripeClient(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true,
    });
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!getConfig().payments.stripeSecretKey;
}

// ============================================================================
// PAYMENT TYPES
// ============================================================================

export type PaymentType =
  | 'tip'
  | 'value_capture'
  | 'ferni_fund'
  | 'b2b_subscription'
  | 'journey_companion';

export interface PaymentRecord {
  id: string;
  userId: string;
  type: PaymentType;
  amountCents: number;
  status: 'pending' | 'succeeded' | 'failed';
  stripePaymentIntentId?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  completedAt?: Date;
}

// ============================================================================
// ONE-TIME PAYMENT FUNCTIONS
// ============================================================================

/**
 * Create a payment intent for one-time contribution
 */
export async function createPaymentIntent(params: {
  userId: string;
  amountCents: number;
  type: PaymentType;
  description?: string;
  metadata?: Record<string, string>;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
}> {
  const { userId, amountCents, type, description, metadata = {} } = params;

  if (amountCents < 100) {
    throw new Error('Minimum payment is $1.00');
  }

  if (amountCents > 100000) {
    throw new Error('Maximum payment is $1,000.00');
  }

  const stripe = await getStripe();

  const descriptions: Record<PaymentType, string> = {
    tip: 'Tip for Ferni - Thank you for your support!',
    value_capture: 'Value Sharing - Celebrating your success!',
    ferni_fund: 'Ferni Fund - Pay it forward contribution',
    b2b_subscription: 'Ferni for Teams',
    journey_companion: 'Season Companion - Support your journey',
  };

  const paymentIntent = await stripeCircuitBreaker.execute(async () =>
    stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      description: description || descriptions[type],
      metadata: {
        ferni_user_id: userId,
        payment_type: type,
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    })
  );

  log.info(
    {
      userId,
      type,
      amountCents,
      paymentIntentId: paymentIntent.id,
    },
    'Payment intent created'
  );

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

/**
 * Verify a payment intent succeeded
 */
export async function verifyPayment(paymentIntentId: string): Promise<{
  succeeded: boolean;
  amountCents: number;
  type: PaymentType;
  userId: string;
}> {
  const stripe = await getStripe();
  const paymentIntent = await stripeCircuitBreaker.execute(async () =>
    stripe.paymentIntents.retrieve(paymentIntentId)
  );

  const succeeded = paymentIntent.status === 'succeeded';
  const type = (paymentIntent.metadata.payment_type as PaymentType) || 'tip';
  const userId = paymentIntent.metadata.ferni_user_id || '';

  if (succeeded) {
    log.info(
      {
        paymentIntentId,
        type,
        amountCents: paymentIntent.amount,
      },
      'Payment verified successful'
    );
  }

  return {
    succeeded,
    amountCents: paymentIntent.amount,
    type,
    userId,
  };
}

/**
 * Record a completed payment in user's monetization data
 */
export async function recordPayment(params: {
  userId: string;
  type: PaymentType;
  amountCents: number;
  paymentIntentId: string;
}): Promise<UserMonetizationData> {
  const { userId, type, amountCents, paymentIntentId } = params;

  const store = await getStore();
  const profile = await store.getOrCreateProfile(userId);

  // Get or create monetization data
  const monetization: UserMonetizationData =
    (profile as { monetization?: UserMonetizationData }).monetization ||
    createDefaultMonetizationData();

  // Update based on type
  switch (type) {
    case 'tip':
      monetization.totalTipsCents += amountCents;
      monetization.tipCount++;
      break;
    case 'value_capture':
      monetization.totalValueContributionsCents += amountCents;
      monetization.valueEventCount++;
      break;
    case 'ferni_fund':
      monetization.totalFundContributionsCents += amountCents;
      monetization.fundContributionCount++;
      break;
  }

  // Save updated profile
  await store.saveProfile({
    ...profile,
    monetization,
    updatedAt: new Date(),
  } as typeof profile & { monetization: UserMonetizationData });

  log.info(
    {
      userId,
      type,
      amountCents,
      paymentIntentId,
    },
    'Payment recorded to user profile'
  );

  return monetization;
}

/**
 * Get user's monetization data
 */
export async function getUserMonetizationData(userId: string): Promise<UserMonetizationData> {
  const store = await getStore();
  const profile = await store.getProfile(userId);

  return (
    (profile as { monetization?: UserMonetizationData })?.monetization ||
    createDefaultMonetizationData()
  );
}

/**
 * Get aggregate monetization stats (for admin dashboard)
 */
export async function getMonetizationStats(): Promise<{
  totalTipsCents: number;
  totalValueCaptureCents: number;
  totalFundCents: number;
  totalRevenueCents: number;
}> {
  // In production, this would aggregate from database
  // For now, return zeros as we don't have aggregate storage
  return {
    totalTipsCents: 0,
    totalValueCaptureCents: 0,
    totalFundCents: 0,
    totalRevenueCents: 0,
  };
}

// ============================================================================
// WEBHOOK HANDLER FOR PAYMENTS
// ============================================================================

/**
 * Handle successful payment webhook
 * Called from stripe-subscription.ts webhook handler
 */
export async function handlePaymentSucceeded(paymentIntent: {
  id: string;
  amount: number;
  metadata: Record<string, string>;
}): Promise<void> {
  const type = (paymentIntent.metadata.payment_type as PaymentType) || 'tip';
  const userId = paymentIntent.metadata.ferni_user_id;

  if (!userId) {
    log.warn({ paymentIntentId: paymentIntent.id }, 'Payment succeeded but no user ID in metadata');
    return;
  }

  await recordPayment({
    userId,
    type,
    amountCents: paymentIntent.amount,
    paymentIntentId: paymentIntent.id,
  });

  // Update service-specific tracking
  switch (type) {
    case 'tip': {
      // Import and update tip jar
      const { tipJar } = await import('./monetization/tip-jar.js');
      await tipJar.complete(paymentIntent.metadata.tip_id || '', paymentIntent.id);
      break;
    }

    case 'value_capture': {
      // Import and update value capture
      const { valueCapture } = await import('./monetization/value-capture.js');
      await valueCapture.recordContribution({
        eventId: paymentIntent.metadata.event_id || '',
        amountCents: paymentIntent.amount,
        stripePaymentId: paymentIntent.id,
      });
      break;
    }

    case 'ferni_fund': {
      // Import and update ferni fund
      const { ferniFund } = await import('./monetization/ferni-fund.js');
      await ferniFund.contribute({
        userId,
        amountCents: paymentIntent.amount,
        message: paymentIntent.metadata.message,
        stripePaymentId: paymentIntent.id,
      });
      break;
    }
  }

  log.info(
    {
      type,
      userId,
      amountCents: paymentIntent.amount,
    },
    'Payment succeeded and processed'
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export const stripePayments = {
  isConfigured: isStripeConfigured,
  createPaymentIntent,
  verifyPayment,
  recordPayment,
  getUserData: getUserMonetizationData,
  getStats: getMonetizationStats,
  handlePaymentSucceeded,
};

export default stripePayments;
