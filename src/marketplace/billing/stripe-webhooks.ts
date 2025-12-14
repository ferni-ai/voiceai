/**
 * Marketplace Stripe Webhook Handlers
 *
 * Handles Stripe webhook events for marketplace purchases:
 * - One-time tool/agent purchases
 * - Usage-based billing
 * - Publisher payouts
 *
 * Events handled:
 * - checkout.session.completed - New purchase completed
 * - invoice.paid - Subscription renewed or usage-based charge
 * - invoice.payment_failed - Payment failed
 * - payout.paid - Publisher payout completed
 */

import Stripe from 'stripe';
import { getLogger } from '../../utils/safe-logger.js';
import { recordUsage, calculateRevenueShare, markPayoutComplete } from './index.js';
import type { MarketplaceId, UserId } from '../schema/types.js';

// Firestore helpers for marketplace data
async function savePurchase(purchase: MarketplacePurchase): Promise<void> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  await db.collection('marketplace_purchases').doc(purchase.id).set(purchase);
}

async function getPurchaseByPaymentIntent(paymentIntentId: string): Promise<MarketplacePurchase | null> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  const snapshot = await db
    .collection('marketplace_purchases')
    .where('stripePaymentIntentId', '==', paymentIntentId)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  return snapshot.docs[0].data() as MarketplacePurchase;
}

async function savePayout(payout: PublisherPayout): Promise<void> {
  const { getFirestore } = await import('firebase-admin/firestore');
  const db = getFirestore();
  await db.collection('marketplace_payouts').doc(payout.id).set(payout);
}

const log = getLogger().child({ module: 'marketplace-stripe-webhooks' });

// ============================================================================
// TYPES
// ============================================================================

export interface MarketplacePurchase {
  id: string;
  userId: UserId;
  itemId: MarketplaceId;
  itemType: 'tool' | 'agent';
  purchaseType: 'one-time' | 'subscription' | 'usage';
  amountCents: number;
  currency: string;
  stripePaymentIntentId?: string;
  stripeSubscriptionId?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  createdAt: string;
  completedAt?: string;
}

export interface PublisherPayout {
  id: string;
  publisherId: string;
  period: string;
  grossAmountCents: number;
  platformFeeCents: number;
  netAmountCents: number;
  stripePayoutId?: string;
  status: 'scheduled' | 'processing' | 'paid' | 'failed';
  createdAt: string;
  paidAt?: string;
}

// ============================================================================
// STRIPE CLIENT
// ============================================================================

let stripeClient: Stripe | null = null;

function getStripeClient(): Stripe {
  if (!stripeClient) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY not configured');
    }
    stripeClient = new Stripe(secretKey, { apiVersion: '2025-11-17.clover' });
  }
  return stripeClient;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET_MARKETPLACE;
}

// ============================================================================
// WEBHOOK VERIFICATION
// ============================================================================

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_MARKETPLACE;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET_MARKETPLACE not configured');
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

// ============================================================================
// WEBHOOK EVENT HANDLERS
// ============================================================================

/**
 * Handle checkout.session.completed event
 * Called when a customer completes a checkout for a marketplace item
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata || {};
  const {
    marketplace_item_id: itemId,
    marketplace_item_type: itemType,
    marketplace_purchase_type: purchaseType,
    ferni_user_id: userId,
    publisher_id: publisherId,
  } = metadata;

  if (!itemId || !userId) {
    log.warn({ sessionId: session.id }, 'Missing metadata in checkout session');
    return;
  }

  log.info(
    { sessionId: session.id, itemId, itemType, userId },
    'Marketplace checkout completed'
  );

  // Record the purchase
  const purchase: MarketplacePurchase = {
    id: `purchase_${session.id}`,
    userId: userId as UserId,
    itemId: itemId as MarketplaceId,
    itemType: (itemType || 'tool') as 'tool' | 'agent',
    purchaseType: (purchaseType || 'one-time') as 'one-time' | 'subscription' | 'usage',
    amountCents: session.amount_total || 0,
    currency: session.currency || 'usd',
    stripePaymentIntentId: session.payment_intent as string,
    stripeSubscriptionId: session.subscription as string,
    status: 'completed',
    createdAt: new Date(session.created * 1000).toISOString(),
    completedAt: new Date().toISOString(),
  };

  // Save purchase to Firestore
  try {
    await savePurchase(purchase);
  } catch (error) {
    log.error({ error: String(error), purchase }, 'Failed to save purchase');
  }

  // Calculate revenue share for publisher
  if (publisherId && purchase.amountCents > 0) {
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM
    calculateRevenueShare(
      purchase.itemId,
      publisherId,
      period,
      purchase.amountCents
    );
  }

  // Grant access to the item
  try {
    const { installItem } = await import('../index.js');
    await installItem({
      itemType: purchase.itemType,
      itemId: purchase.itemId,
      userId: purchase.userId,
      permissions: [], // Full access for purchased items
    });
    log.info({ itemId, userId }, 'Item access granted after purchase');
  } catch (error) {
    log.error({ error: String(error), itemId, userId }, 'Failed to grant item access');
  }
}

/**
 * Handle invoice.paid event
 * Called for subscription renewals or usage-based charges
 */
async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const metadata = invoice.metadata || {};
  const {
    marketplace_item_id: itemId,
    ferni_user_id: userId,
    publisher_id: publisherId,
    billing_type: billingType,
  } = metadata;

  // Skip if not a marketplace invoice
  if (!itemId || !userId) {
    return;
  }

  log.info(
    { invoiceId: invoice.id, itemId, userId, billingType },
    'Marketplace invoice paid'
  );

  // Calculate revenue share
  if (publisherId && invoice.amount_paid > 0) {
    const period = new Date().toISOString().slice(0, 7);
    calculateRevenueShare(
      itemId as MarketplaceId,
      publisherId,
      period,
      invoice.amount_paid
    );
  }

  // For usage-based billing, record the usage as paid
  if (billingType === 'usage') {
    recordUsage({
      userId: userId as UserId,
      itemId: itemId as MarketplaceId,
      itemType: 'tool',
      timestamp: new Date().toISOString(),
      metrics: {
        executions: 0,
        executionTimeMs: 0,
        dataTransferBytes: 0,
      },
    });
  }
}

/**
 * Handle invoice.payment_failed event
 */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const metadata = invoice.metadata || {};
  const { marketplace_item_id: itemId, ferni_user_id: userId } = metadata;

  if (!itemId || !userId) {
    return;
  }

  log.warn(
    { invoiceId: invoice.id, itemId, userId },
    'Marketplace invoice payment failed'
  );

  // Could suspend access here, but we'll be graceful and let them retry
  // TODO: Send notification to user about failed payment
}

/**
 * Handle payout.paid event
 * Called when a publisher payout is completed
 */
async function handlePayoutPaid(payout: Stripe.Payout): Promise<void> {
  const metadata = payout.metadata || {};
  const { publisher_id: publisherId, period } = metadata;

  if (!publisherId || !period) {
    return;
  }

  log.info(
    { payoutId: payout.id, publisherId, period, amount: payout.amount },
    'Publisher payout completed'
  );

  // Mark revenue share as paid
  markPayoutComplete(`${publisherId}:${period}`);

  // Save payout record
  const payoutRecord: PublisherPayout = {
    id: `payout_${payout.id}`,
    publisherId,
    period,
    grossAmountCents: payout.amount,
    platformFeeCents: 0, // Already deducted
    netAmountCents: payout.amount,
    stripePayoutId: payout.id,
    status: 'paid',
    createdAt: new Date(payout.created * 1000).toISOString(),
    paidAt: new Date().toISOString(),
  };

  try {
    await savePayout(payoutRecord);
  } catch (error) {
    log.error({ error: String(error), payoutRecord }, 'Failed to save payout record');
  }
}

/**
 * Handle customer.subscription.deleted event
 * Called when a marketplace subscription is cancelled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const metadata = subscription.metadata || {};
  const { marketplace_item_id: itemId, ferni_user_id: userId } = metadata;

  if (!itemId || !userId) {
    return;
  }

  log.info(
    { subscriptionId: subscription.id, itemId, userId },
    'Marketplace subscription cancelled'
  );

  // Uninstall the item (revoke access)
  try {
    const { uninstallItem } = await import('../index.js');
    // Need to find installation ID first
    const { listInstallations } = await import('../index.js');
    const installations = await listInstallations(userId as UserId);
    const installation = installations.find((i) => i.itemId === itemId);

    if (installation) {
      await uninstallItem(installation.id);
      log.info({ itemId, userId }, 'Item access revoked after subscription cancellation');
    }
  } catch (error) {
    log.error({ error: String(error), itemId, userId }, 'Failed to revoke item access');
  }
}

// ============================================================================
// MAIN WEBHOOK HANDLER
// ============================================================================

/**
 * Handle Stripe webhook event
 */
export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  log.debug({ eventType: event.type, eventId: event.id }, 'Processing webhook event');

  switch (event.type) {
    case 'checkout.session.completed':
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      break;

    case 'invoice.paid':
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      break;

    case 'invoice.payment_failed':
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      break;

    case 'payout.paid':
      await handlePayoutPaid(event.data.object as Stripe.Payout);
      break;

    case 'customer.subscription.deleted':
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;

    default:
      log.debug({ eventType: event.type }, 'Unhandled webhook event type');
  }
}

// ============================================================================
// CHECKOUT SESSION CREATION
// ============================================================================

export interface CreateMarketplaceCheckoutParams {
  userId: UserId;
  itemId: MarketplaceId;
  itemType: 'tool' | 'agent';
  itemName: string;
  publisherId: string;
  priceInCents: number;
  purchaseType: 'one-time' | 'subscription';
  successUrl: string;
  cancelUrl: string;
  email?: string;
}

/**
 * Create a Stripe checkout session for a marketplace item
 */
export async function createMarketplaceCheckout(
  params: CreateMarketplaceCheckoutParams
): Promise<{ sessionId: string; url: string }> {
  const stripe = getStripeClient();

  const session = await stripe.checkout.sessions.create({
    mode: params.purchaseType === 'subscription' ? 'subscription' : 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: params.itemName,
            metadata: {
              marketplace_item_id: params.itemId,
              marketplace_item_type: params.itemType,
            },
          },
          unit_amount: params.priceInCents,
          ...(params.purchaseType === 'subscription' && {
            recurring: { interval: 'month' },
          }),
        },
        quantity: 1,
      },
    ],
    metadata: {
      marketplace_item_id: params.itemId,
      marketplace_item_type: params.itemType,
      marketplace_purchase_type: params.purchaseType,
      ferni_user_id: params.userId,
      publisher_id: params.publisherId,
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    customer_email: params.email,
  });

  log.info(
    { sessionId: session.id, itemId: params.itemId, userId: params.userId },
    'Marketplace checkout session created'
  );

  return {
    sessionId: session.id,
    url: session.url!,
  };
}

// ============================================================================
// PUBLISHER PAYOUT
// ============================================================================

export interface CreatePublisherPayoutParams {
  publisherId: string;
  stripeConnectAccountId: string;
  amountCents: number;
  period: string;
  description?: string;
}

/**
 * Create a payout to a publisher via Stripe Connect
 */
export async function createPublisherPayout(
  params: CreatePublisherPayoutParams
): Promise<{ transferId: string }> {
  const stripe = getStripeClient();

  // Create transfer to connected account
  const transfer = await stripe.transfers.create({
    amount: params.amountCents,
    currency: 'usd',
    destination: params.stripeConnectAccountId,
    description: params.description || `Marketplace payout for ${params.period}`,
    metadata: {
      publisher_id: params.publisherId,
      period: params.period,
    },
  });

  log.info(
    { transferId: transfer.id, publisherId: params.publisherId, amount: params.amountCents },
    'Publisher payout transfer created'
  );

  return { transferId: transfer.id };
}
