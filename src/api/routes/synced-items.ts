/**
 * The caller's own copies of things the web used to keep only in localStorage, so they
 * follow the person to a new device:
 *
 * - GET    /api/synced/:kind      → { items: object[], deleted: { id, deletedAt }[] }
 * - PUT    /api/synced/:kind/:id  { item, updatedAt } → { ok: true, updatedAt }
 * - DELETE /api/synced/:kind/:id  → { ok: true } (a tombstone, so other devices drop it too)
 *
 * Kinds: `rituals` (custom practices, rituals.service) and `marketplace-installs`
 * (installed marketplace agents, marketplace.service). Only the verified caller, only
 * their own records: bogle_users/{uid}/<collection>/{id}, which account deletion
 * (erase-user-record) removes with the rest of the record. The item is stored as JSON
 * text, so any shape the web keeps is stored as-is, within a size cap.
 *
 * @module api/routes/synced-items
 */

import { getAdminFirestore } from '../../utils/firebase-admin-app.js';
import type { IncomingMessage, ServerResponse } from 'http';
import { ensureFirebaseAdmin } from '../../services/identity/firebase-auth.js';
import { USER_RECORDS_COLLECTION } from '../../services/platform/erase-user-record.js';
import { createLogger } from '../../utils/safe-logger.js';
import { rateLimit } from '../auth-middleware.js';
import { getUserId, parseBody, sendError, sendJSON } from '../helpers.js';

const log = createLogger({ module: 'SyncedItems' });

export const SYNCED_KINDS: Readonly<Record<string, string>> = {
  rituals: 'saved_rituals',
  'marketplace-installs': 'marketplace_installs',
};
const ID = /^[A-Za-z0-9_.-]{1,120}$/;
/** Room for a marketplace manifest; far under Firestore's 1 MiB document limit */
export const MAX_ITEM_CHARS = 200_000;
const MAX_ITEMS = 500;

interface StoredItem {
  data?: string;
  updatedAt: string;
  deletedAt?: string;
}

const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

function collectionFor(uid: string, kind: string) {
  return getAdminFirestore()
    .collection(USER_RECORDS_COLLECTION)
    .doc(uid)
    .collection(SYNCED_KINDS[kind] as string);
}

async function list(res: ServerResponse, uid: string, kind: string): Promise<void> {
  const snap = await collectionFor(uid, kind).limit(MAX_ITEMS).get();
  const items: unknown[] = [];
  const deleted: Array<{ id: string; deletedAt: string }> = [];
  for (const doc of snap.docs) {
    const stored = doc.data() as StoredItem;
    if (stored.deletedAt) deleted.push({ id: doc.id, deletedAt: stored.deletedAt });
    else if (stored.data) {
      try {
        items.push(JSON.parse(stored.data));
      } catch {
        log.warn({ uid, kind, id: doc.id }, 'Unreadable synced item skipped');
      }
    }
  }
  sendJSON(res, { items, deleted });
}

async function put(req: IncomingMessage, res: ServerResponse, uid: string, kind: string, id: string) {
  const { item, updatedAt } = ((await parseBody(req).catch(() => null)) ?? {}) as {
    item?: unknown;
    updatedAt?: unknown;
  };
  if (!item || typeof item !== 'object' || Array.isArray(item) || (item as { id?: unknown }).id !== id) {
    sendError(res, 'item must be an object whose id matches the path', 400);
    return;
  }
  const data = JSON.stringify(item);
  if (data.length > MAX_ITEM_CHARS) {
    sendError(res, 'item is too large', 413);
    return;
  }
  const at = isIso(updatedAt) ? updatedAt : new Date().toISOString();
  await collectionFor(uid, kind).doc(id).set({ data, updatedAt: at } satisfies StoredItem);
  sendJSON(res, { ok: true, updatedAt: at });
}

async function remove(res: ServerResponse, uid: string, kind: string, id: string) {
  const now = new Date().toISOString();
  await collectionFor(uid, kind).doc(id).set({ updatedAt: now, deletedAt: now } satisfies StoredItem);
  sendJSON(res, { ok: true });
}

export async function handleSyncedItemsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  const match = pathname.match(/^\/api\/synced\/([^/]+)(?:\/([^/]+))?$/);
  if (!match) return false;
  const [, kind = '', rawId] = match;
  if (!(kind in SYNCED_KINDS)) return false;

  if (rateLimit(req, res, { maxRequests: 120, windowMs: 60_000, keyPrefix: 'synced' })) return true;
  const uid = getUserId(req, parsedUrl);
  if (!uid) {
    sendError(res, 'Unauthorized', 401);
    return true;
  }
  const id = rawId; // the id pattern has no characters that need decoding
  if (id !== undefined && !ID.test(id)) {
    sendError(res, 'Invalid id', 400);
    return true;
  }
  if (!ensureFirebaseAdmin()) {
    sendError(res, 'Database unavailable', 503);
    return true;
  }

  try {
    if (id === undefined && req.method === 'GET') await list(res, uid, kind);
    else if (id !== undefined && req.method === 'PUT') await put(req, res, uid, kind, id);
    else if (id !== undefined && req.method === 'DELETE') await remove(res, uid, kind, id);
    else sendError(res, 'Method not allowed', 405);
  } catch (error) {
    log.error({ error: String(error), uid, kind }, 'Synced items request failed');
    sendError(res, 'Could not reach your saved items', 500);
  }
  return true;
}
