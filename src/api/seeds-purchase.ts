/**
 * POST /api/seeds/purchase { itemId }: buy a cosmetic with seeds.
 *
 * The charge (a ledger entry keyed `purchase:<itemId>`) and the ownership
 * (`ownedCosmetics` on the account) are written in one transaction at the server's
 * price, so a retried or doubled request charges once and an item is never owned
 * without being paid for, or paid for without being owned.
 *
 * @module api/seeds-purchase
 */
import admin from 'firebase-admin';
import { cosmeticForSale, isDefaultCosmetic } from '../services/seeds/cosmetics-catalog.js';
import { commitSeeds, InsufficientSeedsError, prepareSeeds } from '../services/seeds/ledger.js';

export type PurchaseResult =
  | { status: 200; body: { owned: true; charged: boolean; itemId: string; balance?: number } }
  | { status: 400; error: string };

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
