/**
 * eraseOrphanedKey erases only a key shaped like a Firebase uid (#2966).
 *
 * The orphan clean-up (scripts/data/erase-orphans.ts) deletes a deleted person's
 * leftovers by key. findOrphans already keeps only uid-shaped keys; this check is the
 * second line of defence, so a phone, device or session key (which never names a
 * Firebase account, and may belong to a live caller) is never erased by mistake.
 * Its verifier disabled the check and no test went red.
 */
import { describe, expect, it, vi } from 'vitest';
import { eraseOrphanedKey } from '../erase-store.js';

const STORE = { collection: 'engagement_profiles', doc: 'uid' as const };

/** A Firestore that records any use and stops there */
function touchedDb() {
  const collection = vi.fn(() => {
    throw new Error('the store was touched');
  });
  return { db: { collection } as unknown as FirebaseFirestore.Firestore, collection };
}

describe('eraseOrphanedKey', () => {
  it.each([
    ['a phone key', 'phone:+15550100123'],
    ['a device key', 'device:3f9c2a71-0b5e-4d8e-9a77-1c2d3e4f5a6b'],
    ['an anonymous session id', 'anon:Qk7Xm2Np9Rt4'],
    ['27 characters', 'Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9'],
    ['29 characters', 'Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9St'],
    ['a path', 'Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op/Qr9S'],
  ])('refuses %s without touching the store', async (_what, key) => {
    const { db, collection } = touchedDb();

    await expect(eraseOrphanedKey(db, STORE, key)).rejects.toThrow('not a Firebase uid');
    expect(collection).not.toHaveBeenCalled();
  });

  it('erases a 28-character uid', async () => {
    const { db, collection } = touchedDb();

    await expect(eraseOrphanedKey(db, STORE, 'Ab3Cd5Ef7Gh9Ij1Kl3Mn5Op7Qr9S')).rejects.toThrow(
      'the store was touched'
    );
    expect(collection).toHaveBeenCalledWith('engagement_profiles');
  });
});
