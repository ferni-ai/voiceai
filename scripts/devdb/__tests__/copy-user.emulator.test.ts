/**
 * copy-user.ts against the Firestore emulator, two databases side by side: a dry
 * run writes nothing, only the given uid's documents reach ferni-dev, with their
 * subcollections and Timestamps, and excluded stores stay behind.
 * Skips unless FIRESTORE_EMULATOR_HOST is set:
 *
 *   firebase emulators:exec --only firestore:ferni-dev --project demo-devdb \
 *     "pnpm vitest run -c vitest.config.unit.ts scripts/devdb/__tests__/copy-user.emulator.test.ts"
 */
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';

import { copyUser } from '../copy-user.js';

const ME = 'Ab3dEf6hIj9kLm2nOp5qRs8tUv1w';
const OTHER = 'Zy9xWv8uTs7rQp6oNm5lKj4iHg3f';
const AT = Timestamp.fromDate(new Date('2026-10-01T12:00:00Z'));

describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)('copy-user on the emulator', () => {
  let source: Firestore;
  let dest: Firestore;

  /** Every document path in a database. */
  const paths = async (db: Firestore): Promise<string[]> => {
    const out: string[] = [];
    const walk = async (cols: FirebaseFirestore.CollectionReference[]): Promise<void> => {
      for (const col of cols) {
        for (const ref of await col.listDocuments()) {
          if ((await ref.get()).exists) out.push(ref.path);
          await walk(await ref.listCollections());
        }
      }
    };
    await walk(await db.listCollections());
    return out.sort();
  };

  beforeEach(async () => {
    // A project per test: nothing carries over between runs or tests
    const projectId = `demo-devdb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    source = new Firestore({ projectId, databaseId: '(default)' });
    dest = new Firestore({ projectId, databaseId: 'ferni-dev' });
    const seed: Array<[string, Record<string, unknown>]> = [
      [`bogle_users/${ME}`, { name: 'me', createdAt: AT }],
      [`bogle_users/${ME}/memories/m1`, { text: 'mine', at: AT }],
      [`bogle_users/${ME}/memories/m1/notes/n1`, { deep: true }],
      [`bogle_users/${ME}/contacts/c1`, { phone: '+15550000001' }],
      [`bogle_users/${ME}/deferred_calls/d1`, { to: '+15550000002' }],
      [`bogle_users/${ME}/reminders/r1`, { dueAt: AT }],
      [`bogle_users/${ME}/outreach_attempts/o1`, { at: AT }],
      [`bogle_users/${ME}/ferni_commitments/f1`, { dueBy: 'tomorrow' }],
      [`outreach_profiles/${ME}`, { cadence: 'weekly' }],
      [`users/${ME}/journal/j1`, { entry: 'mine' }],
      [`entity_store/${ME}/entities/e1`, { name: 'mine' }],
      ['entities/mine1', { userId: ME, at: AT }],
      ['entities/theirs1', { userId: OTHER }],
      ['phone_mappings/+15550000003', { userId: ME }],
      [`bogle_users/${OTHER}`, { name: 'other' }],
      [`bogle_users/${OTHER}/memories/m1`, { text: 'theirs' }],
      [`users/${OTHER}/journal/j1`, { entry: 'theirs' }],
    ];
    for (const [path, data] of seed) await source.doc(path).set(data);
  });

  it('a dry run counts but writes nothing', async () => {
    const counts = await copyUser({ source, dest, uids: [ME], apply: false });
    expect(counts['bogle_users/{uid}']).toEqual({ found: 4, copied: 4, skipped: 0 });
    expect(await paths(dest)).toEqual([]);
  });

  it('copies only this uid, with subcollections and Timestamps, and not the exclusions', async () => {
    await copyUser({ source, dest, uids: [ME], apply: true });
    expect(await paths(dest)).toEqual(
      [
        `bogle_users/${ME}`,
        `bogle_users/${ME}/ferni_commitments/f1`,
        `bogle_users/${ME}/memories/m1`,
        `bogle_users/${ME}/memories/m1/notes/n1`,
        `entity_store/${ME}/entities/e1`,
        'entities/mine1',
        `users/${ME}/journal/j1`,
      ].sort()
    );
    const copied = (await dest.doc(`bogle_users/${ME}/memories/m1`).get()).get('at');
    expect(copied).toBeInstanceOf(Timestamp);
    expect((copied as Timestamp).isEqual(AT)).toBe(true);
    // the source is untouched
    expect(await paths(source)).toHaveLength(17);
  });

  it('skips what dev already has unless --overwrite', async () => {
    await dest.doc(`bogle_users/${ME}/memories/m1`).set({ text: 'dev edit' });
    const first = await copyUser({ source, dest, uids: [ME], apply: true });
    expect(first['bogle_users/{uid}']?.skipped).toBe(1);
    expect((await dest.doc(`bogle_users/${ME}/memories/m1`).get()).get('text')).toBe('dev edit');
    await copyUser({ source, dest, uids: [ME], apply: true, overwrite: true });
    expect((await dest.doc(`bogle_users/${ME}/memories/m1`).get()).get('text')).toBe('mine');
  });
});
