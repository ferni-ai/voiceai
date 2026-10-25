/**
 * Change or remove one Chronicle entry: PUT and DELETE /api/journal/chronicle/entry/:id.
 * Menu audit 2026-10-24: nothing a call or the panel kept could be corrected or
 * removed there. Only the one journal store (JOURNAL_ONE_STORE), only under the
 * verified caller's uid: someone else's id isn't in that collection (404), and
 * `?userId=` naming anyone else is a 403. Both answer 200 with JSON, not 204: the
 * web client retries a 2xx body it can't parse, and a retried DELETE would 404.
 *
 * An edit or delete has to hold everywhere Ferni reads the entry (#2782 review):
 * an edit clears the words drawn from the old text, in the store and in a
 * migrated entry's twin-array copy; a delete takes that copy and the recording
 * with it; and the call's journal history reads the store, not a cache.
 *
 * @module api/journal-chronicle-entry
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAuth } from './auth-middleware.js';
import { BodyTooLargeError } from './bounded-body.js';
import { refuseOtherUsersJournal } from './journal-owner.js';
import { parseBody, sendJSON } from './helpers.js';
import { journalChanged } from './custom-agent/journal-view.js';
import { journalOneStoreOn } from '../services/journal/journal-ports.js';
import { journalCollectionPath, listJournalEntries } from '../services/stores/journal-store.js';
import { deleteVoiceJournalAudio } from '../services/custom-agent/gcs-storage-service.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { getLogger } from '../utils/safe-logger.js';

const log = getLogger();

const ENTRY_ID = /^[A-Za-z0-9_-]{1,128}$/;
const ENTRY_PATH = /^\/api\/journal\/chronicle\/entry\/([A-Za-z0-9_-]{1,128})$/;
/** Firestore reserves ids like `__name__`; the SDK throws on them. */
const RESERVED_ID = /^__.*__$/;
/** The longest entry an edit keeps. */
export const MAX_ENTRY_CHARS = 10_000;

/**
 * Fields that hold the entry's words or words drawn from them: addJournal kept
 * its text in `entry` (getJournals reads it), and a voice entry's title,
 * keywords, themes, emotions and mood come from its first transcript (search
 * matches the title, getJournals shows the mood). An edit clears them, in the
 * store and in a migrated entry's twin-array copy, so the old words don't outlive it.
 */
const DERIVED_FIELDS = [
  'entry',
  'title',
  'transcript',
  'summary',
  'context',
  'keywords',
  'keyInsights',
  'themes',
  'emotions',
  'mood',
  'embedding',
] as const;

/** Ids of the caller's entries in the one store: the ones the Chronicle can change. */
export async function editableEntryIds(uid: string): Promise<Set<string>> {
  if (!journalOneStoreOn()) return new Set();
  const ids = (await listJournalEntries(uid)).map((entry) => entry.id);
  return new Set(ids.filter((id) => ENTRY_ID.test(id))); // ids the routes below can name
}

function firestore(): FirebaseFirestore.Firestore {
  const db = getFirestoreDb();
  if (!db) throw new Error('Journal store unavailable: Firestore is not connected');
  return db;
}

/** The PUT body, or undefined when it isn't JSON (a body over the cap still throws: 413). */
async function readBody(req: IncomingMessage): Promise<{ content?: unknown } | undefined> {
  try {
    return await parseBody<{ content?: unknown }>(req);
  } catch (error) {
    if (error instanceof BodyTooLargeError) throw error;
    return undefined;
  }
}

async function editEntry(
  req: IncomingMessage,
  res: ServerResponse,
  uid: string,
  id: string
): Promise<void> {
  const body = await readBody(req);
  const content = typeof body?.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > MAX_ENTRY_CHARS) {
    sendJSON(res, { error: 'Content is required' }, 400);
    return;
  }
  const now = new Date();
  const derived = new Set<string>(DERIVED_FIELDS);
  const edited = (item: object): object => ({
    ...Object.fromEntries(Object.entries(item).filter(([key]) => !derived.has(key))),
    content,
    updatedAt: now,
  });
  const cleared = Object.fromEntries(DERIVED_FIELDS.map((f) => [f, FieldValue.delete()]));
  const found = await changeBothCopies(uid, id, (tx, ref) => {
    tx.update(ref, { ...cleared, content, updatedAt: now });
    return (items) => items.map((item) => (isEntry(item, id) ? edited(item as object) : item));
  });
  if (found === null) {
    sendJSON(res, { error: 'Entry not found' }, 404);
    return;
  }
  journalChanged(uid);
  sendJSON(res, { entry: { id, content } }, 200);
}

const isEntry = (item: unknown, id: string): boolean =>
  (item as { id?: unknown } | null)?.id === id;

/**
 * Changes the store document and, for a migrated entry, its copy in the twin's
 * old array, in one transaction. One at a time, a failure between the two left
 * them disagreeing: a delete brought the entry back as an old row the Chronicle
 * can't change (and a migration rerun copied it back), an edit left the old
 * words in the array, which the data export returns and every read uses with
 * JOURNAL_ONE_STORE off. `change` writes the store document and returns what
 * the array becomes. Returns the entry's agent ('' for none), or null when
 * there was no such entry.
 */
async function changeBothCopies(
  uid: string,
  id: string,
  change: (
    tx: FirebaseFirestore.Transaction,
    ref: FirebaseFirestore.DocumentReference
  ) => (items: unknown[]) => unknown[]
): Promise<string | null> {
  const db = firestore();
  const ref = db.collection(journalCollectionPath(uid)).doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const agentId: unknown = snap.data()?.agentId;
    if (typeof agentId !== 'string' || !ENTRY_ID.test(agentId)) {
      change(tx, ref);
      return '';
    }
    const agentRef = db.doc(`bogle_users/${uid}/custom_agents/${agentId}`); // as getCustomAgent reads it
    const memories: unknown = (await tx.get(agentRef)).data()?.memories;
    const items = (memories as { journalEntries?: unknown } | undefined)?.journalEntries;
    const arrayAfter = change(tx, ref); // reads first: a transaction writes only after them
    if (Array.isArray(items) && items.some((item) => isEntry(item, id))) {
      const journalEntries = arrayAfter(items);
      tx.update(agentRef, { 'memories.journalEntries': journalEntries, updatedAt: new Date() });
    }
    return agentId;
  });
}

async function deleteEntry(res: ServerResponse, uid: string, id: string): Promise<void> {
  const agentId = await changeBothCopies(uid, id, (tx, ref) => {
    tx.delete(ref);
    return (items) => items.filter((item) => !isEntry(item, id));
  });
  if (agentId === null) {
    sendJSON(res, { error: 'Entry not found' }, 404);
    return;
  }
  journalChanged(uid);
  if (agentId) await deleteVoiceJournalAudio(uid, agentId, id); // best effort, logs a failure
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
  if (RESERVED_ID.test(id)) {
    sendJSON(res, { error: 'Invalid entry id' }, 400);
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
