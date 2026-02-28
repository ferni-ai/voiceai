/**
 * Billing Bounded Context Index
 *
 * Central export point for all billing and subscription modules:
 * - Apple IAP: App Store subscriptions and in-app purchases
 * - Stripe Payments: One-time payments (tips, value capture, fund)
 * - Stripe Subscription: Subscription lifecycle management
 * - Subscription Metrics: MRR, churn, conversion tracking
 * - First Taste Trial: New user trial experience
 *
 * @module services/billing
 */

// =============================================================================
// APPLE IN-APP PURCHASES
// =============================================================================

export * from './apple-iap.js';

// =============================================================================
// STRIPE PAYMENTS (One-time)
// =============================================================================

export * from './stripe-payments.js';

// =============================================================================
// STRIPE SUBSCRIPTIONS (skip isStripeConfigured — already exported by stripe-payments)
// =============================================================================

export {
  getOrCreateCustomer,
  createCheckoutSession,
  createPortalSession,
  syncSubscriptionFromStripe,
  handleCancellation,
  downgradeToFree,
  recordConversation,
  getUsageStatus,
  canStartConversation,
  verifyWebhook,
  handleWebhookEvent,
  syncMRRToFinOps,
  getSubscriptionInfo,
} from './stripe-subscription.js';

// =============================================================================
// SUBSCRIPTION METRICS
// =============================================================================

export * from './subscription-metrics.js';

// =============================================================================
// FIRST TASTE TRIAL
// =============================================================================

export * from './first-taste-trial.js';
