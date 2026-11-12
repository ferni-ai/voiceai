/**
 * The call opener's reply close reaches the todo itself: when the owner answers
 * Ferni's ask with done or let go, the source item closes through its store's
 * writer too (FOLLOW_THROUGH_CLOSE_SOURCE), not only the follow-up. A "later"
 * changes no store, the flag off writes nothing, and a failed store write
 * leaves the follow-up's own close standing. Any done closes the follow-up, but
 * a store write needs confidentClose: one short plain clause naming the whole
 * todo, verb included, with no negation or deferral. The flag is read
 * for this caller (envForCaller), never from another caller's flags left in the
 * env. Fictional items only.
 *
 * On main the reply listener has no source writer, so the done and let-go rows
 * fail there with the source still open.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeFromReply,
  type FollowUp,
  type FollowUpStore,
} from '../../../services/follow-through/index.js';
import type { CohortStore } from '../../../services/platform/cohort-firestore.js';
import { applyCallerFlags, forgetAgentValues } from '../../../services/platform/cohort-flags.js';

const opener = await import('../follow-through-opener.js');

const OWNER = 'owner-1';
const OTHER = 'owner-2';
/** A cohort that turns the flag on for `member` only. */
const cohortFor = (member: string): CohortStore => ({
  cohortsFor: async (u) => (u === member ? [{ id: 'try-close', enabled: true, flags: { FOLLOW_THROUGH_CLOSE_SOURCE: 'on' } }] : []), // prettier-ignore
  overridesFor: async () => ({}),
});
const CALL = new Date('2026-10-17T23:00:00Z');

let ledger: FollowUp[];
let writes: Array<{ ref: string; how: string }>;
let failWrites: boolean;

const store: FollowUpStore = {
  open: async () => { throw new Error('unused'); }, // prettier-ignore
  live: async () => ledger.filter((f) => f.status === 'open' || f.status === 'surfaced'),
  due: async () => [],
  changedBetween: async () => ledger,
  async save(next, expected) {
    const i = ledger.findIndex((f) => f.id === next.id);
    if (i < 0 || ledger[i].updatedAt !== expected) return false;
    ledger[i] = next;
    return true;
  },
};

const closers = {
  async close(_u: string, s: { store: string; ref: string }, how: 'done' | 'release') {
    if (failWrites) throw new Error('UNAVAILABLE');
    writes.push({ ref: s.ref, how });
    return 'closed' as const;
  },
};

const ITEM = 'Send Priya the slides';
const followUp = (text: string): FollowUp => ({ id: 'f-c1', userId: OWNER, kind: 'commitment', text, dueAt: null, zone: 'America/Chicago', repeat: null, source: { store: 'commitments', ref: 'c1' }, status: 'open', surfaced: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' }); // prettier-ignore

beforeEach(() => {
  ledger = [{ id: 'f-c1', userId: OWNER, kind: 'commitment', text: ITEM, dueAt: null, zone: 'America/Chicago', repeat: null, source: { store: 'commitments', ref: 'c1' }, status: 'open', surfaced: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' }]; // prettier-ignore
  writes = [];
  failWrites = false;
  forgetAgentValues();
});

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};
/** Long enough for the follow-up save, the flag read and any store write to land. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await flush();
};

/** Ferni raises the follow-up and asks about it; the owner answers `said`. */
async function answer(
  said: string,
  env: Record<string, string | undefined> = { FOLLOW_THROUGH_CLOSE_SOURCE: 'on' },
  cohorts?: CohortStore
) {
  const item = ledger[0].text;
  const pick = opener.createFollowThroughOpener({ userId: OWNER, store, forgotten: async () => [], now: () => CALL }); // prettier-ignore
  await pick.ready;
  pick.raised([item]);
  await vi.waitFor(() => expect(ledger[0].status).toBe('surfaced'));
  await flush(); // the raise is noted after the save
  const listen = opener.followThroughReplyListeners({ userId: OWNER, isOwner: () => true, store, closers, env, cohorts, now: () => CALL }); // prettier-ignore
  listen.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: `Did you get to this one: ${item}?` } }); // prettier-ignore
  listen.onTranscript({ transcript: said, isFinal: true });
}

describe('the opener reply closes the todo where it lives', () => {
  it('done: the follow-up is kept and its commitment is closed as done', async () => {
    await answer('Yep, sent Priya the slides, done.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    await vi.waitFor(() => expect(writes).toEqual([{ ref: 'c1', how: 'done' }]));
  });

  it('let go: the follow-up is released and its commitment is closed as let go', async () => {
    await answer('Forget sending Priya the slides, let it go.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('released'));
    await vi.waitFor(() => expect(writes).toEqual([{ ref: 'c1', how: 'release' }]));
  });

  it('later: moved on, and no store is written', async () => {
    await answer('Not yet, maybe tomorrow on the slides.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('open'));
    await flush();
    expect(writes).toEqual([]);
  });

  it('flag off: the follow-up closes, no store is written', async () => {
    await answer('Yep, sent Priya the slides, done.', {});
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    await flush();
    expect(writes).toEqual([]);
  });

  it('a store write that fails leaves the follow-up closed and throws nothing', async () => {
    failWrites = true;
    await answer('Yep, sent Priya the slides, done.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    expect(writes).toEqual([]);
  });

  it('a bare "yep, done" closes the follow-up but writes no store', async () => {
    await answer('Yep, done.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    await flush();
    expect(writes).toEqual([]);
  });

  it("flag on for another caller, off for this one: no store write, though the env still holds the other caller's flag", async () => {
    const env: Record<string, string | undefined> = { COHORT_FLAGS: 'on' };
    await applyCallerFlags(OTHER, { store: cohortFor(OTHER), env }); // the other caller's call set it
    expect(env.FOLLOW_THROUGH_CLOSE_SOURCE).toBe('on');
    await answer('Yep, sent Priya the slides, done.', env, cohortFor(OTHER));
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    await flush();
    expect(writes).toEqual([]);
  });

  it('flag on for this caller through their cohort: the store is written', async () => {
    await answer('Yep, sent Priya the slides, done.', { COHORT_FLAGS: 'on' }, cohortFor(OWNER));
    await vi.waitFor(() => expect(writes).toEqual([{ ref: 'c1', how: 'done' }]));
  });

  // The store write needs confidentClose. Each row is the store-write count for
  // one answer, through the real listener: the verifier's r1 + r2 probes, fe's
  // rows (a) and (b), one row per verb form and irregular, and one row per rule.
  // "miss" rows could fairly have closed the todo; the gate says no when unsure,
  // so only the follow-up closes and the next brief drops the stale mention.
  const N = 0;
  const Y = 1;
  it.each([
    // verify-3791 r1 + r2 probes
    ['Book the dentist', 'I booked the flight, done.', N], // another item, one shared verb
    ['Fix the car', 'I was caring for my mom all week, but done.', N], // word inside a word
    ['Call Mom about the bill', 'Paid the gas bill, done.', N],
    ['Book the dentist', 'Yep, booked the dentist, done.', Y],
    ['Send Priya the slides', 'Yep, sent Priya the slides, done.', Y],
    ['Call Mom about the bill', 'Talked to Mom about the bill, done.', N], // miss: the verb is missing
    ['Book the dentist', 'Not done with the dentist yet.', N],
    ['Book the dentist', "I'm not done with the dentist.", N],
    ['Send Priya the slides', 'Sent Priya a birthday card, done.', N],
    ['Buy balloons for the party', 'The party? Done.', N],
    ['Book the dentist', 'Yep, done.', N],
    ['Call Mom about the bill', "Called the bill collector about Mom's car, done.", N], // out of order
    ['Return library books to the branch', 'Paid the library fine at the branch, done.', N], // fe (b)
    ['Renew the passport photo ID', 'Took a photo for my work ID, done.', N],
    ['Fix the car', 'Both cars are fixed, done.', N], // miss: out of order
    ['Pay the rent', 'Paying the rent now, done.', Y],
    ['Pay the rent', 'Rented a kayak, done.', N],
    ['Walk the dog', 'Walked the dogs, done.', Y],
    ['Water the ferns', 'Watered the fern, done.', Y],
    ['Water the ferns', 'Watering can is broken, but the waterfall hike is done.', N],
    ['Book the dentist', 'Booked it, done.', N],
    ['Email the landlord', 'Emailed my boss, done.', N],
    ['Call and email', 'Yep, called and emailed, done.', N], // miss: "email" counts as a noun here
    ['Do it', 'Did it, done.', N], // never reaches the gate: no word to match Ferni's ask
    ['Book it', 'Booked it, done.', N], // nothing but a verb names no item
    ['Book the dentist', 'YES!!! DENTIST: BOOKED. DONE.', N], // miss: two clauses
    ['Book the dentist', 'dentist\u2019s booked \u2014 done', N], // miss: out of order
    ['Send Priya the slides', 'priya...slides...done!', N],
    ['Book the dentist', 'S\u00ed, ya reserv\u00e9 el dentista, listo.', N],
    ['Book the dentist', '\u2705\u{1F44D} done', N],
    ['Book the dentist', "I didn't book the dentist but I'm done with the flight.", N],
    ['Book the dentist', "The dentist won't see me till March, but the flight is done.", N], // fe (a)
    ['Book the dentist', 'No dentist yet, but the flight is done.', N],
    ['Book the dentist', 'The dentist fell through, but done with the flight.', N],
    ['Book the dentist', 'Nothing on the dentist, the flight is done though.', N],
    ['Book the dentist', 'Ugh, so the week was chaos, work stuff, the kids, the flight, and honestly the dentist is still on my list, but the flight is done.', N], // prettier-ignore
    // the item's verb in its forms; every other word exact or plural only
    ['Fix the car', 'Fixed the car, done.', Y],
    ['Book the dentist', 'Booked the dentist, done.', Y],
    ['Book the dentist', 'Booking the dentist, done.', Y],
    ['Book the dentist', 'Scheduled the dentist, done.', N], // miss: another verb
    ['Fix the car', 'Fixed the bike while caring for Mom, done.', N], // "caring" is not "car"
    ['Pay the rent', 'Paid for the rented kayak, done.', N], // "rented" is not "rent"
    ['Send Priya the slides', 'Forget sending Priya the slides, let it go.', Y], // let go, closed as release
    // one row per irregular
    ['Pay the rent', 'Paid the rent, done.', Y],
    ['Send Priya the slides', 'Sent Priya the slides, done.', Y],
    ['Buy balloons for the party', 'Bought balloons for the party, done.', Y],
    ['Go to the bank', 'Went to the bank, done.', Y],
    ['Make the vet appointment', 'Made the vet appointment, done.', Y],
    ['Get the car washed', 'Got the car washed, done.', Y],
    ['Take out the trash', 'Took out the trash, done.', Y],
    ['Do the taxes', 'Did the taxes, done.', Y],
    // one row per rule, each caught by that rule alone
    ['Book the dentist', 'Booking the dentist is a mess, the flight is done.', N], // 1: two clauses
    ['Book the dentist', 'Booking the dentist fell through, done.', N], // 2: not done
    [
      'Book the dentist',
      'Booking the dentist is the one thing I keep putting off every single week, done.',
      N,
    ], // 3: too long
    ['Book the dentist', 'Booking the dentist. Done.', N], // 5: "done" is in another sentence
    ['Book the dentist', 'Booked the dentist. Done.', N], // miss: same rule
  ] as Array<[string, string, number]>)(
    '"%s" ← "%s": %i store writes',
    async (item, said, count) => {
      ledger = [followUp(item)];
      await answer(said);
      await settle();
      expect(writes).toEqual(count === Y ? [{ ref: 'c1', how: closeFromReply(said) }] : []);
    }
  );

  it('a negated answer closes nothing', async () => {
    await answer("I didn't send Priya the slides.");
    await settle();
    expect(ledger[0].status).toBe('surfaced');
    expect(writes).toEqual([]);
  });
});
