/**
 * Joining and place in line, against the in-memory store that
 * counts the same derived fields the Firestore index serves.
 */
import { describe, expect, it } from 'vitest';
import { findEntry, joinWaitlist, positionOf, waitlistDocId } from '../join.js';
import { memoryStore } from './memory-store.js';

const DAY = 86_400_000;
const T0 = new Date('2026-09-01T12:00:00Z');
const day = (n: number) => new Date(T0.getTime() + n * DAY);
const NOW = new Date('2026-10-18T12:00:00Z');

async function join(
  store: ReturnType<typeof memoryStore>['store'],
  email: string,
  n: number,
  extra: { verified?: boolean; ref?: string } = {}
) {
  // prettier-ignore
  const out = await joinWaitlist(store, { email, verified: extra.verified ?? true, ref: extra.ref, source: 'test', now: day(n) }); // prettier-ignore
  if ('refused' in out) throw new Error(out.refused);
  return out.entry;
}

/** The inviter gets `count` friends who join with their code and verify. */
async function befriend(
  s: ReturnType<typeof memoryStore>,
  inviterEmail: string,
  count: number,
  from = 0
) {
  // prettier-ignore
  const code = (await s.store.get(waitlistDocId(inviterEmail)))!.inviteCode!;
  for (let i = from; i < from + count; i++) await join(s.store, `friend${i}.${inviterEmail}`, 30, { ref: code }); // prettier-ignore
}

const place = async (s: ReturnType<typeof memoryStore>, email: string) =>
  positionOf(s.store, (await findEntry(s.store, email))!);

describe('place in line', () => {
  it('orders by lane, then join time less 3 days per verified friend, capped at 5', async () => {
    const s = memoryStore();
    await join(s.store, 'early@example.com', 0);
    await join(s.store, 'e@example.com', 2);
    await join(s.store, 'b@example.com', 10);
    await join(s.store, 'c@example.com', 20);
    expect(await place(s, 'c@example.com')).toBe(4);

    await befriend(s, 'c@example.com', 4); // day 20 − 12 = day 8: ahead of b (10)
    expect(await place(s, 'c@example.com')).toBe(3);
    await befriend(s, 'c@example.com', 3, 4); // 7 friends count as 5: day 5, still behind e (day 2)
    expect((await s.store.get(waitlistDocId('c@example.com')))!.verifiedReferrals).toBe(7);
    expect(await place(s, 'c@example.com')).toBe(3);

    const vip = await join(s.store, 'vip@example.com', 40); // a late VIP goes to the front
    await s.store.merge(vip.id, { lane: 'vip', laneRank: 0 });
    expect(await place(s, 'vip@example.com')).toBe(1);
    expect(await place(s, 'early@example.com')).toBe(2);
  });

  it('credits a friend only once they verify, once, and never the inviter under an alias', async () => {
    const s = memoryStore();
    const inviter = await join(s.store, 'jdoe@gmail.com', 0);
    const ref = inviter.inviteCode!;
    const credits = async () => (await s.store.get(inviter.id))!.verifiedReferrals;

    await join(s.store, 'pal@example.com', 1, { verified: false, ref });
    expect(await credits()).toBe(0); // joined from the website, not verified yet
    await join(s.store, 'pal@example.com', 2); // signs in with Google
    expect(await credits()).toBe(1);
    await join(s.store, 'pal@example.com', 3);
    expect(await credits()).toBe(1);

    await join(s.store, 'j.doe+again@gmail.com', 4, { ref }); // the inviter's own inbox
    expect(await credits()).toBe(1);
  });
});

describe('one place per inbox', () => {
  it('an alias finds the existing entry instead of making a second', async () => {
    const s = memoryStore();
    const first = await join(s.store, 'j.doe+waitlist@gmail.com', 0);
    const again = await join(s.store, 'jdoe@gmail.com', 5);
    expect(again.id).toBe(first.id);
    expect(again.joinedAtMs).toBe(day(0).getTime()); // keeps the original place
    expect(s.docs.size).toBe(1);
  });

  it('refuses a throwaway inbox and writes nothing', async () => {
    const s = memoryStore();
    const out = await joinWaitlist(s.store, { email: 'x@mailinator.com', verified: true, source: 't', now: NOW }); // prettier-ignore
    expect(out).toEqual({ refused: 'disposable_email' });
    expect(s.docs.size).toBe(0);
  });
});

describe('who is in the line', () => {
  it('only verified people waiting have a place', async () => {
    const s = memoryStore();
    await join(s.store, 'in@example.com', 0);
    const unproven = await join(s.store, 'unproven@example.com', 1, { verified: false });
    expect(await positionOf(s.store, unproven)).toBeNull();
    const seat = await join(s.store, 'seat@example.com', 2);
    await s.store.merge(seat.id, { status: 'admitted', inQueue: false });
    expect(await positionOf(s.store, (await s.store.get(seat.id))!)).toBeNull();
    expect(await place(s, 'in@example.com')).toBe(1);
  });
});
