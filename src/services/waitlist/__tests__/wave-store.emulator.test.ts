/**
 * The real Firestore wave store against the emulator (skipped without
 * FIRESTORE_EMULATOR_HOST; CI runs it in data-layer-e2e): a wave doc is leased
 * and numbered once, the per-person transaction stops at N, members with an
 * active profile become joined (on admit and on lapse), a lapsed seat goes to
 * the back of the line, and an erased doc is never recreated.
 */
import { Firestore } from '@google-cloud/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { queueFields, readEntry } from '../queue.js';
import { firestoreWaveStore } from '../wave-store.js';

const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;
const NOW = new Date('2026-10-19T17:00:00Z');
const DAY = 86_400_000;
const LEASE = new Date(NOW.getTime() + 60_000);
const ACTIVE = { subscription: { status: 'active', tier: 'free' } };

describe.skipIf(!emulator)('wave store (emulator)', () => {
  const db = new Firestore({ projectId: 'demo-waitlist-waves' });
  const store = firestoreWaveStore(db);
  const person = (name: string) => db.collection('waitlist').doc(name);
  const wipe = async (name: string) => {
    const snap = await db.collection(name).get();
    await Promise.all(snap.docs.map((d) => d.ref.delete()));
  };
  const seed = async (names: string[]) => {
    for (const [i, name] of names.entries()) {
      const e = { status: 'pending', lane: 'standard' as const, joinedAtMs: i * 1000, verified: true, verifiedReferrals: 0 }; // prettier-ignore
      await person(name).set({ email: `${name}@example.com`, status: 'pending', verifiedAt: NOW, ...queueFields(e) }); // prettier-ignore
    }
  };
  const status = async (name: string) => (await person(name).get()).data()?.status;

  beforeEach(async () => {
    await Promise.all(
      ['waitlist', 'waitlist_waves', 'user_profiles', 'waitlist_settings'].map(wipe)
    );
  });

  it('numbers a wave once, leases it, and answers done after it finishes', async () => {
    const first = await store.claimWave('w1', NOW, LEASE);
    expect(first).toMatchObject({ number: 1, status: 'running', admitted: 0 });
    expect(await store.claimWave('w1', NOW, LEASE)).toMatchObject({ number: 1, status: 'busy' });
    const afterCrash = new Date(LEASE.getTime() + 1);
    expect(await store.claimWave('w1', afterCrash, LEASE)).toMatchObject({ number: 1, status: 'running' }); // prettier-ignore
    expect(await store.claimWave('w2', NOW, LEASE)).toMatchObject({ number: 2 });
    await store.finishWave('w1', {});
    expect(await store.claimWave('w1', afterCrash, LEASE)).toMatchObject({ status: 'done' });
  });

  it('the per-person transaction stops at N even when every person is admitted at once', async () => {
    await seed(['a', 'b', 'c', 'd', 'e', 'f']);
    const wave = await store.claimWave('w', NOW, LEASE);
    const people = await store.nextInLine(6);
    const results = await Promise.all(people.map((p) => store.admitOne(p, wave, 3, NOW)));
    expect(results.filter((r) => r === 'admitted')).toHaveLength(3);
    expect((await db.collection('waitlist').where('status', '==', 'admitted').get()).size).toBe(3);
    expect((await db.collection('waitlist_waves').doc('w').get()).data()?.admitted).toBe(3);
  });

  it('an admitted person gets a 7-day seat and the wave number, and leaves the queue', async () => {
    await seed(['a']);
    const wave = await store.claimWave('w', NOW, LEASE);
    expect(await store.admitOne((await store.nextInLine(1))[0]!, wave, 3, NOW)).toBe('admitted');
    expect(readEntry('a', (await person('a').get()).data() ?? {})).toMatchObject({
      status: 'admitted',
      foundingWave: 1,
      seatExpiresAt: new Date(NOW.getTime() + 7 * DAY),
    });
    expect(await store.nextInLine(5)).toHaveLength(0);
  });

  it('a member with an active profile is marked joined, on admit and on lapse', async () => {
    await seed(['a', 'b']);
    await db.collection('user_profiles').doc('a').set(ACTIVE);
    const wave = await store.claimWave('w', NOW, LEASE);
    const [a, b] = await store.nextInLine(2);
    expect(await store.admitOne(a!, wave, 3, NOW)).toBe('member');
    expect(await store.admitOne(b!, wave, 3, NOW)).toBe('admitted');
    expect([await status('a'), await status('b')]).toEqual(['joined', 'admitted']);
    await db.collection('user_profiles').doc('b').set(ACTIVE);
    const later = new Date(NOW.getTime() + 8 * DAY);
    const [lapsing] = await store.lapsedSeats(later);
    expect(await store.lapse(lapsing!, later)).toBe('member');
    expect(await status('b')).toBe('joined');
  });

  it('a lapsed seat goes to the back of the line and loses its founding wave', async () => {
    await seed(['a', 'b']);
    const wave = await store.claimWave('w', NOW, LEASE);
    await store.admitOne((await store.nextInLine(1))[0]!, wave, 3, NOW);
    expect(await store.lapsedSeats(NOW)).toHaveLength(0); // not expired yet
    const later = new Date(NOW.getTime() + 8 * DAY);
    const [seat] = await store.lapsedSeats(later);
    expect(await store.lapse(seat!, later)).toBe('lapsed');
    const back = readEntry('a', (await person('a').get()).data() ?? {});
    expect(back).toMatchObject({ status: 'lapsed', foundingWave: undefined });
    expect((await store.nextInLine(2)).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('an entry erased before its admission is not recreated', async () => {
    await seed(['a']);
    const wave = await store.claimWave('w', NOW, LEASE);
    const [a] = await store.nextInLine(1);
    await person('a').delete();
    expect(await store.admitOne(a!, wave, 3, NOW)).toBe('skipped');
    expect((await person('a').get()).exists).toBe(false);
  });
});
