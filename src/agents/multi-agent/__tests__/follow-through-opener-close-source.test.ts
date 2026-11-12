/**
 * The call opener's reply close reaches the todo itself: when the owner answers
 * Ferni's ask with done or let go, the source item closes through its store's
 * writer too (FOLLOW_THROUGH_CLOSE_SOURCE), not only the follow-up. A "later"
 * changes no store, the flag off writes nothing, and a failed store write
 * leaves the follow-up's own close standing. A bare "yep, done" closes only the
 * follow-up: a store write needs the answer to name the todo. The flag is read
 * for this caller (envForCaller), never from another caller's flags left in the
 * env. Fictional items only.
 *
 * On main the reply listener has no source writer, so the done and let-go rows
 * fail there with the source still open.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FollowUp, FollowUpStore } from '../../../services/follow-through/index.js';
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

beforeEach(() => {
  ledger = [{ id: 'f-c1', userId: OWNER, kind: 'commitment', text: 'Send Priya the slides', dueAt: null, zone: 'America/Chicago', repeat: null, source: { store: 'commitments', ref: 'c1' }, status: 'open', surfaced: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' }]; // prettier-ignore
  writes = [];
  failWrites = false;
  forgetAgentValues();
});

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

/** Ferni raises the follow-up and asks about it; the owner answers `said`. */
async function answer(
  said: string,
  env: Record<string, string | undefined> = { FOLLOW_THROUGH_CLOSE_SOURCE: 'on' },
  cohorts?: CohortStore
) {
  const pick = opener.createFollowThroughOpener({ userId: OWNER, store, forgotten: async () => [], now: () => CALL }); // prettier-ignore
  await pick.ready;
  pick.raised(['Send Priya the slides']);
  await vi.waitFor(() => expect(ledger[0].status).toBe('surfaced'));
  await flush(); // the raise is noted after the save
  const listen = opener.followThroughReplyListeners({ userId: OWNER, isOwner: () => true, store, closers, env, cohorts, now: () => CALL }); // prettier-ignore
  listen.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: 'Did the slides go to Priya?' } }); // prettier-ignore
  listen.onTranscript({ transcript: said, isFinal: true });
}

describe('the opener reply closes the todo where it lives', () => {
  it('done: the follow-up is kept and its commitment is closed as done', async () => {
    await answer('Yep, sent Priya the slides, done.');
    await vi.waitFor(() => expect(ledger[0].status).toBe('done'));
    await vi.waitFor(() => expect(writes).toEqual([{ ref: 'c1', how: 'done' }]));
  });

  it('let go: the follow-up is released and its commitment is closed as let go', async () => {
    await answer('Forget the slides for Priya, let it go.');
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
});
