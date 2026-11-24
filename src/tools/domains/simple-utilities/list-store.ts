/**
 * Where general lists are kept: Firestore when it is there, an in-memory copy when it is not.
 *
 * When Firestore is there but a save fails, the change goes to the in-memory copy and the save
 * reports success, so the tool says the list was made or changed. The next read is Firestore's,
 * so the change is missing (LIST_WRITES_TRUTHFUL, #4264). Off: as before. On: the save rejects
 * with the in-memory copy untouched, and `listSaved` tells the tool the change was not made.
 *
 * @module simple-utilities/list-store
 */

import { flagOn } from '../../../config/env-flag.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ListItem {
  id: string;
  text: string;
  checked: boolean;
  addedAt: number;
  checkedAt?: number;
  notes?: string;
}

export interface UserList {
  id: string;
  userId: string;
  name: string;
  type: string; // 'packing', 'bucket', 'guest', 'reading', 'custom'
  items: ListItem[];
  createdAt: number;
  updatedAt: number;
  archived: boolean;
}

// In-memory fallback
const listStore = new Map<string, UserList[]>();

/** A list change that did not reach Firestore (LIST_WRITES_TRUTHFUL on). */
class ListNotSavedError extends Error {
  constructor() {
    super('LIST_WRITES_TRUTHFUL: the list change was not saved');
    this.name = 'ListNotSavedError';
  }
}

/** With the flag on, a failed Firestore save rejects instead of falling back to memory. */
function failedWrite(userId: string, error: unknown): void {
  if (!flagOn('LIST_WRITES_TRUTHFUL')) {
    log.warn({ error: String(error), userId }, 'Firestore save failed, using in-memory');
    return;
  }
  log.warn({ userId, reason: 'list_write_failed' }, 'LIST_WRITES_TRUTHFUL');
  throw new ListNotSavedError();
}

/** Awaits a list save: false when it was not saved, true when it was. Other errors throw. */
export async function listSaved(write: Promise<unknown>): Promise<boolean> {
  try {
    await write;
    return true;
  } catch (error) {
    if (error instanceof ListNotSavedError) return false;
    throw error;
  }
}

// ============================================================================
// STORAGE HELPERS
// ============================================================================

export async function loadLists(userId: string): Promise<UserList[]> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .where('archived', '==', false)
        .get();

      return snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot): UserList => ({
        id: doc.id,
        ...(doc.data() as Omit<UserList, 'id'>),
      }));
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for lists');
  }

  // Fallback to in-memory
  return (listStore.get(userId) || []).filter((l) => !l.archived);
}

async function loadList(userId: string, listId: string): Promise<UserList | null> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const doc = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('lists')
        .doc(listId)
        .get();
      if (doc.exists) {
        const list: UserList = { id: doc.id, ...(doc.data() as Omit<UserList, 'id'>) };
        return list;
      }
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore load failed');
  }

  // Fallback
  const lists = listStore.get(userId) || [];
  return lists.find((l) => l.id === listId) || null;
}

export async function saveList(userId: string, list: UserList): Promise<UserList> {
  list.updatedAt = Date.now();

  try {
    const db = getFirestoreDb();
    if (db) {
      const ref = db.collection('bogle_users').doc(userId).collection('lists').doc(list.id);
      await ref.set(cleanForFirestore(list));
      log.info({ listId: list.id, userId }, 'List saved to Firestore');
      return list;
    }
  } catch (error) {
    failedWrite(userId, error);
  }

  // Fallback
  const lists = listStore.get(userId) || [];
  const index = lists.findIndex((l) => l.id === list.id);
  if (index >= 0) {
    lists[index] = list;
  } else {
    lists.push(list);
  }
  listStore.set(userId, lists);

  return list;
}

export async function findListByName(userId: string, name: string): Promise<UserList | null> {
  const lists = await loadLists(userId);
  const nameLower = name.toLowerCase().trim();

  return (
    lists.find(
      (l) => l.name.toLowerCase() === nameLower || l.name.toLowerCase().includes(nameLower)
    ) || null
  );
}
