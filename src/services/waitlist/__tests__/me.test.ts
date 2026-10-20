/**
 * The /me view: the waiting-screen contract shape for each status.
 */
import { describe, expect, it } from 'vitest';
import { joinWaitlist } from '../join.js';
import { meFor, type WaitlistMe } from '../me.js';
import { memoryStore } from './memory-store.js';

const DAY = 86_400_000;
const T0 = new Date('2026-09-01T12:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * DAY);
const NOW = new Date('2026-10-18T12:00:00Z'); // a Sunday

async function join(
  store: ReturnType<typeof memoryStore>['store'],
  email: string,
  n: number,
  extra: { verified?: boolean } = {}
) {
  // prettier-ignore
  const out = await joinWaitlist(store, { email, verified: extra.verified ?? true, source: 'test', now: day(n) }); // prettier-ignore
  if ('refused' in out) throw new Error(out.refused);
  return out.entry;
}

describe('/me view', () => {
  const KEYS = ['admittedAt', 'foundingMember', 'foundingWave', 'nextWaveAt', 'position', 'referralUrl', 'referrals', 'seatExpiresAt', 'status', 'wavesAway']; // prettier-ignore

  it('waiting: place, waves away, the next wave and the invite link, in the contract shape', async () => {
    const s = memoryStore({ waveSize: 2 });
    for (const [i, e] of ['a', 'b', 'c'].entries()) await join(s.store, `${e}@example.com`, i);
    const me: WaitlistMe = await meFor(s.store, 'c@example.com', NOW);
    expect(Object.keys(me).sort()).toEqual(KEYS);
    expect(me).toMatchObject({
      status: 'waiting',
      position: 3,
      wavesAway: 2,
      nextWaveAt: '2026-10-19T17:00:00.000Z',
      referrals: { verified: 0, creditedDays: 0, max: 5 },
      admittedAt: null,
      seatExpiresAt: null,
      foundingMember: false,
      foundingWave: null,
    });
    expect(me.referralUrl).toMatch(/^https:\/\/ferni\.ai\/\?ref=[a-z0-9]{6}-[a-z]+$/);
  });

  it('admitted, expired, unverified and not joined', async () => {
    const s = memoryStore();
    const a = await join(s.store, 'in@example.com', 0);
    await s.store.merge(a.id, { status: 'admitted', inQueue: false, foundingWave: 4, admittedAt: day(40), seatExpiresAt: day(47) }); // prettier-ignore
    expect(await meFor(s.store, 'in@example.com', NOW)).toMatchObject({
      status: 'admitted',
      position: null,
      wavesAway: null,
      nextWaveAt: null,
      admittedAt: day(40).toISOString(),
      seatExpiresAt: day(47).toISOString(),
      foundingMember: true,
      foundingWave: 4,
    });

    const l = await join(s.store, 'late@example.com', 1);
    await s.store.merge(l.id, { status: 'lapsed' });
    expect(await meFor(s.store, 'late@example.com', NOW)).toMatchObject({ status: 'expired', position: 1 }); // prettier-ignore

    await join(s.store, 'unproven@example.com', 2, { verified: false });
    expect(await meFor(s.store, 'unproven@example.com', NOW)).toMatchObject({ status: 'waiting', position: null }); // prettier-ignore
    expect(await meFor(s.store, 'nobody@example.com', NOW)).toMatchObject({ status: 'not_joined', position: null, referralUrl: null }); // prettier-ignore
  });
});
