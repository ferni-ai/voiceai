/**
 * The call opener's reply close reaches the todo itself only on the owner's
 * yes (FOLLOW_THROUGH_CLOSE_SOURCE, close-confirm.ts). A done or let-go answer
 * closes the follow-up, as on main. Ferni's acknowledgement then asks once
 * whether to take the todo off their list, and only a clear yes to that
 * question, from the owner, on this call, within 24 h, with no crisis read,
 * closes it where it lives. The flag is read for this caller (envForCaller).
 * Fictional items only.
 *
 * On main the reply listener has no source writer and no question, so the
 * confirm rows fail there.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => {
  const log: Record<string, unknown> = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }; // prettier-ignore
  log.child = () => log;
  return { createLogger: () => log, getLogger: () => log };
});

import {
  asksToClose,
  hedgedAnswer,
  type FollowUp,
  type FollowUpStore,
} from '../../../services/follow-through/index.js';
import type { CohortStore } from '../../../services/platform/cohort-firestore.js';
import { applyCallerFlags, forgetAgentValues } from '../../../services/platform/cohort-flags.js';
import { createLogger } from '../../../utils/safe-logger.js';
import { noteCrisisVerdictPending, signalCrisisDecision } from '../../safety/crisis-gate-signal.js';
import { ASKS, NOT_ASKS, R3_PROBES } from './follow-through-close-fixtures.js';

const opener = await import('../follow-through-opener.js');

const OWNER = 'owner-1';
const OTHER = 'owner-2';
const ON = { FOLLOW_THROUGH_CLOSE_SOURCE: 'on' };
/** A cohort that turns the flag on for `member` only. */
const cohortFor = (member: string): CohortStore => ({
  cohortsFor: async (u) => (u === member ? [{ id: 'try-close', enabled: true, flags: { FOLLOW_THROUGH_CLOSE_SOURCE: 'on' } }] : []), // prettier-ignore
  overridesFor: async () => ({}),
});
const CALL = new Date('2026-10-17T23:00:00Z');
const ITEM = 'Send Priya the slides';
const ASK = 'Nice. Want me to take that off your list too?';

let ledger: FollowUp[];
let writes: Array<{ ref: string; how: string }>;
let notes: string[];
let peeks: number;
let peekAs: 'open' | 'already' | 'missing' | 'safety' | 'throw';
let failWrites: boolean;
let owner: boolean;
let session: object;
let onSave: ((next: FollowUp) => void) | null;

const store: FollowUpStore = {
  open: async () => { throw new Error('unused'); }, // prettier-ignore
  live: async () => ledger.filter((f) => f.status === 'open' || f.status === 'surfaced'),
  due: async () => [],
  changedBetween: async () => ledger,
  async save(next, expected) {
    onSave?.(next);
    const i = ledger.findIndex((f) => f.id === next.id);
    if (i < 0 || ledger[i].updatedAt !== expected) return false;
    ledger[i] = next;
    return true;
  },
};

const closers = {
  async peek() {
    peeks++;
    if (peekAs === 'throw') throw new Error('UNAVAILABLE');
    return peekAs;
  },
  async close(_u: string, s: { store: string; ref: string }, how: 'done' | 'release') {
    if (failWrites) throw new Error('UNAVAILABLE');
    writes.push({ ref: s.ref, how });
    return 'closed' as const;
  },
};

function seed(text = ITEM, over: Partial<FollowUp> = {}): void {
  ledger = [{ id: 'f-c1', userId: OWNER, kind: 'commitment', text, dueAt: null, zone: 'America/Chicago', repeat: null, source: { store: 'commitments', ref: 'c1' }, status: 'open', surfaced: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z', ...over }]; // prettier-ignore
}

beforeEach(() => {
  seed();
  writes = [];
  notes = [];
  peeks = 0;
  peekAs = 'open';
  failWrites = false;
  owner = true;
  session = {};
  onSave = null;
  opener.clearRaisedFollowUps();
  forgetAgentValues();
  vi.restoreAllMocks();
});

/** Long enough for the flag read, the peek, the follow-up save and any store write to land. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 8; i++) await new Promise<void>((r) => { setTimeout(r, 0); }); // prettier-ignore
};

type Listeners = ReturnType<typeof opener.followThroughReplyListeners>;
const listen = (env: Record<string, string | undefined>, cohorts?: CohortStore, sessionId = 'call-1'): Listeners => opener.followThroughReplyListeners({ userId: OWNER, sessionId, isOwner: () => owner, session, note: (t) => notes.push(t), store, closers, env, cohorts, now: () => CALL }); // prettier-ignore
const reply = (l: Listeners, text: string) => l.onItemAdded({ item: { role: 'assistant', type: 'message', textContent: text } }); // prettier-ignore
const say = (l: Listeners, text: string) => l.onTranscript({ transcript: text, isFinal: true });

/** Ferni raises the follow-up and asks about it; the owner answers `said`. */
async function answer(
  said: string,
  env: Record<string, string | undefined> = ON,
  cohorts?: CohortStore
): Promise<Listeners> {
  // prettier-ignore
  const item = ledger[0].text;
  const pick = opener.createFollowThroughOpener({ userId: OWNER, store, forgotten: async () => [], now: () => CALL }); // prettier-ignore
  await pick.ready;
  pick.raised([item]);
  await vi.waitFor(() => expect(ledger[0].status).toBe('surfaced'));
  await settle();
  const l = listen(env, cohorts);
  reply(l, `Did you get to this one: ${item}?`);
  await settle(); // the flag and the todo are read while Ferni asks
  say(l, said);
  await settle();
  return l;
}

/** The whole confirm: the answer, Ferni's acknowledgement asks, the owner says `yes`. */
async function confirm(said: string, yes = 'Yes please.'): Promise<Listeners> {
  const l = await answer(said);
  reply(l, ASK);
  say(l, yes);
  await settle();
  return l;
}

describe('a done or let-go answer alone closes only the follow-up', () => {
  it.each(R3_PROBES)('%s / %s: no store write without a yes', async (item, said) => {
    seed(item);
    await answer(said);
    expect(writes).toEqual([]);
  });

  it('a done answer closes the follow-up and asks in the same reply, once, recorded on it', async () => {
    await answer('Yep, sent Priya the slides, done.');
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].sourceAskedAt).toBe(CALL.toISOString());
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('Want me to take "send Priya the slides" off your list too?');
    expect(writes).toEqual([]);
  });

  it('a let-go answer asks with the let-go copy', async () => {
    await answer('Forget sending Priya the slides, let it go.');
    expect(ledger[0].status).toBe('released');
    expect(notes[0]).toContain('Want me to drop "send Priya the slides" from your list for good?');
  });

  it('an item too long to say is asked about as "that"', async () => {
    seed('Send Priya the slides from the offsite before the board meeting on Friday');
    await answer('Yep, done.');
    expect(notes[0]).toContain('Want me to take that off your list too?');
  });
});

describe('only the owner’s yes to the question closes the todo', () => {
  it.each([
    ['Fix the car', "Car's fixed, done."],
    ['Pay the rent', "Rent's paid, done."],
    ['Send Priya the slides', 'Sent the slides to Priya, done.'],
    ['Send Priya the slides', 'yep, done'],
  ])('%s / %s, then yes: closed as done', async (item, said) => {
    seed(item);
    await confirm(said);
    expect(writes).toEqual([{ ref: 'c1', how: 'done' }]);
  });

  it('a let go, then yes: closed as let go', async () => {
    await confirm('Forget sending Priya the slides, let it go.', 'Yeah, go ahead.');
    expect(writes).toEqual([{ ref: 'c1', how: 'release' }]);
  });

  it.each(['no', 'not yet', 'wait, no', 'yeah, wait, no', 'hmm, which one?'])(
    '"%s" after the question: kept open',
    async (no) => {
      // prettier-ignore
      await confirm('Yep, done.', no);
      expect(writes).toEqual([]);
    }
  );

  it('a yes before Ferni asked (to an earlier question) closes nothing', async () => {
    const l = await answer('Yep, done.');
    say(l, 'Yes.');
    reply(l, ASK);
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a yes after Ferni moved on to another question closes nothing', async () => {
    const l = await answer('Yep, done.');
    reply(l, ASK);
    reply(l, 'And how was the weekend, did you get some rest?');
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a reply that never asked arms nothing: a yes then closes nothing', async () => {
    const l = await answer('Yep, done.');
    reply(l, 'Nice work! Is that everything on your list today?');
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a yes 24 h later closes nothing', async () => {
    const l = await answer('Yep, done.');
    reply(l, ASK);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 24 * 60 * 60_000 + 1);
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a yes on the next call (another session) closes nothing', async () => {
    const l = await answer('Yep, done.');
    reply(l, ASK);
    say(listen(ON, undefined, 'call-2'), 'Yes.');
    await settle();
    expect(writes).toEqual([]);
    say(l, 'Yes.'); // the question was answered, by nothing: it is gone
    await settle();
    expect(writes).toEqual([]);
  });

  it("a guest's yes closes nothing", async () => {
    const l = await answer('Yep, done.');
    reply(l, ASK);
    owner = false;
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a crisis read between the question and the yes: nothing closes', async () => {
    const l = await answer('Yep, done.');
    reply(l, ASK);
    noteCrisisVerdictPending(session, new Promise<never>(() => { /* never settles */ })); // the classifier is still reading
    say(l, 'Yes.');
    await settle();
    expect(writes).toEqual([]);
  });

  it('a store write that fails leaves the follow-up closed and throws nothing', async () => {
    failWrites = true;
    await confirm('Yep, done.');
    expect(ledger[0].status).toBe('done');
    expect(writes).toEqual([]);
  });

  it('logs carry outcome and kind, never the item', async () => {
    seed('Return the zebrafinch cage');
    await confirm('Yep, done.');
    const logged = JSON.stringify(vi.mocked(createLogger({ module: 'x' }).info as (...a: unknown[]) => void).mock.calls); // prettier-ignore
    expect(logged).toContain('FOLLOW_THROUGH_SOURCE_CONFIRM');
    expect(logged).not.toMatch(/zebrafinch/i);
  });
});

describe('when Ferni does not ask', () => {
  it.each([
    'Not yet, maybe tomorrow.',
    'Done, but the deck still needs work.',
    'Kinda sorted, I guess.',
  ])(
    // prettier-ignore
    '"%s": no question',
    async (said) => {
      await answer(said);
      expect(notes).toEqual([]);
    }
  );

  it('already asked once (on an earlier call): no second question', async () => {
    seed(ITEM, { sourceAskedAt: '2026-10-16T23:00:00Z' });
    await answer('Yep, done.');
    expect(ledger[0].status).toBe('done');
    expect(notes).toEqual([]);
  });

  it('a crisis read when they answer: no question, nothing recorded', async () => {
    signalCrisisDecision(session, 'guide');
    await answer('Yep, done.');
    expect(ledger[0].status).toBe('done');
    expect(ledger[0].sourceAskedAt).toBeUndefined();
    expect(notes).toEqual([]);
  });

  it('no session to read crisis from: unknown, so no question', async () => {
    session = undefined as unknown as object;
    await answer('Yep, done.');
    expect(ledger[0].status).toBe('done');
    expect(notes).toEqual([]);
  });

  it('a crisis read that starts while the follow-up saves: no question', async () => {
    onSave = (next) => { if (next.status === 'done') signalCrisisDecision(session, 'guide'); }; // prettier-ignore
    await answer('Yep, done.');
    expect(ledger[0].status).toBe('done');
    expect(notes).toEqual([]);
  });

  it("a guest's done: kept open, no question", async () => {
    owner = false;
    await answer('Yep, done.');
    expect(ledger[0].status).toBe('surfaced');
    expect(notes).toEqual([]);
  });

  it.each(['safety', 'already', 'missing', 'throw'] as const)(
    'the todo reads %s: no question',
    async (state) => {
      // prettier-ignore
      peekAs = state;
      await answer('Yep, done.');
      expect(ledger[0].status).toBe('done');
      expect(notes).toEqual([]);
    }
  );

  it('a repeating follow-up: no question', async () => {
    seed(ITEM, { repeat: { every: 'week', at: '09:00' } });
    await answer('Yep, done.');
    expect(notes).toEqual([]);
  });

  it("Ferni's acknowledgement went out before the question could: never asked later", async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((r) => { release = r; }); // prettier-ignore
    const save = store.save.bind(store);
    vi.spyOn(store, 'save').mockImplementation(async (n, e) => { await held; return save(n, e); }); // prettier-ignore
    const pick = opener.createFollowThroughOpener({ userId: OWNER, store: { ...store, save }, forgotten: async () => [], now: () => CALL }); // prettier-ignore
    await pick.ready;
    pick.raised([ITEM]);
    await vi.waitFor(() => expect(ledger[0].status).toBe('surfaced'));
    await settle();
    const l = listen(ON);
    reply(l, `Did you get to this one: ${ITEM}?`);
    await settle();
    say(l, 'Yep, done.');
    await settle();
    reply(l, 'Nice work, that one is done.'); // the acknowledgement, without the question
    release();
    await settle();
    expect(ledger[0].status).toBe('done');
    expect(notes).toEqual([]);
  });

  it('flag off: the follow-up closes as on main, no question, nothing read or written', async () => {
    await answer('Yep, sent Priya the slides, done.', {});
    expect(ledger[0].status).toBe('done');
    expect(ledger[0]).not.toHaveProperty('sourceAskedAt');
    expect([notes, writes, peeks]).toEqual([[], [], 0]);
  });

  it("flag on for another caller, off for this one: nothing, though the env holds the other's flag", async () => {
    // prettier-ignore
    const env: Record<string, string | undefined> = { COHORT_FLAGS: 'on' };
    await applyCallerFlags(OTHER, { store: cohortFor(OTHER), env }); // the other caller's call set it
    expect(env.FOLLOW_THROUGH_CLOSE_SOURCE).toBe('on');
    const l = await answer('Yep, done.', env, cohortFor(OTHER));
    reply(l, ASK);
    say(l, 'Yes.');
    await settle();
    expect([notes, writes, peeks]).toEqual([[], [], 0]);
  });

  it('flag on for this caller through their cohort: asked, and closed on the yes', async () => {
    const l = await answer('Yep, done.', { COHORT_FLAGS: 'on' }, cohortFor(OWNER));
    expect(notes).toHaveLength(1);
    reply(l, ASK);
    say(l, 'Yes.');
    await vi.waitFor(() => expect(writes).toEqual([{ ref: 'c1', how: 'done' }]));
  });
});

describe('the pieces', () => {
  it.each([
    'Not yet',
    'done, but not the deck',
    'kinda sorted',
    'I will tomorrow',
    'done?',
    'almost done',
    'I won’t be doing it',
  ])(
    // prettier-ignore
    'hedged: "%s"',
    (said) => expect(hedgedAnswer(said)).toBe(true)
  );
  it.each([
    'Yep, done.',
    'Forget it, let it go.',
    'Never mind, drop it.',
    "I'm not doing it, skip it.",
  ])(
    // prettier-ignore
    'plain: "%s"',
    (said) => expect(hedgedAnswer(said)).toBe(false)
  );
  // The arm rate over the paraphrase fixture: every ASKS row arms, no NOT_ASKS row does.
  it.each(ASKS)('arms: %s', (r) => expect(asksToClose(r, 'Fix the car')).toBe(true));
  it.each(NOT_ASKS)('does not arm: %s', (r) => expect(asksToClose(r, 'Fix the car')).toBe(false));
});
