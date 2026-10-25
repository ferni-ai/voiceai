/**
 * Change or remove one Chronicle entry: PUT and DELETE /api/journal/chronicle/entry/:id.
 * Menu audit 2026-10-24: nothing a call or the panel kept could be corrected or
 * removed there. Only the one journal store (JOURNAL_ONE_STORE), only under the
 * verified caller's uid: someone else's id isn't in that collection (404), and
 * `?userId=` naming anyone else is a 403. Both answer 200 with JSON, not 204: the
 * web client retries a 2xx body it can't parse, and a retried DELETE would 404.
 *
 * @module api/journal-chronicle-entry
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { requireAuth } from './auth-middleware.js';
import { refuseOtherUsersJournal } from './journal-owner.js';
import { parseBody, sendJSON } from './helpers.js';
import { journalChanged } from './custom-agent/journal-view.js';
import { journalOneStoreOn } from '../services/journal/journal-ports.js';
import { journalCollectionPath, listJournalEntries } from '../services/stores/journal-store.js';
import {
  getCustomAgent,
  removeMemoryFromAgent,
} from '../services/custom-agent/custom-agent-persistence-service.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

const ENTRY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ENTRY_PATH = /^\/api\/journal\/chronicle\/entry\/([A-Za-z0-9_-]{1,128})$/;
/** The longest entry an edit keeps. */
export const MAX_ENTRY_CHARS = 10_000;

/** Ids of the caller's entries in the one store: the ones the Chronicle can change. */
export async function editableEntryIds(uid: string): Promise<Set<string>> {
  if (!journalOneStoreOn()) return new Set();
  const ids = (await listJournalEntries(uid)).map((entry) => entry.id);
  return new Set(ids.filter((id) => ENTRY_ID.test(id))); // ids the routes below can name
}

function entryRef(uid: string, id: string): FirebaseFirestore.DocumentReference {
  const db = getFirestoreDb();
  if (!db) throw new Error('Journal store unavailable: Firestore is not connected');
  return db.collection(journalCollectionPath(uid)).doc(id);
}

/** A migrated entry also sits in its twin's old array; left there, it would come back. */
async function dropLegacyCopy(uid: string, agentId: unknown, id: string): Promise<void> {
  if (typeof agentId !== 'string' || !agentId) return;
  const agent = await getCustomAgent(uid, agentId);
  if (agent?.memories?.journalEntries?.some((memory) => memory.id === id)) {
    await removeMemoryFromAgent(uid, agentId, 'journalEntries', id);
  }
}

async function editEntry(
  req: IncomingMessage,
  res: ServerResponse,
  uid: string,
  id: string
): Promise<void> {
  const body = await parseBody<{ content?: unknown }>(req);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > MAX_ENTRY_CHARS) {
    sendJSON(res, { error: 'Content is required' }, 400);
    return;
  }
  const ref = entryRef(uid, id);
  if (!(await ref.get()).exists) {
    sendJSON(res, { error: 'Entry not found' }, 404);
    return;
  }
  await ref.update({ content, updatedAt: new Date() });
  journalChanged(uid);
  sendJSON(res, { entry: { id, content } }, 200);
}

async function deleteEntry(res: ServerResponse, uid: string, id: string): Promise<void> {
  const ref = entryRef(uid, id);
  const snap = await ref.get();
  if (!snap.exists) {
    sendJSON(res, { error: 'Entry not found' }, 404);
    return;
  }
  await ref.delete();
  await dropLegacyCopy(uid, snap.data()?.agentId, id);
  journalChanged(uid);
  sendJSON(res, { deleted: true, id }, 200);
}

/** PUT or DELETE /api/journal/chronicle/entry/:id. Returns true when it answered. */
export async function handleChronicleEntryChange(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  const method = req.method?.toUpperCase();
  const id = ENTRY_PATH.exec(pathname)?.[1];
  if (!id || (method !== 'PUT' && method !== 'DELETE')) return false;

  const auth = await requireAuth(req, res);
  if (!auth) return true; // 401 already sent
  const { userId } = auth;
  if (refuseOtherUsersJournal(req, res, userId)) return true;
  if (!journalOneStoreOn()) {
    sendJSON(res, { error: 'Entry not found' }, 404);
    return true;
  }

  try {
    await (method === 'PUT' ? editEntry(req, res, userId, id) : deleteEntry(res, userId, id));
  } catch (error) {
    log.error({ error: String(error), userId, method }, 'Chronicle entry change failed');
    sendJSON(res, { error: 'Failed to change entry' }, 500);
  }
  return true;
}
