/**
 * The facts store on the Firestore emulator: real transactions (two writers racing
 * on one attribute end with one current fact), the readers' real queries, the
 * record leaving with the person (the "take your story" export) and going with the
 * account (eraseUserRecord).
 *
 *   firebase emulators:exec --only firestore --project demo-memory-facts \
 *     "pnpm vitest run src/memory/facts/__tests__/facts-store.emulator.test.ts"
 */
import type { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import type { Firestore } from '@google-cloud/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { eraseUserRecord } from '../../../services/platform/erase-user-record.js';
import {
  countUserRecords,
  exportUserRecords,
} from '../../../services/platform/user-records-export.js';
import { proposeFact, type FactProposal } from '../../writer/memory-writer.js';
import { forgetTopic } from '../../recall/forget.js';
import { getCurrentFacts, getFactsAsOf, listFactHistory } from '../facts-store.js';

// forgetTopic reads through getFirestoreDb, which the shared setup fakes: use the real client here
vi.mock('../../../utils/firestore-utils.js', async () => {
  const actual = await vi.importActual<typeof import('../../../utils/firestore-utils.js')>(
    '../../../utils/firestore-utils.js'
  );
  return { ...actual, getFirestoreDb: vi.fn(actual.getFirestoreDb) };
});
vi.mock('../../retrieval/conversation-index.js', () => ({ removeConversationDocument: vi.fn() }));
vi.mock('../../retrieval/semantic-memory-search.js', () => ({ removeIndexedMemory: vi.fn() }));
// The shared setup fakes Firestore for every test; here the reads and writes reach the emulator
vi.mock('firebase-admin/app', async () => vi.importActual('firebase-admin/app'));
vi.mock('firebase-admin/firestore', async () => vi.importActual('firebase-admin/firestore'));
vi.mock('../../../services/identity/firebase-auth.js', () => ({
  ensureFirebaseAdmin: () => true,
  deleteFirebaseUser: vi.fn(async () => true),
  getFirebaseUserOrThrow: vi.fn(async () => null),
}));

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
process.env.GCLOUD_PROJECT ??= 'demo-memory-facts';
const ON = { MEMORY_FACTS: 'on' };

let db: Firestore;
beforeAll(async () => {
  if (!emulator) return;
  const { getAdminFirestore } = await import('../../../utils/firebase-admin-app.js');
  db = getAdminFirestore() as AdminFirestore as unknown as Firestore;
});

const uidOf = (tag: string): string => `fact-${tag}-${Date.now().toString(36)}`;
/** A person with a live record: the writer writes nothing for an erased one. */
const liveUid = async (tag: string): Promise<string> => {
  const uid = await liveUid(tag);
  await db.collection('bogle_users').doc(uid).set({ displayName: 'Jo Rivera' });
  return uid;
};
const T0 = new Date('2026-10-01T12:00:00.000Z');
const T1 = new Date('2026-10-20T12:00:00.000Z');
const city = (value: string, key: string, extra: Partial<FactProposal> = {}): FactProposal => ({
  subjectId: 'self',
  attribute: 'city',
  value,
  source: 'manual',
  provenance: 'user_said',
  sourceKey: key,
  at: T0,
  ...extra,
});
const count = async (uid: string): Promise<number> =>
  (await db.collection('bogle_users').doc(uid).collection('facts').get()).size;

describe.skipIf(!emulator)('facts store (Firestore emulator)', () => {
  it('ADD, UPDATE, NOOP and a retry, read back by now, by history and as of a date', async () => {
    const uid = await liveUid('life');
    await proposeFact(db, uid, city('Tampa', 'k1'), ON);
    expect(await proposeFact(db, uid, city('Tampa', 'k1'), ON)).toMatchObject({ duplicate: true });
    expect(await proposeFact(db, uid, city('tampa', 'k2', { at: T1 }), ON)).toMatchObject({
      op: 'noop',
    });
    const next = await proposeFact(
      db,
      uid,
      city('Austin', 'k3', { at: T1, validFrom: T1.toISOString() }),
      ON
    );
    expect(next).toMatchObject({ ok: true, op: 'update' });

    expect(await count(uid)).toBe(2);
    expect((await getCurrentFacts(db, uid, 'self', 'city', ON)).map((f) => f.value)).toEqual([
      'Austin',
    ]);
    expect((await listFactHistory(db, uid, 'self', 'city', ON)).map((f) => f.value)).toEqual([
      'Tampa',
      'Austin',
    ]);
    const asOf = async (d: Date): Promise<string[]> =>
      (await getFactsAsOf(db, uid, 'self', 'city', d, ON)).map((f) => f.value);
    expect(await asOf(new Date(T1.getTime() - 1))).toEqual(['Tampa']);
    expect(await asOf(T1)).toEqual(['Austin']);
  }, 30_000);

  it('three writers racing on one attribute end with exactly one current fact', async () => {
    const uid = await liveUid('race');
    await proposeFact(db, uid, city('Tampa', 'k0'), ON);
    const results = await Promise.all(
      ['Austin', 'Denver', 'Boston'].map((v, i) =>
        proposeFact(db, uid, city(v, `k${i + 1}`, { at: new Date(T1.getTime() + i * 1000) }), ON)
      )
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await count(uid)).toBe(4);
    expect(await getCurrentFacts(db, uid, 'self', 'city', ON)).toHaveLength(1);
  }, 60_000);

  it('writes nothing while off, or for a non-member', async () => {
    const uid = await liveUid('off');
    expect(await proposeFact(db, uid, city('Tampa', 'k1'), {})).toMatchObject({
      reason: 'disabled',
    });
    expect(await proposeFact(db, `onbehalf:${uid}`, city('Tampa', 'k1'), ON)).toMatchObject({
      reason: 'not_member',
    });
    expect(await count(uid)).toBe(0);
    expect(await count(`onbehalf:${uid}`)).toBe(0);
  }, 30_000);

  it('"forget that" reaches the facts store: marked, or deleted with FORGET_DELETES', async () => {
    for (const deletes of [false, true]) {
      const uid = await liveUid(deletes ? 'del' : 'mark');
      const pet = { ...city('a beagle named Biscuit', 'k1'), attribute: 'pet' as const };
      await proposeFact(db, uid, pet, ON);
      await proposeFact(db, uid, city('Tampa', 'k2'), ON);
      const env = deletes ? { FORGET_DELETES: 'on' } : {};
      expect(await forgetTopic(uid, 'Biscuit', undefined, undefined, env)).toMatchObject({
        kind: 'forgotten',
        marked: 1,
      });
      const rows = (await db.collection('bogle_users').doc(uid).collection('facts').get()).docs;
      const byValue = Object.fromEntries(rows.map((d) => [d.get('value'), d.get('forgottenAt')]));
      expect(byValue['Tampa']).toBeNull();
      if (deletes) expect(Object.keys(byValue)).toEqual(['Tampa']);
      else expect(typeof byValue['a beagle named Biscuit']).toBe('string');
      expect(
        (await getCurrentFacts(db, uid, undefined, undefined, ON)).map((f) => f.value)
      ).toEqual(['Tampa']);
    }
  }, 60_000);

  it('the export carries every fact; erasure removes them all and only theirs', async () => {
    const uid = await liveUid('erase');
    const other = await liveUid('keep');
    for (const u of [uid, other]) {
      await proposeFact(db, u, city('Tampa', 'k1'), ON);
      await proposeFact(db, u, city('Austin', 'k2', { at: T1 }), ON);
      await proposeFact(db, u, { ...city('a beagle named Biscuit', 'k3'), attribute: 'pet' }, ON);
    }
    const out = await exportUserRecords(uid, undefined, db as never);
    const rows = out['bogle_users/{uid}/facts'] as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.value).sort()).toEqual(['Austin', 'Tampa', 'a beagle named Biscuit']);
    expect(await countUserRecords(uid, undefined, db as never)).toBe(3);

    await eraseUserRecord(uid, db as never);

    expect(await count(uid)).toBe(0);
    expect(await count(other)).toBe(3);
  }, 60_000);
});
