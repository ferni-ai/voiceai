/**
 * The one door to a caller's Plaid link for the tools, the context builders and
 * the v1 integration routes.
 *
 * PLAID_UNIFIED_STORE on: the sealed per-user store
 * (services/identity/plaid-item-store.ts), the record the web /plaid/exchange
 * writes, so the agent sees a bank linked on the web. Off (default): the
 * `.plaid-tokens.json` file (plaid-store.ts), exactly as before.
 *
 * When the flag is removed: delete plaid-store.ts and the flag-off branches here.
 *
 * @module tools/domains/finance/plaid-items
 */

import {
  getPlaidItems,
  plaidUnifiedStore,
  removePlaidItems,
  savePlaidItem,
  type PlaidItem,
  type PlaidSaveResult,
} from '../../../services/identity/plaid-item-store.js';
import * as fileStore from './plaid-store.js';

type PlaidTokenData = Pick<PlaidItem, 'access_token' | 'item_id' | 'linked_at'> & {
  institution?: PlaidItem['institution'];
};

export async function storeAccessToken(
  userId: string,
  accessToken: string,
  itemId?: string,
  institution?: { institution_id?: string; name?: string }
): Promise<PlaidSaveResult> {
  if (!plaidUnifiedStore()) {
    fileStore.storeAccessToken(userId, accessToken, itemId, institution);
    return { ok: true };
  }
  return savePlaidItem(userId, { access_token: accessToken, item_id: itemId ?? '', institution });
}

/** The user's first linked Item. */
export async function getTokenData(userId: string): Promise<PlaidTokenData | null> {
  if (!plaidUnifiedStore()) return fileStore.getTokenData(userId);
  return (await getPlaidItems(userId))[0] ?? null;
}

export async function getStoredAccessToken(userId: string): Promise<string | null> {
  if (!plaidUnifiedStore()) return fileStore.getStoredAccessToken(userId);
  return (await getTokenData(userId))?.access_token || null;
}

export async function hasLinkedAccounts(userId: string): Promise<boolean> {
  if (!plaidUnifiedStore()) return fileStore.hasLinkedAccounts(userId);
  return (await getPlaidItems(userId)).length > 0;
}

/** False when nothing was linked, or the record could not be read or deleted (the store logs which). */
export async function removeAccessToken(userId: string): Promise<boolean> {
  if (!plaidUnifiedStore()) return fileStore.removeAccessToken(userId);
  return removePlaidItems(userId).catch(() => false);
}
