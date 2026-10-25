/**
 * Find a saved contact by phone number, in user_contacts, with one indexed query.
 *
 * Inbound-SMS and call-status matching used to read bogle_users/{uid}/contacts
 * (3 docs in prod) for only the first 100 users, so it almost never matched;
 * contacts are saved in user_contacts (contacts-management.ts). Each saved
 * contact now carries `phoneKeys`, its numbers as E.164, so a lookup is a
 * single array-contains query (Firestore indexes that field automatically).
 * Contacts saved before this have none until
 * scripts/migrations/backfill-contact-phone-keys.ts runs.
 *
 * @module services/identity/contacts/contact-phone-keys
 */
import { createLogger } from '../../../utils/safe-logger.js';

const log = createLogger({ module: 'contact-phone-keys' });

export const CONTACTS_COLLECTION = 'user_contacts';
/** A number shorter than this is not a phone number anyone saved. */
const MIN_DIGITS = 7;
/** A number several users saved is ambiguous; this many matches is enough to know. */
const MATCH_LIMIT = 10;

/** A phone number as E.164 (US numbers get +1), the form saved contacts store. */
export function phoneKey(phone: string): string {
  const n = phone.replace(/[^\d+]/g, '');
  if (n.length === 10) return `+1${n}`;
  if (n.length === 11 && n.startsWith('1')) return `+${n}`;
  return n.startsWith('+') ? n : `+${n}`;
}

const usable = (key: string): boolean => key.replace(/\D/g, '').length >= MIN_DIGITS;

/** A contact's numbers as lookup keys: E.164, each once. */
export function phoneKeysOf(phones: ReadonlyArray<{ number?: unknown }> | undefined): string[] {
  const keys = (phones ?? [])
    .map((p) => (typeof p.number === 'string' ? phoneKey(p.number) : ''))
    .filter(usable);
  return [...new Set(keys)];
}

/** The app's Firestore, loaded when first needed (null without credentials). */
async function appFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  const { getFirestoreDb } = await import('../../../utils/firestore-utils.js');
  return getFirestoreDb();
}

export interface ContactMatch {
  userId: string;
  contactId: string;
  contactName: string;
}

/**
 * The one user's saved contact with this number. Null when none matches, when
 * contacts of more than one user match (we can't tell whose it is, so we don't
 * guess), or when the store can't be read.
 */
export async function findContactByPhone(
  phone: string,
  store?: FirebaseFirestore.Firestore | null
): Promise<ContactMatch | null> {
  const key = phoneKey(phone);
  if (!usable(key)) return null;
  try {
    const db = store === undefined ? await appFirestore() : store;
    if (!db) return null;
    const snap = await db
      .collection(CONTACTS_COLLECTION)
      .where('phoneKeys', 'array-contains', key)
      .limit(MATCH_LIMIT)
      .get();
    const owners = new Set(snap.docs.map((d) => d.get('userId') as unknown));
    const doc = snap.docs[0];
    const userId = doc?.get('userId') as unknown;
    if (!doc || owners.size !== 1 || typeof userId !== 'string' || !userId) {
      if (owners.size > 1) log.info({ owners: owners.size }, 'Phone saved by several users');
      return null;
    }
    const name = doc.get('displayName') as unknown;
    return {
      userId,
      contactId: doc.id,
      contactName: typeof name === 'string' && name ? name : 'Unknown',
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to look up contact by phone');
    return null;
  }
}
