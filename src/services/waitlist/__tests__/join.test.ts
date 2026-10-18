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

  it('credits a friend once, when their code comes with their own verified join', async () => {
    const s = memoryStore();
    const inviter = await join(s.store, 'jdoe@gmail.com', 0);
    const ref = inviter.inviteCode!;
    const credits = async () => (await s.store.get(inviter.id))!.verifiedReferrals;

    await join(s.store, 'pal@example.com', 1, { verified: false, ref });
    expect(await credits()).toBe(0); // joined from the website, not verified yet
    await join(s.store, 'pal@example.com', 2, { ref }); // signs in with Google, the link's code along
    expect(await credits()).toBe(1);
    await join(s.store, 'pal@example.com', 3, { ref });
    expect(await credits()).toBe(1);

    await join(s.store, 'j.doe+again@gmail.com', 4, { ref }); // the inviter's own inbox
    expect(await credits()).toBe(1);
  });

  it('a code typed in without a sign-in is never credited when the real owner verifies', async () => {
    const s = memoryStore();
    const attacker = await join(s.store, 'farmer@example.com', 0);
    await join(s.store, 'victim@example.com', 1, { verified: false, ref: attacker.inviteCode });
    await join(s.store, 'victim@example.com', 2); // the owner signs in, with no code of their own
    expect((await s.store.get(attacker.id))!.verifiedReferrals).toBe(0);
    expect((await s.store.get(waitlistDocId('victim@example.com')))!.referredBy).toBeUndefined();
  });
});

describe('one place per inbox, bound to the verified address', () => {
  it('an honest dotted Gmail user keeps their place: one entry in line, keyed by the signed-in address', async () => {
    const s = memoryStore();
    const site = await join(s.store, 'j.doe+waitlist@gmail.com', 0, { verified: false });
    expect((await join(s.store, 'J.Doe+Waitlist@gmail.com', 1, { verified: false })).id).toBe(site.id); // prettier-ignore
    const signedIn = await join(s.store, 'jdoe@gmail.com', 5);
    expect(signedIn.id).toBe(waitlistDocId('jdoe@gmail.com'));
    expect(signedIn).toMatchObject({ email: 'jdoe@gmail.com', verified: true, joinedAtMs: day(0).getTime() }); // prettier-ignore
    expect(s.docs.get(site.id)).toMatchObject({ status: 'merged', inQueue: false });
    expect([...s.docs.values()].filter((d) => d.inQueue === true)).toHaveLength(1);
    expect((await join(s.store, 'jdoe@gmail.com', 6)).id).toBe(signedIn.id); // idempotent
  });

  it('a pre-registered alias is never verified or merged into: its phone, code and lane are dropped', async () => {
    const s = memoryStore();
    const farmer = await join(s.store, 'farmer@example.com', 0);
    const alias = waitlistDocId('s.e.t.h+x@gmail.com');
    await join(s.store, 's.e.t.h+x@gmail.com', 1, { verified: false, ref: farmer.inviteCode });
    await s.store.merge(alias, { phone: '+15550001111', referredBy: farmer.inviteCode, lane: 'vip', laneRank: 0 }); // prettier-ignore

    const owner = await join(s.store, 'seth@gmail.com', 9);
    expect(owner.id).toBe(waitlistDocId('seth@gmail.com'));
    expect(s.docs.get(owner.id)).toMatchObject({ email: 'seth@gmail.com', lane: 'standard', laneRank: 2 }); // prettier-ignore
    expect(s.docs.get(owner.id)!.phone).toBeUndefined();
    expect(owner.referredBy).toBeUndefined();
    expect(s.docs.get(alias)!.verifiedAt).toBeUndefined(); // never verified under someone else's address
    expect(s.docs.get(alias)).toMatchObject({ email: 's.e.t.h+x@gmail.com', status: 'merged' });
    expect((await s.store.get(farmer.id))!.verifiedReferrals).toBe(0);
  });

  it('verifiedAt only ever lands on the doc whose email is the verified one', async () => {
    const s = memoryStore();
    await join(s.store, 'first.last@example.com', 0, { verified: false });
    await join(s.store, 'first.last+news@example.com', 1); // another spelling, verified
    for (const [, d] of s.docs) if (d.verifiedAt) expect(d.email).toBe('first.last+news@example.com'); // prettier-ignore
    expect(s.docs.get(waitlistDocId('first.last@example.com'))!.verifiedAt).toBeUndefined();
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

describe('finding your own entry', () => {
  it('folds aliases only for Gmail; elsewhere only the exact address is yours', async () => {
    const s = memoryStore();
    await join(s.store, 'pat@example.com', 0);
    expect(await findEntry(s.store, 'pat+x@example.com')).toBeNull();
    const g = await join(s.store, 'jdoe@gmail.com', 1);
    expect((await findEntry(s.store, 'J.Doe+x@googlemail.com'))?.id).toBe(g.id);
  });

  it('is bound to the Firebase uid once a sign-in joined', async () => {
    const s = memoryStore();
    const out = await joinWaitlist(s.store, { email: 'old@example.com', uid: 'u1', verified: true, source: 't', now: NOW }); // prettier-ignore
    if ('refused' in out) throw new Error(out.refused);
    expect(s.docs.get(out.entry.id)).toMatchObject({ uid: 'u1' });
    expect((await findEntry(s.store, 'new@example.com', 'u1'))?.id).toBe(out.entry.id);
    const again = await joinWaitlist(s.store, { email: 'new@example.com', uid: 'u1', verified: true, source: 't', now: NOW }); // prettier-ignore
    expect('entry' in again && again.entry.id).toBe(out.entry.id);
    expect(s.docs.size).toBe(1);
  });
});

describe('review fixes', () => {
  it('several waiting Gmail aliases: the signed-in entry inherits the earliest place, and every alias is retired', async () => {
    const s = memoryStore(); // returns matches newest first
    // Website signups typed by anyone (unverified), seeded directly: the join route folds them into one
    for (const [email, n] of [
      ['j.doe+b@gmail.com', 5],
      ['jd.oe+a@gmail.com', 2],
      ['j.d.oe+c@gmail.com', 8],
    ] as const) {
      // prettier-ignore
      s.docs.set(waitlistDocId(email), { email, emailCanonical: 'jdoe@gmail.com', status: 'pending', joinedAt: day(n) }); // prettier-ignore
    }
    const signedIn = await join(s.store, 'jdoe@gmail.com', 20);
    expect(signedIn.joinedAtMs).toBe(day(2).getTime());
    const aliases = [...s.docs.entries()].filter(([id]) => id !== signedIn.id).map(([, d]) => d);
    expect(aliases.map((d) => d.status)).toEqual(['merged', 'merged', 'merged']);
    expect([...s.docs.values()].filter((d) => d.inQueue === true)).toHaveLength(1);
  });

  it('one uid, one entry: binding a uid retires another waiting doc that held it', async () => {
    const s = memoryStore();
    const first = await joinWaitlist(s.store, { email: 'a@example.com', uid: 'u9', verified: true, source: 't', now: day(0) }); // prettier-ignore
    if ('refused' in first) throw new Error();
    await join(s.store, 'b@example.com', 1, { verified: false }); // a website signup of the same person's other address
    await joinWaitlist(s.store, { email: 'b@example.com', uid: 'u9', verified: true, source: 't', now: day(2) }); // prettier-ignore
    expect(s.docs.get(first.entry.id)).toMatchObject({
      status: 'merged',
      inQueue: false,
      uid: null,
    });
    expect([...s.docs.values()].filter((d) => d.uid === 'u9')).toHaveLength(1);
  });

  it('a code that arrives after the first verification never earns credit', async () => {
    const s = memoryStore();
    const inviter = await join(s.store, 'inviter@example.com', 0);
    await join(s.store, 'late@example.com', 1); // verified, no code
    await s.store.merge(waitlistDocId('late@example.com'), { referralCode: inviter.inviteCode }); // e.g. a later ?referralCode=
    await join(s.store, 'late@example.com', 2, { ref: inviter.inviteCode });
    expect((await s.store.get(inviter.id))!.verifiedReferrals).toBe(0);
  });

  it('a relay inbox may join but earns its inviter no credit', async () => {
    const s = memoryStore();
    const inviter = await join(s.store, 'inviter@example.com', 0);
    const relay = await join(s.store, 'abc123@privaterelay.appleid.com', 1, {
      ref: inviter.inviteCode,
    });
    expect(relay.verified).toBe(true);
    expect((await s.store.get(inviter.id))!.verifiedReferrals).toBe(0);
    await join(s.store, 'real@example.com', 2, { ref: inviter.inviteCode });
    expect((await s.store.get(inviter.id))!.verifiedReferrals).toBe(1);
  });
});

describe('verifying a doc made while unverified (review)', () => {
  it('keeps only its place in line: a planted phone, referrer and lane do not survive', async () => {
    const s = memoryStore();
    const farmer = await join(s.store, 'farmer@example.com', 0);
    const id = waitlistDocId('owner@example.com');
    s.docs.set(id, { email: 'owner@example.com', status: 'pending', joinedAt: day(1), phone: '+15550001111', referralCode: farmer.inviteCode, referredBy: farmer.inviteCode, lane: 'vip' }); // prettier-ignore
    const owner = await join(s.store, 'owner@example.com', 30);
    expect(owner.joinedAtMs).toBe(day(1).getTime());
    expect(s.docs.get(id)).toMatchObject({ phone: null, referralCode: null, referredBy: null, lane: 'standard', laneRank: 2 }); // prettier-ignore
    expect((await s.store.get(farmer.id))!.verifiedReferrals).toBe(0);
  });

  it('a code that comes with the verified join itself still counts', async () => {
    const s = memoryStore();
    const friend = await join(s.store, 'friend@example.com', 0);
    s.docs.set(waitlistDocId('owner@example.com'), { email: 'owner@example.com', status: 'pending', joinedAt: day(1) }); // prettier-ignore
    await join(s.store, 'owner@example.com', 2, { ref: friend.inviteCode });
    expect((await s.store.get(friend.id))!.verifiedReferrals).toBe(1);
  });
});
