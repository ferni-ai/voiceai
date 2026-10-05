/**
 * App Store purchases → the buyer's profile.
 *
 * Someone who paid in the iOS app gets that tier everywhere (the web reads the
 * profile), and loses it when Apple says the subscription ended. Only data
 * Apple's library has verified gets here (see apple-signed-data.ts), and only
 * the purchase's bound owner (apple_transaction_owners) is ever written.
 *
 * Paying twice (App Store and Stripe) follows the rule in paying-twice.ts, the
 * same one Stripe webhooks follow:
 * - The higher tier wins. On a tie the live Stripe plan stays in charge, so an
 *   App Store event never downgrades or overrides a Stripe tier at least as high;
 *   the App Store purchase is still recorded (appleOriginalTransactionId) and
 *   remembered (appleTierUnderStripe), so it takes over if Stripe ends first.
 * - When a higher App Store tier covers a live Stripe plan, the Stripe tier is
 *   remembered (stripeTierUnderApple) and handed back when the App Store plan ends.
 * - An App Store "ended" event only changes the profile for that same purchase:
 *   the tier when the App Store is in charge, the remembered plan when Stripe is.
 *
 * Every write is idempotent: a retried request or notification that changes
 * nothing doesn't write.
 *
 * @module services/billing/apple-entitlement
 */
import type { JWSTransactionDecodedPayload } from '@apple/app-store-server-library';
import { getStore } from '../../memory/store-factory.js';
import {
  createDefaultSubscription,
  type SubscriptionData,
  type SubscriptionTier,
} from '../../types/subscription.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getTransactionOwner } from './apple-signed-data.js';
import { hasLiveStripePlan, later, ms, stripeKeepsCharge } from './paying-twice.js';

const log = createLogger({ module: 'AppleEntitlement' });

/**
 * The products the iOS app sells (apps/ios-native: ProductID in
 * SubscriptionService.swift and Ferni.storekit).
 */
export const APPLE_PRODUCT_IDS = {
  friend_monthly: 'com.ferni.subscription.friend.monthly',
  friend_annual: 'com.ferni.subscription.friend.yearly',
  partner_monthly: 'com.ferni.subscription.partner.monthly',
  partner_annual: 'com.ferni.subscription.partner.yearly',
} as const;

/**
 * Product ID → tier. Also maps the names in the older billing docs
 * (com.ferni.friend.monthly, ...) in case App Store Connect still has them.
 */
export const PRODUCT_TO_TIER: Record<string, SubscriptionTier> = {
  [APPLE_PRODUCT_IDS.friend_monthly]: 'friend',
  [APPLE_PRODUCT_IDS.friend_annual]: 'friend',
  [APPLE_PRODUCT_IDS.partner_monthly]: 'partner',
  [APPLE_PRODUCT_IDS.partner_annual]: 'partner',
  'com.ferni.friend.monthly': 'friend',
  'com.ferni.friend.annual': 'friend',
  'com.ferni.partner.monthly': 'partner',
  'com.ferni.partner.annual': 'partner',
};

/** What an App Store event does to the entitlement of one purchase. */
export type AppleEntitlementChange =
  | {
      kind: 'grant';
      originalTransactionId: string;
      productId: string;
      tier: SubscriptionTier;
      expiresAt?: Date;
      purchasedAt?: Date;
      /** When Apple signed the transaction (orders late-arriving notifications). */
      signedAt?: Date;
    }
  | { kind: 'grace'; originalTransactionId: string; until?: Date }
  | { kind: 'end'; originalTransactionId: string; reason: 'expired' | 'billing' | 'refund' };

/**
 * The change a verified transaction stands for: a grant while it's current,
 * an end once it expired or was revoked, null for a product we don't sell.
 */
export function changeFromTransaction(
  tx: JWSTransactionDecodedPayload,
  now: number = Date.now()
): AppleEntitlementChange | null {
  const { originalTransactionId, productId } = tx;
  const tier = productId !== undefined ? PRODUCT_TO_TIER[productId] : undefined;
  if (!originalTransactionId || productId === undefined || tier === undefined) {
    log.warn({ originalTransactionId, productId }, 'App Store product has no tier');
    return null;
  }
  if (tx.revocationDate !== undefined) {
    return { kind: 'end', originalTransactionId, reason: 'refund' };
  }
  if (tx.expiresDate !== undefined && tx.expiresDate <= now) {
    return { kind: 'end', originalTransactionId, reason: 'expired' };
  }
  return {
    kind: 'grant',
    originalTransactionId,
    productId,
    tier,
    expiresAt: tx.expiresDate !== undefined ? new Date(tx.expiresDate) : undefined,
    purchasedAt: tx.purchaseDate !== undefined ? new Date(tx.purchaseDate) : undefined,
    signedAt: tx.signedDate !== undefined ? new Date(tx.signedDate) : undefined,
  };
}

/** The App Store is in charge of this profile, through this purchase. */
function appleHolds(sub: SubscriptionData, originalTransactionId: string): boolean {
  return sub.provider === 'apple' && sub.appleOriginalTransactionId === originalTransactionId;
}

type Grant = Extract<AppleEntitlementChange, { kind: 'grant' }>;
type End = Extract<AppleEntitlementChange, { kind: 'end' }>;

/**
 * A grant Apple signed before this purchase was refunded is stale (retries arrive
 * out of order); a resubscription is signed after the refund, so it still applies.
 */
function signedBeforeRefund(current: SubscriptionData, change: Grant): boolean {
  if (current.appleOriginalTransactionId !== change.originalTransactionId) return false;
  const revokedAt = ms(current.revokedAt);
  const signedAt = change.signedAt?.getTime();
  return revokedAt !== undefined && signedAt !== undefined && signedAt <= revokedAt;
}

function granted(current: SubscriptionData, change: Grant, now: Date): SubscriptionData {
  const otx = change.originalTransactionId;
  if (signedBeforeRefund(current, change)) return current;
  const stripeLive = hasLiveStripePlan(current);
  const samePurchase = current.appleOriginalTransactionId === otx;
  if (stripeLive && stripeKeepsCharge(current.tier, change.tier)) {
    // Stripe already gives at least this much: record and remember the purchase.
    const held = samePurchase ? current.appleExpiresUnderStripe : undefined;
    return {
      ...current,
      appleOriginalTransactionId: otx,
      appleProductId: change.productId,
      appleTierUnderStripe: change.tier,
      appleExpiresUnderStripe: notBackwards(held, change.expiresAt),
    };
  }
  const held = appleHolds(current, otx) ? current.currentPeriodEnd : undefined;
  return {
    ...current,
    tier: change.tier,
    status: 'active',
    provider: 'apple',
    appleOriginalTransactionId: otx,
    appleProductId: change.productId,
    subscribedAt: current.subscribedAt ?? change.purchasedAt ?? now,
    currentPeriodEnd: notBackwards(held, change.expiresAt),
    gracePeriodEnd: undefined,
    revokedAt: undefined,
    stripeTierUnderApple: stripeLive ? current.tier : current.stripeTierUnderApple,
    appleTierUnderStripe: undefined,
    appleExpiresUnderStripe: undefined,
  };
}

/** Never move an expiry backwards for the same purchase (notifications can arrive late). */
function notBackwards(held: unknown, offered: Date | undefined): Date | undefined {
  return offered === undefined ? undefined : later(held, offered);
}

function ended(current: SubscriptionData, change: End, now: Date): SubscriptionData {
  const base = {
    ...current,
    gracePeriodEnd: undefined,
    stripeTierUnderApple: undefined,
    appleTierUnderStripe: undefined,
    appleExpiresUnderStripe: undefined,
    revokedAt: change.reason === 'refund' ? now : current.revokedAt,
  };
  const covered = current.stripeTierUnderApple;
  // Null-safe: Firestore keeps a cleared field as null.
  if (covered != null && covered !== 'free' && current.stripeSubscriptionId) {
    // Hand the profile back to the Stripe plan the App Store tier was covering.
    return { ...base, tier: covered, provider: 'stripe', status: 'active' };
  }
  return { ...base, tier: 'free', status: change.reason === 'billing' ? 'unpaid' : 'canceled' };
}

/** The subscription after an App Store change (pure; see the module doc for the rule). */
export function nextSubscription(
  current: SubscriptionData,
  change: AppleEntitlementChange,
  now: Date
): SubscriptionData {
  if (change.kind === 'grant') return granted(current, change, now);
  const otx = change.originalTransactionId;
  if (!appleHolds(current, otx)) {
    // Under a Stripe plan: grace extends the remembered purchase, an ending forgets it.
    if (current.appleOriginalTransactionId !== otx || current.appleTierUnderStripe == null) {
      return current;
    }
    if (change.kind === 'grace') {
      return {
        ...current,
        appleExpiresUnderStripe: later(current.appleExpiresUnderStripe, change.until),
      };
    }
    return {
      ...current,
      appleTierUnderStripe: undefined,
      appleExpiresUnderStripe: undefined,
      revokedAt: change.reason === 'refund' ? now : current.revokedAt,
    };
  }
  if (change.kind === 'grace') {
    return { ...current, status: 'past_due', gracePeriodEnd: change.until };
  }
  return ended(current, change, now);
}

const ENTITLEMENT_FIELDS = [
  'tier',
  'status',
  'provider',
  'appleOriginalTransactionId',
  'appleProductId',
  'subscribedAt',
  'currentPeriodEnd',
  'gracePeriodEnd',
  'revokedAt',
  'stripeTierUnderApple',
  'appleTierUnderStripe',
  'appleExpiresUnderStripe',
] as const;

function sameEntitlement(a: SubscriptionData, b: SubscriptionData): boolean {
  return ENTITLEMENT_FIELDS.every((field) => {
    const x: unknown = a[field];
    const y: unknown = b[field];
    return x === y || (x == null && y == null) || (ms(x) !== undefined && ms(x) === ms(y));
  });
}

/**
 * Apply a change to `userId`'s profile. `create` makes the profile if it's
 * missing (the verify route: a signed-in buyer). Throws when the store fails,
 * so callers can ask for a retry instead of claiming success.
 */
export async function applyAppleChange(
  userId: string,
  change: AppleEntitlementChange,
  { create = false }: { create?: boolean } = {}
): Promise<'updated' | 'unchanged' | 'no-profile'> {
  const store = await getStore();
  const profile = create ? await store.getOrCreateProfile(userId) : await store.getProfile(userId);
  if (!profile) {
    log.warn({ userId, change: change.kind }, 'No profile for an App Store purchase owner');
    return 'no-profile';
  }
  const now = new Date();
  const current = profile.subscription ?? createDefaultSubscription();
  const next = nextSubscription(current, change, now);
  if (sameEntitlement(current, next)) return 'unchanged';
  await store.saveProfile({
    ...profile,
    subscription: { ...next, lastSyncedAt: now },
    updatedAt: now,
  });
  log.info(
    {
      userId,
      originalTransactionId: change.originalTransactionId,
      change: change.kind,
      tier: next.tier,
      provider: next.provider,
    },
    'App Store entitlement applied'
  );
  return 'updated';
}

/**
 * Whose purchase this is. The ownership record decides; a deleted account's
 * (tombstoned) purchase belongs to nobody, so it's never re-granted. Profiles
 * from before the ownership record existed are found by their stored
 * appleOriginalTransactionId. 'unavailable' when ownership can't be read.
 */
export async function resolveAppleBuyer(
  originalTransactionId: string
): Promise<string | null | 'unavailable'> {
  const ownership = await getTransactionOwner(originalTransactionId);
  if (ownership === 'unavailable') return 'unavailable';
  if (ownership.owner) return ownership.owner;
  if (ownership.tombstoned) return null;
  const store = await getStore();
  const profiles = await store.listProfiles({ limit: 1000 });
  const legacy = profiles.find(
    (p) => p.subscription?.appleOriginalTransactionId === originalTransactionId
  );
  return legacy?.id ?? null;
}
