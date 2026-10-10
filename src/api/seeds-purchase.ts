/**
 * POST /api/seeds/purchase { itemId }: buy a cosmetic with seeds.
 *
 * The charge (a ledger entry keyed `purchase:<itemId>`) and the ownership
 * (`ownedCosmetics` on the account) are written in one transaction at the server's
 * price, so a retried or doubled request charges once and an item is never owned
 * without being paid for, or paid for without being owned.
 *
 * Each item has a lowest plan that may buy it, checked against the stored subscription
 * (never a client header) before anything is charged. If the plan can't be read, the
 * purchase fails closed. Owning wins: an item already owned (say, before a downgrade)
 * answers "owned, not charged" without looking at the plan.
 *
 * @module api/seeds-purchase
 */
import admin from 'firebase-admin';
import { getSubscriptionInfo } from '../services/billing/stripe-subscription.js';
import {
  cosmeticForSale,
  isDefaultCosmetic,
  tierAllows,
} from '../services/seeds/cosmetics-catalog.js';
import {
  commitSeeds,
  InsufficientSeedsError,
  prepareSeeds,
  SEEDS_COLLECTION,
  STARTER_SEEDS,
} from '../services/seeds/ledger.js';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'SeedsPurchase' });

export type PurchaseResult =
  | { status: 200; body: { owned: true; charged: boolean; itemId: string; balance?: number } }
  | { status: 400 | 403 | 503; error: string };

export async function purchaseCosmetic(
  db: admin.firestore.Firestore,
  uid: string,
  itemId: unknown
): Promise<PurchaseResult> {
  // Default items belong to everyone: nothing to buy, nothing to charge
  if (isDefaultCosmetic(itemId)) {
    return { status: 200, body: { owned: true, charged: false, itemId: itemId as string } };
  }
  const item = cosmeticForSale(itemId);
  if (!item) return { status: 400, error: 'Unknown item' };

  // Already owned: nothing to charge and no plan to check (the transaction re-checks this)
  const account = (await db.collection(SEEDS_COLLECTION).doc(uid).get()).data();
  if (((account?.ownedCosmetics as string[] | undefined) ?? []).includes(item.id)) {
    return {
      status: 200,
      body: {
        owned: true,
        charged: false,
        itemId: item.id,
        balance: Number(account?.balance ?? STARTER_SEEDS),
      },
    };
  }

  let plan: unknown;
  try {
    plan = (await getSubscriptionInfo(uid)).tier;
  } catch (error) {
    log.warn({ error, uid, itemId: item.id }, 'Plan lookup failed; purchase refused');
    return { status: 503, error: 'Could not check your plan' };
  }
  if (!tierAllows(plan, item.requiredTier)) {
    return { status: 403, error: `Requires the ${item.requiredTier} plan` };
  }

  const key = `purchase:${item.id}`;
  try {
    return await db.runTransaction(async (tx) => {
      const state = await prepareSeeds(tx, db, uid, key);
      const owned = (state.account?.ownedCosmetics as string[] | undefined) ?? [];
      if (owned.includes(item.id)) {
        return {
          status: 200 as const,
          body: { owned: true as const, charged: false, itemId: item.id, balance: state.balance },
        };
      }
      // A key already applied (a retry whose ownership write we never saw) charges nothing
      const paid = commitSeeds(tx, state, {
        delta: -item.price,
        reason: 'purchase',
        key,
        meta: { itemId: item.id },
      });
      tx.set(
        state.accountRef,
        { ownedCosmetics: admin.firestore.FieldValue.arrayUnion(item.id) },
        { merge: true }
      );
      return {
        status: 200 as const,
        body: {
          owned: true as const,
          charged: paid.applied,
          itemId: item.id,
          balance: paid.balance,
        },
      };
    });
  } catch (error) {
    if (error instanceof InsufficientSeedsError)
      return { status: 400, error: 'Insufficient seeds' };
    throw error;
  }
}
