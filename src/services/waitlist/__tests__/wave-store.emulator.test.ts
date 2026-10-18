/**
 * The real Firestore wave store against the emulator (skipped without
 * FIRESTORE_EMULATOR_HOST; CI runs it in data-layer-e2e): overlapping runs
 * admit exactly N, the per-person transaction stops at N, members with an
 * active profile become joined (on admit and on lapse), and an erased doc is
 * never recreated.
 */
import { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { queueFields } from '../queue.js';
import { runWave } from '../wave.js';
import { firestoreWaveStore } from '../wave-store.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const NOW = new Date('2026-10-19T17:00:00Z');
const OK = { state: 'ok' as const, costUsd: 1, costDay: null, errorRate: 0, reasons: [] };

describe.skipIf(!emulator)('wave store (emulator)', () => {
  const db = new Firestore({ projectId: 'demo-waitlist-waves' });
  const store = firestoreWaveStore(db);
  const wipe = async (name: string) => {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  };
  const seed = async (names: string[]) => {
    for (const [i, name] of names.entries()) {
      const e = { status: 'pending', lane: 'standard' as const, joinedAtMs: i * 1000, verified: true, verifiedReferrals: 0 }; // prettier-ignore
      await db.collection('waitlist').doc(name).set({ email: `${name}@example.com`, status: 'pending', verifiedAt: NOW, ...queueFields(e) }); // prettier-ignore
    }
  };
  const status = async (name: string) => (await db.collection('waitlist').doc(name).get()).data()?.status; // prettier-ignore
  const run = (id: string, now = NOW) => runWave({ store, guard: async () => OK, now, dryRun: false }, id); // prettier-ignore

  beforeEach(async () => {
    await Promise.all(
      ['waitlist', 'waitlist_waves', 'user_profiles', 'waitlist_settings'].map(wipe)
    );
    await db.collection('waitlist_settings').doc('current').set({ waveSize: 3 });
  });

  it('two concurrent runs of one wave admit exactly N', async () => {
    await seed(['a', 'b', 'c', 'd', 'e', 'f']);
    const reports = await Promise.all([run('2026-10-19'), run('2026-10-19')]);
    const admitted = (await db.collection('waitlist').where('status', '==', 'admitted').get()).size;
    expect(admitted).toBe(3);
    // The other run admits nobody: 'busy' while the lease is held, or 'already-ran' if it came after
    const outcomes = reports.map((r) => r.skipped ?? 'ran');
    expect(outcomes.filter((o) => o === 'ran')).toHaveLength(1);
    expect(outcomes.filter((o) => o !== 'ran').every((o) => o === 'busy' || o === 'already-ran')).toBe(true); // prettier-ignore
    expect(reports.filter((r) => r.skipped).every((r) => r.admitted === 0)).toBe(true);
    expect((await db.collection('waitlist_waves').doc('2026-10-19').get()).data()?.admitted).toBe(
      3
    );
  });

  it('even with the lease bypassed, the per-person transaction stops at N', async () => {
    await seed(['a', 'b', 'c', 'd', 'e', 'f']);
    const wave = await store.claimWave('w', NOW, new Date(NOW.getTime() + 60_000));
    const people = await store.nextInLine(6);
    const results = await Promise.all(people.map((p) => store.admitOne(p, wave, 3, NOW)));
    expect(results.filter((r) => r === 'admitted')).toHaveLength(3);
    expect((await db.collection('waitlist').where('status', '==', 'admitted').get()).size).toBe(3);
  });

  it('a member with an active profile is marked joined, on admit and on lapse', async () => {
    await seed(['a', 'b']);
    await db.collection('user_profiles').doc('a').set({ subscription: { status: 'active', tier: 'free' } }); // prettier-ignore
    await run('2026-10-19');
    expect([await status('a'), await status('b')]).toEqual(['joined', 'admitted']);
    await db.collection('user_profiles').doc('b').set({ subscription: { status: 'active', tier: 'free' } }); // prettier-ignore
    const later = new Date(NOW.getTime() + 8 * 86_400_000);
    expect(await run('2026-10-27', later)).toMatchObject({ lapsed: 0, members: 1 });
    expect(await status('b')).toBe('joined');
  });

  it('an entry erased before its admission is not recreated', async () => {
    await seed(['a']);
    const wave = await store.claimWave('w', NOW, new Date(NOW.getTime() + 60_000));
    const [a] = await store.nextInLine(1);
    await db.collection('waitlist').doc('a').delete();
    expect(await store.admitOne(a!, wave, 3, NOW)).toBe('skipped');
    expect((await db.collection('waitlist').doc('a').get()).exists).toBe(false);
  });
});
