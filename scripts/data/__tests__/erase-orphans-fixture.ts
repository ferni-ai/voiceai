/**
 * A world of live users and deleted people's leftovers for the orphan clean-up's emulator
 * tests (erase-orphans.emulator.test.ts). Every id is invented.
 */
import type { Auth } from 'firebase-admin/auth';
import type { CollectionReference, Firestore } from 'firebase-admin/firestore';

/** 28 letters or digits, the shape of a Firebase uid */
export const uid = (seed: string): string => seed.repeat(28 / seed.length);

/** A deleted person with leftovers in a field store, a map store, a doc-id store and answer_cards */
export const GONE = uid('d1');
/** Thirteen deleted people whose engagement profile came back after their deletion */
export const ENGAGEMENT_GONE = Array.from({ length: 13 }, (_, i) =>
  uid(`e${String(i).padStart(3, '0')}`)
);
/** A deleted person whose record went but whose record's subcollections survive */
export const PHANTOM = uid('p1');
/** A live Firebase user with no bogle_users record */
export const LIVE = uid('l1');
/** A uid-shaped key with a bogle_users record and no Firebase user */
export const LIVE_RECORD = uid('r1');
export const PHONE = 'phone:+15555550100';
export const DEVICE = 'device:a1b2c3';

/** Orphaned keys and documents the dry run must report */
export const EXPECTED = { keys: 4 + 13 + 1, docs: 4 + 13 + 3 };

/** Seeds the world; returns the paths of every document the clean-up must delete */
export async function seedWorld(db: Firestore, auth: Auth): Promise<string[]> {
  await auth.createUser({ uid: LIVE });
  const orphanPaths: string[] = [];
  const add = async (collection: string, data: object, orphan: boolean): Promise<void> => {
    const ref = await db.collection(collection).add(data);
    if (orphan) orphanPaths.push(ref.path);
  };
  const set = async (path: string, data: object, orphan: boolean): Promise<void> => {
    await db.doc(path).set(data);
    if (orphan) orphanPaths.push(path);
  };

  // Live people: a Firebase user, a record-only uid, a phone profile, a device key
  await set(`bogle_users/${LIVE_RECORD}`, { name: 'record only' }, false);
  await set(`bogle_users/${PHONE}`, { linkedIdentifiers: [PHONE] }, false);
  for (const who of [LIVE, LIVE_RECORD, PHONE, DEVICE]) {
    await set(`user_seeds/${who}`, { balance: 5 }, false);
    await set(`engagement_profiles/${who}`, { userId: who }, false);
    await add('contact_relationships', { userId: who, name: 'friend' }, false);
    await add('answer_cards', { userId: who, card: 'live' }, false);
  }
  await set(`bogle_users/${LIVE_RECORD}/memories/m1`, { text: 'kept' }, false);

  // The deleted person: a doc-id store (with a subcollection), a field store, answer_cards
  await set(`user_seeds/${GONE}`, { balance: 3 }, true);
  await set(`user_seeds/${GONE}/history/h1`, { amount: 1 }, true);
  await add('contact_relationships', { userId: GONE, name: 'friend' }, true);
  await add('answer_cards', { userId: GONE, card: 'gone' }, true);
  // A map store: only the deleted person's entry goes, the document and the live entry stay
  await set('consent/contact1', { grants: { [GONE]: { ok: true }, [LIVE]: { ok: true } } }, false);

  for (const who of ENGAGEMENT_GONE) {
    await set(`engagement_profiles/${who}`, { userId: who, totalRitualDays: 0 }, true);
  }
  // bogle_users/{PHANTOM} itself doesn't exist: only documents under it do
  await set(`bogle_users/${PHANTOM}/memories/m1`, { text: 'a' }, true);
  await set(`bogle_users/${PHANTOM}/memories/m2`, { text: 'b' }, true);
  await set(`bogle_users/${PHANTOM}/team_insights/data`, { insights: [] }, true);

  await set('unrelated/doc', { keep: true }, false);
  return orphanPaths;
}

/** Seeds live Firebase users with engagement profiles, enough for a second Auth lookup batch */
export async function seedManyLiveUsers(db: Firestore, auth: Auth, count: number): Promise<void> {
  const uids = Array.from({ length: count }, (_, i) => uid(`m${String(i).padStart(3, '0')}`));
  const result = await auth.importUsers(uids.map((id) => ({ uid: id })));
  if (result.failureCount > 0) throw new Error('importUsers failed');
  const batch = db.batch();
  for (const id of uids) batch.set(db.doc(`engagement_profiles/${id}`), { userId: id });
  await batch.commit();
}

/** Every document in the database, by path, phantom parents' subcollections included */
export async function exportAll(db: Firestore): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const walk = async (collections: CollectionReference[]): Promise<void> => {
    for (const collection of collections) {
      for (const ref of await collection.listDocuments()) {
        const snap = await ref.get();
        if (snap.exists) out[ref.path] = snap.data();
        await walk(await ref.listCollections());
      }
    }
  };
  await walk(await db.listCollections());
  return out;
}
