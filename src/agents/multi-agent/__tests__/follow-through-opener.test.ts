/**
 * The opener asks about a follow_through row, and the caller's answer closes
 * it (FOLLOW_THROUGH_OPENER). Runs the real Firestore store module
 * (follow-through-store.ts) over the store tests' Firestore fake, the real
 * recall hook, and the listeners installLiveCallBehaviors registers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeFirestore } from '../../../services/stores/__tests__/fake-firestore.js';

const fake = vi.hoisted(() => ({ db: null as unknown, owner: true }));
vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));
vi.mock('../../voice-agent-entry/caller-recognition.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sessionIsVerifiedOwner: () => fake.owner,
}));

import type { FollowUp, FollowUpStore } from '../../../services/follow-through/index.js';
import { followUp } from '../../../services/follow-through/__tests__/fixtures.js';
import { createFollowUpStore } from '../../../services/stores/follow-through-store.js';
import { applyCallerFlags, forgetAgentValues } from '../../../services/platform/cohort-flags.js';
import { createMemoryRecall } from '../memory-recall-hook.js';
import { storedTopic } from '../../../memory/recall/session-recall.js';
import { installLiveCallBehaviors } from '../live-call-behaviors.js';
import {
  answersIt,
  clearRaisedFollowUps,
  createFollowThroughOpener,
  followThroughOpenerEnabled,
  followThroughOpenerFor,
  pickOpenerFollowUp,
  RAISED_MS,
} from '../follow-through-opener.js';

const NOW = new Date('2026-10-14T18:00:00.000Z'); // 14:00 in New York
const recallStore = {
  forgotten: async () => [],
  facts: async () => [],
  summaries: async () => [
    { callerProvenance: 1, followUpItems: ['Ask how Biscuit is settling in'] },
  ],
};

let store: FollowUpStore;
let docs: Map<string, Record<string, unknown>>;

beforeEach(() => {
  const f = fakeFirestore();
  fake.db = f.db;
  fake.owner = true;
  docs = f.docs;
  store = createFollowUpStore(f.db);
  clearRaisedFollowUps();
  for (const flag of ['INTERRUPT_TRACE', 'BARGE_IN_FASTPATH', 'TURN_KEEPER', 'BARGE_IN_ACK']) {
    vi.stubEnv(flag, flag === 'BARGE_IN_ACK' ? 'any' : 'off');
  }
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  forgetAgentValues();
});

/** A commitment the after-call import wrote: "call mom", due yesterday. */
async function seed(over: Partial<FollowUp> = {}): Promise<FollowUp> {
  return store.open(
    {
      userId: 'u1',
      kind: 'commitment',
      text: 'call mom about the trip',
      dueAt: '2026-10-13T16:00:00.000Z',
      zone: 'America/New_York',
      repeat: null,
      source: { store: 'commitments', ref: 'c1' },
      ...over,
    },
    new Date('2026-10-12T15:00:00.000Z')
  );
}

const stored = async (id: string) => (await store.live('u1')).find((f) => f.id === id)!;
const doc = (id: string) => docs.get(`bogle_users/u1/follow_through/${id}`);
const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
};

/** A live call with the flag on: the recall hook raises, the session listeners hear the answer. */
async function liveCall() {
  vi.stubEnv('FOLLOW_THROUGH_OPENER', 'on');
  const handlers = new Map<string, Array<(e: unknown) => void>>();
  const session = {
    on: (event: string, h: (e: unknown) => void) =>
      handlers.set(event, [...(handlers.get(event) ?? []), h]),
    interrupt: () => undefined,
  };
  installLiveCallBehaviors({
    session: session as never,
    sessionWithEvents: session,
    sessionEventHandlers: [],
    cleanupFunctions: [],
    sessionId: 's1',
    userId: 'u1',
  });
  const recall = createMemoryRecall({ userId: 'u1', store: recallStore, opener: false });
  await recall.ready;
  const emit = (event: string, e: unknown) => handlers.get(event)?.forEach((h) => h(e));
  return {
    recall,
    ferni: async (text: string) => {
      emit('conversation_item_added', {
        item: { type: 'message', role: 'assistant', textContent: text },
      });
      await flush();
    },
    caller: async (transcript: string, isFinal = true) => {
      emit('user_input_transcribed', { transcript, isFinal });
      await flush();
      await flush();
    },
  };
}

describe('pickOpenerFollowUp', () => {
  it('asks about a due follow-up of the caller, never a Ferni promise, an action or one already raised', () => {
    const due = followUp({ id: 'due', kind: 'commitment', dueAt: '2026-10-14T17:00:00.000Z' });
    const later = followUp({ id: 'later', dueAt: '2026-10-15T17:00:00.000Z' });
    const promise = followUp({ id: 'p', kind: 'promise', dueAt: '2026-10-14T17:30:00.000Z' });
    const action = followUp({
      id: 'a',
      action: { tool: 'callOnBehalf' },
      dueAt: '2026-10-14T17:30:00.000Z',
    });
    const raised = followUp({
      id: 'r',
      dueAt: '2026-10-14T17:30:00.000Z',
      surfaced: [{ at: '2026-10-14T17:45:00.000Z', via: 'opener' }],
    });
    expect(pickOpenerFollowUp([later, promise, action, raised, due], NOW)?.id).toBe('due');
    expect(pickOpenerFollowUp([later, promise, action, raised], NOW)).toBeNull();
    const undated = followUp({ id: 'u', kind: 'thread', dueAt: null });
    expect(pickOpenerFollowUp([undated, due], NOW)?.id).toBe('due');
    expect(pickOpenerFollowUp([undated], NOW)?.id).toBe('u');
  });

  it('a reply is about it when it names it or is a bare answer', () => {
    const f = followUp({ text: 'call mom about the trip' });
    expect(answersIt('yeah I did', f)).toBe(true);
    expect(answersIt('not yet, maybe tomorrow', f)).toBe(true);
    expect(answersIt('I talked to my mom last night', f)).toBe(true);
    expect(answersIt("work's done for the week", f)).toBe(false);
  });
});

describe('the opener reads follow_through (FOLLOW_THROUGH_OPENER)', () => {
  it('off: no store read, the derived summary thread stands', async () => {
    expect(followThroughOpenerEnabled({})).toBe(false);
    await seed();
    const ft = followThroughOpenerFor('u1', {});
    await ft.ready;
    expect(ft.threads()).toBeNull();
    const recall = createMemoryRecall({
      userId: 'u1',
      store: recallStore,
      followThrough: ft,
      opener: true,
    });
    await recall.ready;
    const note = recall.noteFor("Hey Ferni, it's me!") ?? '';
    expect(note).toContain('Ask how Biscuit is settling in');
    expect(note).not.toContain('call mom');
  });

  /** The first note with the flag on, for a caller with one stored follow-up about the trip. */
  async function openerNote(
    over: Parameters<typeof createFollowThroughOpener>[0] extends infer D ? Partial<D> : never
  ) {
    const f = await seed();
    const ft = createFollowThroughOpener({ userId: 'u1', store, now: () => NOW, ...over });
    const recall = createMemoryRecall({ userId: 'u1', store: recallStore, followThrough: ft });
    await recall.ready;
    const note = recall.noteFor("Hey Ferni, it's me!") ?? '';
    await flush();
    return { f, ft, note };
  }

  it('never raises a follow-up about a topic the caller asked Ferni to forget', async () => {
    docs.set('bogle_users/u1/memory_state/forgotten', { topics: [storedTopic('the trip')] });
    const { f, ft, note } = await openerNote({});
    expect(ft.threads()).toEqual([]);
    expect(note).not.toMatch(/trip|call mom/);
    expect(note).not.toContain('Biscuit'); // and no fall back to the summary threads
    expect(note).not.toMatch(/start of the call/);
    expect(doc(f.id)).toMatchObject({ status: 'open', surfaced: [] });
  });

  it('fails closed: unreadable forgotten topics or an unreadable store offer nothing', async () => {
    const unreadable = await openerNote({ forgotten: async () => null });
    expect(unreadable.ft.threads()).toEqual([]);
    expect(unreadable.note).not.toMatch(/call mom|Biscuit|start of the call/);
    expect(doc(unreadable.f.id)).toMatchObject({ status: 'open', surfaced: [] });

    const broken: FollowUpStore = {
      ...store,
      live: async () => {
        throw new Error('index missing');
      },
    };
    const down = await openerNote({ store: broken, forgotten: async () => [] });
    expect(down.ft.threads()).toEqual([]);
    expect(down.note).not.toMatch(/call mom|Biscuit|start of the call/);
  });

  it('on: the first note asks about the stored follow-up instead of the summary thread, and marks it raised', async () => {
    const f = await seed();
    expect(doc(f.id)).toMatchObject({ status: 'open', surfaced: [] });
    const ft = createFollowThroughOpener({ userId: 'u1', store, now: () => NOW });
    const recall = createMemoryRecall({ userId: 'u1', store: recallStore, followThrough: ft });
    await recall.ready;
    const note = recall.noteFor("Hey Ferni, it's me!") ?? '';
    expect(note).toContain('call mom about the trip');
    expect(note).not.toContain('Biscuit');
    expect(note).toMatch(/start of the call\. After saying hello, ask about the one open thread/);
    await flush();
    expect(doc(f.id)).toMatchObject({ status: 'surfaced', surfaced: [{ via: 'opener' }] });
  });

  it('a cohort can turn it on', async () => {
    const env: NodeJS.ProcessEnv = { COHORT_FLAGS: 'on' };
    const cohort = { id: 'seth', enabled: true, flags: { FOLLOW_THROUGH_OPENER: 'on' } };
    const cohorts = {
      cohortsFor: async () => [cohort],
      overridesFor: async () => ({}),
      sampledCohorts: async () => [],
    };
    expect(await applyCallerFlags('u1', { store: cohorts, env })).toEqual([
      'FOLLOW_THROUGH_OPENER',
    ]);
    expect(followThroughOpenerEnabled(env)).toBe(true);
  });
});

describe("the caller's answer closes it, on a live call", () => {
  it("a raise from an earlier call lapses: its answer window doesn't carry over", async () => {
    const f = await seed();
    const call = await liveCall();
    call.recall.noteFor('Hi');
    await flush();
    await call.ferni('Did you call your mom?');
    vi.setSystemTime(new Date(NOW.getTime() + RAISED_MS + 1));
    await call.caller('yeah I did');
    expect(doc(f.id)).toMatchObject({ status: 'surfaced' });
  });

  it('"yeah I did" after Ferni asks: kept (done)', async () => {
    const f = await seed();
    const call = await liveCall();
    call.recall.noteFor("Hey Ferni, it's me!");
    await flush();
    await call.ferni('Hey you! Did you end up calling your mom?');
    await call.caller('yeah I did');
    expect(doc(f.id)).toMatchObject({ status: 'done', closedAt: NOW.toISOString() });
  });

  it('"not yet, maybe tomorrow": moved a day on; "forget it": dropped', async () => {
    const f = await seed();
    const call = await liveCall();
    call.recall.noteFor('Hi');
    await flush();
    await call.ferni('Did you get to call your mom yet?');
    await call.caller('not yet, maybe tomorrow');
    expect(doc(f.id)).toMatchObject({ status: 'open', dueAt: '2026-10-15T18:00:00.000Z' });

    const g = await seed({ source: { store: 'commitments', ref: 'c2' }, text: 'book the dentist' });
    const open = await stored(f.id);
    await store.save({ ...open, status: 'done', updatedAt: 'x' }, open.updatedAt);
    clearRaisedFollowUps();
    const again = await liveCall();
    again.recall.noteFor('Hi');
    await flush();
    await again.ferni('Did you book the dentist?');
    await again.caller('ugh, forget it');
    expect(doc(g.id)).toMatchObject({ status: 'released' });
  });

  it("never closes on Ferni's own words, an interim, or a reply about something else", async () => {
    const f = await seed();
    const call = await liveCall();
    call.recall.noteFor('Hi');
    await flush();
    await call.ferni("I did it! Done. Did you call your mom? I'm sure you did.");
    await call.caller('yeah I did', false);
    expect(doc(f.id)).toMatchObject({ status: 'surfaced' });
    await call.caller("work's done for the week");
    expect(doc(f.id)).toMatchObject({ status: 'surfaced' });
    await call.caller('yeah I did'); // the one answer was spent on the turn above
    expect(doc(f.id)).toMatchObject({ status: 'surfaced' });
  });

  it("closes nothing when Ferni didn't ask about it, or a guest answers", async () => {
    const f = await seed();
    const call = await liveCall();
    call.recall.noteFor('Hi');
    await flush();
    await call.ferni('Hey! How was the weather out there?');
    await call.ferni('Sounds lovely.');
    await call.caller('yeah I did');
    expect(doc(f.id)).toMatchObject({ status: 'surfaced' });

    clearRaisedFollowUps();
    const g = await seed({ source: { store: 'commitments', ref: 'c3' }, text: 'call grandma' });
    const left = await stored(f.id);
    await store.save({ ...left, status: 'done', updatedAt: 'y' }, left.updatedAt);
    fake.owner = false;
    const guest = await liveCall();
    guest.recall.noteFor('Hi');
    await flush();
    await guest.ferni('Did you call grandma?');
    await guest.caller('yeah I did');
    expect(doc(g.id)).toMatchObject({ status: 'surfaced' });
  });
});
