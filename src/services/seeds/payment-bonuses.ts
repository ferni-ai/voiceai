/**
 * Seed Fund bonuses, paid by the server from Stripe's word instead of the browser's.
 *
 * The web used to award these when Stripe.js said a card went through (one-time gift) or
 * when the tab came back to /garden/success (monthly gift): the client's word, once per
 * device. Here the facts come from signed Stripe webhooks and go through the ledger, keyed
 * by Stripe ids, so a redelivered event never pays twice.
 *
 * The tiers are the web's (seeds-economy.service.ts, seed-payment.ts); a test reads those
 * files and fails if the two drift. Plan: docs/plans/2026-10-10-one-seed-ledger.md
 *
 * @module services/seeds/payment-bonuses
 */
import admin from 'firebase-admin';
import { createLogger } from '../../utils/safe-logger.js';
import { applySeeds, type SeedResult } from './ledger.js';

const log = createLogger({ module: 'SeedPaymentBonuses' });

/** One-time gift: the largest tier the amount reaches pays (web: recordContribution). */
export const CONTRIBUTION_TIERS = [
  { minCents: 5000, seeds: 200 },
  { minCents: 2500, seeds: 75 },
  { minCents: 1000, seeds: 25 },
  { minCents: 500, seeds: 10 },
] as const;

/** Monthly gift, first payment only: founding patron $20+, founding member $10+. */
export const FOUNDING_TIERS = [
  { minCents: 2000, seeds: 150 },
  { minCents: 1000, seeds: 50 },
] as const;

function tierSeeds(
  tiers: ReadonlyArray<{ minCents: number; seeds: number }>,
  cents: number
): number {
  if (!Number.isFinite(cents)) return 0;
  return tiers.find((tier) => cents >= tier.minCents)?.seeds ?? 0;
}

/** Bonus seeds for a one-time Seed Fund gift of `amountCents` (0 under $5). */
export function contributionSeeds(amountCents: number): number {
  return tierSeeds(CONTRIBUTION_TIERS, amountCents);
}

/** Founding bonus for a monthly gift of `monthlyAmountCents` (0 under $10). */
export function foundingSeeds(monthlyAmountCents: number): number {
  return tierSeeds(FOUNDING_TIERS, monthlyAmountCents);
}

/** The PaymentIntent fields we read. Metadata is set by the server (POST /api/garden/plant). */
export interface SeedFundPaymentIntent {
  id: string;
  amount: number;
  amount_received?: number;
  metadata?: Record<string, string> | null;
}

/** The invoice fields we read (Stripe API 2023-10-16 snapshots subscription metadata). */
export interface SeedFundInvoice {
  id: string;
  subscription?: string | { id: string } | null;
  billing_reason?: string | null;
  amount_paid?: number;
  subscription_details?: { metadata?: Record<string, string> | null } | null;
}

/**
 * `payment_intent.succeeded`: a Seed Fund plant pays its contribution bonus to the account
 * that planted it. Other payments (tips, subscriptions' own intents) pay nothing.
 */
export async function awardContributionSeeds(
  intent: SeedFundPaymentIntent,
  db?: admin.firestore.Firestore
): Promise<SeedResult | null> {
  const meta = intent.metadata ?? {};
  const uid = meta.ferni_user_id;
  if (meta.payment_type !== 'ferni_fund' || meta.garden_type !== 'one_time' || !uid) return null;

  const amountCents = intent.amount_received ?? intent.amount;
  const seeds = contributionSeeds(amountCents);
  if (seeds <= 0) return null;

  const result = await applySeeds(db ?? admin.firestore(), uid, {
    delta: seeds,
    reason: 'contribution',
    key: `stripe:${intent.id}`,
    meta: { amountCents },
  });
  log.info({ uid, paymentIntentId: intent.id, seeds, applied: result.applied }, 'Seed Fund bonus');
  return result;
}

/**
 * `invoice.paid`: the first invoice of a Seed Fund monthly gift pays the founding bonus,
 * by what Stripe charged. Renewals pay nothing; neither does a subscription started without
 * a verified account (no `seeds_uid`).
 */
export async function awardFoundingSeeds(
  invoice: SeedFundInvoice,
  db?: admin.firestore.Firestore
): Promise<SeedResult | null> {
  const meta = invoice.subscription_details?.metadata ?? {};
  const uid = meta.seeds_uid;
  const sub = invoice.subscription;
  const subscriptionId = typeof sub === 'string' ? sub : sub?.id;
  if (invoice.billing_reason !== 'subscription_create' || meta.garden_type !== 'monthly') {
    return null;
  }
  if (!uid || !subscriptionId) return null;

  const amountCents = invoice.amount_paid ?? 0;
  const seeds = foundingSeeds(amountCents);
  if (seeds <= 0) return null;

  const result = await applySeeds(db ?? admin.firestore(), uid, {
    delta: seeds,
    reason: 'subscription',
    key: `stripe-sub:${subscriptionId}:founding`,
    meta: { amountCents, invoiceId: invoice.id },
  });
  log.info({ uid, subscriptionId, seeds, applied: result.applied }, 'Founding bonus');
  return result;
}
