/**
 * A person's Plaid Items in the shared sealed per-user store (PLAID_UNIFIED_STORE).
 *
 * Why: the agent tools kept Plaid tokens in `.plaid-tokens.json` in the
 * container's working directory (tools/domains/finance/plaid-store.ts). The UI
 * server and the LiveKit agent run in different containers, so a bank linked on
 * the web was never visible to the agent, and every deploy lost the file.
 *
 * Here the record is the one at bogle_users/{uid}/plaid_tokens/data, the doc the
 * web /plaid/exchange already writes, held by the shared store
 * (user-oauth-store.ts), so the access token is sealed (utils/token-encryption)
 * and every process reads the same record. It holds a list, so a person can
 * link more than one bank; linking the same Item again replaces it.
 *
 * No token key: nothing is written and the save answers `sealing_unavailable`.
 * encryptData alone would write plain JSON outside production.
 *
 * Erasure: the doc sits under bogle_users/{uid}, so account deletion removes it
 * with the record. Disconnect drops the whole record. Revoking at Plaid
 * (/item/remove) is lane P3: it goes in removePlaidItems, before the record is
 * dropped, while the access tokens are still at hand.
 *
 * @module services/identity/plaid-item-store
 */

import { flagOn } from '../../config/env-flag.js';
import { resolveTokenKey } from '../../utils/token-encryption.js';
import { createLogger } from '../../utils/safe-logger.js';
import { createUserOAuthStore } from './user-oauth-store.js';

const log = createLogger({ module: 'PlaidItemStore' });

export interface PlaidItem {
  access_token: string;
  item_id: string;
  institution: { institution_id?: string; name?: string };
  linked_at: string;
  /** needs_reauth: Plaid answered ITEM_LOGIN_REQUIRED; only the person can fix it (lane P2 records it). */
  status: 'connected' | 'needs_reauth';
}

export type PlaidSaveResult =
  { ok: true } | { ok: false; code: 'sealing_unavailable' | 'store_failed' };

/** The sealed record. A single link written by the flag-off /plaid/exchange has the item's fields at top level. */
interface PlaidRecord extends Partial<Omit<PlaidItem, 'status'>> {
  items?: PlaidItem[];
  refresh_token?: never;
}

const store = createUserOAuthStore<PlaidRecord>({ provider: 'plaid', collection: 'plaid_tokens' });

/**
 * Reads are kept for a minute, then go back to Firestore past every cache, so a
 * link, disconnect or account deletion in another process shows up here.
 */
const READ_TTL_MS = 60_000;
const recent = new Map<string, { at: number; items: PlaidItem[] }>();

const idTag = (userId: string): string => userId.substring(0, 8);

export function plaidUnifiedStore(): boolean {
  return flagOn('PLAID_UNIFIED_STORE');
}

function itemsOf(record: PlaidRecord | null): PlaidItem[] {
  if (!record) return [];
  if (Array.isArray(record.items)) return record.items;
  if (!record.access_token) return [];
  return [
    {
      access_token: record.access_token,
      item_id: record.item_id ?? '',
      institution: record.institution ?? {},
      linked_at: record.linked_at ?? '',
      status: 'connected',
    },
  ];
}

const errorCode = (err: unknown): string => String((err as { code?: unknown }).code ?? 'none');

/** The user's Items (empty when none is linked, or when the record can't be read). */
export async function getPlaidItems(userId: string): Promise<PlaidItem[]> {
  const hit = recent.get(userId);
  if (hit && Date.now() - hit.at <= READ_TTL_MS) return hit.items;
  try {
    const items = itemsOf(await store.readFresh(userId));
    recent.set(userId, { at: Date.now(), items });
    return items;
  } catch (err) {
    log.warn({ userId: idTag(userId), code: errorCode(err) }, 'Plaid items could not be read');
    return [];
  }
}

/**
 * Add (or replace, by item_id) one Item. Refuses without a token key, and when
 * the record can't be read (saving then would drop the other Items).
 */
export async function savePlaidItem(
  userId: string,
  link: Pick<PlaidItem, 'access_token' | 'item_id'> & { institution?: PlaidItem['institution'] }
): Promise<PlaidSaveResult> {
  if (resolveTokenKey().source === 'none') {
    log.error({ userId: idTag(userId) }, 'Plaid item not saved: token sealing unavailable');
    return { ok: false, code: 'sealing_unavailable' };
  }
  try {
    const kept = itemsOf(await store.readFresh(userId)).filter((i) => i.item_id !== link.item_id);
    const item: PlaidItem = {
      access_token: link.access_token,
      item_id: link.item_id,
      institution: link.institution ?? {},
      linked_at: new Date().toISOString(),
      status: 'connected',
    };
    const items = [...kept, item];
    await store.save(userId, { items });
    recent.set(userId, { at: Date.now(), items });
    log.info({ userId: idTag(userId), items: items.length }, 'Plaid item saved');
    return { ok: true };
  } catch (err) {
    log.error({ userId: idTag(userId), code: errorCode(err) }, 'Plaid item not saved');
    return { ok: false, code: 'store_failed' };
  }
}

/** Disconnect: drop every Item. False when none was linked; throws when the record outlives the delete. */
export async function removePlaidItems(userId: string): Promise<boolean> {
  const items = itemsOf(await store.readFresh(userId));
  if (items.length === 0) return false;
  // Lane P3: revoke each item at Plaid (/item/remove with items[i].access_token) here.
  recent.delete(userId);
  await store.remove(userId); // a failed delete is logged, not thrown: so read it back
  if (itemsOf(await store.readFresh(userId)).length > 0)
    throw new Error('Plaid record not deleted');
  log.info({ userId: idTag(userId), items: items.length }, 'Plaid items removed');
  return true;
}
