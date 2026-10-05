/**
 * Paying twice (App Store and Stripe): which plan is in charge of the profile.
 *
 * One rule, used by both sides (apple-entitlement.ts for App Store events,
 * stripe-subscription.ts for Stripe webhooks):
 * - The higher tier wins. On a tie the live Stripe plan is in charge.
 * - The plan not in charge is remembered, so it takes over when the other one
 *   ends: stripeTierUnderApple for a Stripe plan under a higher App Store one,
 *   appleTierUnderStripe (and appleExpiresUnderStripe) for an App Store plan
 *   under a Stripe one at least as high.
 * - A live Stripe plan: a Stripe subscription id, a paid tier, and status
 *   active, trialing or past_due. A live App Store plan: the App Store is in
 *   charge (or remembered) with a paid tier, and it hasn't expired.
 *
 * Firestore keeps a cleared field as null (the store writes undefined as null),
 * so every check here treats null as absent.
 *
 * @module services/billing/paying-twice
 */
import type {
  SubscriptionData,
  SubscriptionStatus,
  SubscriptionTier,
} from '../../types/subscription.js';

const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, friend: 1, partner: 2 };
const LIVE_STRIPE_STATUSES: ReadonlySet<string> = new Set(['active', 'trialing', 'past_due']);

/** The rule: Stripe is in charge when its tier is at least the App Store's. */
export function stripeKeepsCharge(
  stripeTier: SubscriptionTier,
  appleTier: SubscriptionTier
): boolean {
  return TIER_RANK[stripeTier] >= TIER_RANK[appleTier];
}

/** Milliseconds for a stored date (Date, ISO string, epoch, or Firestore Timestamp). */
export function ms(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
  const toDate = (value as { toDate?: () => Date } | null | undefined)?.toDate;
  return typeof toDate === 'function' ? toDate.call(value).getTime() : undefined;
}

/** The later of two stored dates; undefined when neither is set. */
export function later(a: unknown, b: unknown): Date | undefined {
  const x = ms(a);
  const y = ms(b);
  if (x === undefined) return y === undefined ? undefined : new Date(y);
  return new Date(y === undefined ? x : Math.max(x, y));
}

export function hasLiveStripePlan(sub: SubscriptionData): boolean {
  return (
    sub.provider !== 'apple' &&
    Boolean(sub.stripeSubscriptionId) &&
    sub.tier !== 'free' &&
    LIVE_STRIPE_STATUSES.has(sub.status)
  );
}

/** A live App Store plan on the profile: in charge, or remembered under Stripe. */
interface LiveApple {
  tier: SubscriptionTier;
  /** Undefined when Apple gave no expiry. */
  expiresAt?: Date;
  inCharge: boolean;
}

function unexpired(expiresAt: Date | undefined, now: Date): boolean {
  return expiresAt === undefined || expiresAt.getTime() > now.getTime();
}

function liveApple(sub: SubscriptionData, now: Date): LiveApple | undefined {
  if (sub.provider === 'apple') {
    // A grace period keeps access past the expiry.
    const expiresAt = later(sub.currentPeriodEnd, sub.gracePeriodEnd);
    if (sub.tier === 'free' || !unexpired(expiresAt, now)) return undefined;
    return { tier: sub.tier, expiresAt, inCharge: true };
  }
  const tier = sub.appleTierUnderStripe;
  if (tier == null || tier === 'free') return undefined;
  const expiresAt = later(sub.appleExpiresUnderStripe, undefined);
  return unexpired(expiresAt, now) ? { tier, expiresAt, inCharge: false } : undefined;
}

/** A Stripe subscription as a webhook reports it. */
export interface StripePlan {
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  customerId: string;
  subscriptionId: string;
  createdAt: Date;
  periodEnd: Date;
  trialEnd?: Date;
}

/** Stripe in charge: what the Stripe sync has always written. */
function stripeInCharge(current: SubscriptionData, plan: StripePlan, now: Date): SubscriptionData {
  return {
    ...current,
    tier: plan.tier,
    status: plan.status,
    provider: 'stripe',
    stripeCustomerId: plan.customerId,
    stripeSubscriptionId: plan.subscriptionId,
    subscribedAt: current.subscribedAt ?? plan.createdAt,
    currentPeriodEnd: plan.periodEnd,
    inTrial: plan.status === 'trialing',
    trialEndDate: plan.trialEnd,
    lastSyncedAt: now,
  };
}

/** The App Store plan in charge; a live Stripe plan below it is remembered, an ended one cleared. */
function appleInCharge(
  current: SubscriptionData,
  apple: LiveApple,
  stripe: StripePlan | undefined,
  now: Date
): SubscriptionData {
  const base: SubscriptionData = {
    ...current,
    tier: apple.tier,
    provider: 'apple',
    stripeCustomerId: stripe?.customerId ?? current.stripeCustomerId,
    stripeSubscriptionId: stripe?.subscriptionId,
    stripeTierUnderApple: stripe?.tier,
    appleTierUnderStripe: undefined,
    appleExpiresUnderStripe: undefined,
    lastSyncedAt: now,
  };
  if (apple.inCharge) return base; // Apple's own status, expiry and grace stand.
  return {
    ...base,
    status: 'active',
    currentPeriodEnd: apple.expiresAt,
    gracePeriodEnd: undefined,
    inTrial: false,
    trialEndDate: undefined,
  };
}

/**
 * What a Stripe cancellation has always left: the free tier, keeping usage and
 * the customer. The ended plan's id is cleared explicitly: the profile store
 * merges, so a field that is only left out would survive in Firestore.
 */
function freeAfterStripe(current: SubscriptionData, now: Date): SubscriptionData {
  return {
    tier: 'free',
    status: 'active',
    billingFrequency: 'monthly',
    inTrial: false,
    monthlyUsage: current.monthlyUsage,
    lastSyncedAt: now,
    stripeCustomerId: current.stripeCustomerId,
    stripeSubscriptionId: undefined,
    stripeTierUnderApple: undefined,
  };
}

/**
 * The subscription after a Stripe webhook: `plan` for a subscription Stripe
 * reports (created, updated, past due, canceled...), 'ended' when Stripe
 * deleted it. With no live App Store plan this is exactly what Stripe sync and
 * the free downgrade always wrote.
 */
export function nextSubscriptionFromStripe(
  current: SubscriptionData,
  plan: StripePlan | 'ended',
  now: Date
): SubscriptionData {
  const apple = liveApple(current, now);
  const live = plan !== 'ended' && plan.tier !== 'free' && LIVE_STRIPE_STATUSES.has(plan.status);
  if (!apple)
    return plan === 'ended' ? freeAfterStripe(current, now) : stripeInCharge(current, plan, now);
  if (!live) return appleInCharge(current, apple, undefined, now);
  if (!stripeKeepsCharge(plan.tier, apple.tier)) return appleInCharge(current, apple, plan, now);
  return {
    ...stripeInCharge(current, plan, now),
    gracePeriodEnd: undefined,
    stripeTierUnderApple: undefined,
    appleTierUnderStripe: apple.tier,
    appleExpiresUnderStripe: apple.expiresAt,
  };
}
