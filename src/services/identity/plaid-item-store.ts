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
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { isPlaintextTokenRecord } from '../../utils/token-at-rest.js';
import { decryptData, resolveTokenKey } from '../../utils/token-encryption.js';
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

/** record_unreadable: a stored record that won't open (another key, corrupt) is never overwritten. */
export type PlaidSaveResult =
  { ok: true } | { ok: false; code: 'sealing_unavailable' | 'store_failed' | 'record_unreadable' };

/** The sealed record. A single link written by the flag-off /plaid/exchange has the item's fields at top level. */
interface PlaidRecord extends Partial<Omit<PlaidItem, 'status'>> {
  items?: PlaidItem[];
  refresh_token?: never;
}

const COLLECTION = 'plaid_tokens';
const store = createUserOAuthStore<PlaidRecord>({
  provider: 'plaid',
  collection: COLLECTION,
  dropLegacyPlaintext: true, // a doc from before sealing keeps no plaintext token beside the envelope
});

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

type RawRecord =
  { kind: 'empty' } | { kind: 'unreadable' } | { kind: 'record'; record: PlaidRecord };

/**
 * The doc as Firestore holds it, past the persistence cache: after a failed write that cache
 * still holds the unsaved record and answers "fresh" reads with it. Throws when the doc can't be
 * read. An envelope that won't open is 'unreadable', not empty. A legacy plaintext doc (before
 * sealing) is read as its one Item, so a save keeps it, sealed.
 */
async function readRaw(userId: string): Promise<RawRecord> {
  const db = getFirestoreDb();
  if (!db) throw new Error(`No Firestore (${COLLECTION})`);
  const ref = db.collection('bogle_users').doc(userId).collection(COLLECTION).doc('data');
  const snap = await ref.get();
  const raw = snap.exists ? (snap.data() as Record<string, unknown> | undefined) : undefined;
  if (!raw) return { kind: 'empty' };
  const sealed = raw.encrypted;
  if (sealed !== undefined && sealed !== null && sealed !== '') {
    const record = typeof sealed === 'string' ? decryptData<PlaidRecord>(sealed) : null;
    return record !== null && typeof record === 'object'
      ? { kind: 'record', record }
      : { kind: 'unreadable' };
  }
  return isPlaintextTokenRecord(raw)
    ? { kind: 'record', record: raw as PlaidRecord }
    : { kind: 'empty' };
}

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
 * Add (or replace, by item_id) one Item. Refuses without a token key, when the record can't be
 * read, or when it is there but won't open (saving then would drop the other Items). ok only once
 * a fresh read of the doc shows the new Item: the store logs a failed write and retries it later.
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
    const current = await readRaw(userId);
    if (current.kind === 'unreadable') {
      log.error({ userId: idTag(userId) }, 'Plaid item not saved: stored record does not open');
      return { ok: false, code: 'record_unreadable' };
    }
    const stored = current.kind === 'record' ? itemsOf(current.record) : [];
    const kept = stored.filter((i) => i.item_id !== link.item_id);
    const item: PlaidItem = {
      access_token: link.access_token,
      item_id: link.item_id,
      institution: link.institution ?? {},
      linked_at: new Date().toISOString(),
      status: 'connected',
    };
    const items = [...kept, item];
    await store.save(userId, { items });
    const back = await readRaw(userId);
    const landed =
      back.kind === 'record' &&
      itemsOf(back.record).some(
        (i) =>
          i.item_id === item.item_id &&
          i.access_token === item.access_token &&
          i.linked_at === item.linked_at
      );
    if (!landed) {
      recent.delete(userId);
      log.error({ userId: idTag(userId) }, 'Plaid item not saved: write did not land');
      return { ok: false, code: 'store_failed' };
    }
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
