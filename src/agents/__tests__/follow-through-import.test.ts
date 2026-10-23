import type { Firestore } from '@google-cloud/firestore';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The real importer, sources and store run on this fake; only the stores the
// sources read through their own modules (commitments, summaries, forgotten
// topics) and the app's Firestore handle are replaced.
const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  commitments: [] as Array<{ id: string; data: Record<string, unknown> }>,
}));
vi.mock('../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => fakeDb(),
}));
vi.mock('../../services/superhuman/commitment-follow-up.js', async (orig) => ({
  ...(await orig<typeof import('../../services/superhuman/commitment-follow-up.js')>()),
  firestoreCommitmentStore: { active: async () => h.commitments, markFollowedUp: async () => {} },
}));
vi.mock('../../memory/storage/call-summaries.js', () => ({
  readCallSummaries: async () => ({ docs: [] }),
}));
vi.mock('../../memory/recall/forget.js', () => ({ forgottenTopicsOrNull: async () => [] }));

/** Documents by path; where('==')/limit on a collection, and transactions. */
function fakeDb(): Firestore {
  const snap = (path: string) => ({
    id: path.split('/').pop() ?? '',
    exists: h.docs.has(path),
    data: () => h.docs.get(path),
  });
  const coll = (path: string): Record<string, unknown> => ({
    doc: (id: string) => ({
      path: `${path}/${id}`,
      collection: (n: string) => coll(`${path}/${id}/${n}`),
    }),
    where: (field: string, _op: string, value: unknown) => ({
      limit: () => ({
        get: async () => ({
          docs: [...h.docs.keys()]
            .filter((p) => p.startsWith(`${path}/`) && h.docs.get(p)?.[field] === value)
            .map(snap),
        }),
      }),
    }),
  });
  return {
    collection: (name: string) => coll(name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        get: async (ref: { path: string }) => snap(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) =>
          void h.docs.set(ref.path, { ...data }),
      }),
  } as unknown as Firestore;
}

const { ownerOnTheLine } = await import('../voice-agent-entry/follow-through-import-register.js');
const { drainAfterCallTasks, registeredAfterCallTasks, runAfterCallTasks } =
  await import('../../services/session/after-call-tasks.js');
const { rememberDispatchIdentity } = await import('../voice-agent-entry/caller-recognition.js');
const { setOutboundCallContext } =
  await import('../../intelligence/context-builders/external/outbound-call-context.js');
const { importFollowUpsAfterCall } = await import('../follow-through-import.js');

const NOW = Date.parse('2026-10-17T15:00:00.000Z');
const DAY = 86_400_000;

function call(userId: string, sessionId: string) {
  return { userId, sessionId, turns: [], startedAt: new Date(NOW), timezone: 'America/Denver' };
}

/** A signed-in app call: the dispatch named the account. */
function ownerSession(sessionId: string): string {
  rememberDispatchIdentity(sessionId, 'web_auth', '{}');
  return sessionId;
}

async function runCall(userId: string, sessionId: string): Promise<void> {
  runAfterCallTasks(call(userId, sessionId));
  await drainAfterCallTasks(2_000);
}

const followUps = (userId: string): Array<Record<string, unknown>> =>
  [...h.docs.entries()]
    .filter(([p]) => p.startsWith(`bogle_users/${userId}/follow_through/`))
    .map(([, d]) => d);

beforeEach(() => {
  h.docs.clear();
  process.env.FOLLOW_THROUGH_IMPORT = 'on';
  // What the caller set up on the call: a reminder for tomorrow, and something they said they'd do.
  for (const uid of ['owner-1', 'anonymous', 'anon:3f2b', 'voice-eval-sam', 'sponsor-1']) {
    h.docs.set(`bogle_users/${uid}/reminders/r1`, {
      status: 'pending',
      message: 'Call the dentist',
      scheduledFor: new Date(NOW + DAY).toISOString(),
      timezone: 'America/Denver',
    });
  }
  h.commitments = [
    {
      id: 'c1',
      data: {
        status: 'active',
        statement: 'I am going to ask my sister about the trip',
        createdAt: NOW - DAY,
        followUpAfter: NOW + 2 * DAY,
      },
    },
  ];
});

afterEach(() => {
  delete process.env.FOLLOW_THROUGH_IMPORT;
});

describe('follow-through import after a call (FOLLOW_THROUGH_IMPORT)', () => {
  it('is registered with the after-call tasks', () => {
    expect(registeredAfterCallTasks()).toContain('follow-through-import');
  });

  it("writes the owner's reminder and commitment as two open follow-ups under their uid", async () => {
    expect(followUps('owner-1')).toHaveLength(0);
    await runCall('owner-1', ownerSession('s-owner'));

    const made = followUps('owner-1');
    expect(made.map((f) => [f.kind, f.text, f.status, f.userId]).sort()).toEqual([
      // The stored line with its lead-in off (toOpenCommitment).
      ['commitment', 'ask my sister about the trip', 'open', 'owner-1'],
      ['reminder', 'Call the dentist', 'open', 'owner-1'],
    ]);
    expect(made.every((f) => f.zone === 'America/Denver')).toBe(true);
    expect([...h.docs.keys()].filter((p) => p.includes('/follow_through/'))).toHaveLength(2);
  });

  it('writes nothing new when the same call is imported again', async () => {
    await runCall('owner-1', ownerSession('s-again'));
    const first = new Map(h.docs);

    // A later run: importFollowUps counts a follow-up created at `now` as new.
    const later = () => new Date(Date.now() + 60_000);
    const again = await importFollowUpsAfterCall(call('owner-1', 's-again'), {
      verifiedOwner: ownerOnTheLine,
      now: later,
    });

    expect(again).toEqual({ imported: true, result: { seen: 2, opened: 0, failed: 0 } });
    expect(h.docs).toEqual(first);
  });

  it('writes nothing with the flag off', async () => {
    delete process.env.FOLLOW_THROUGH_IMPORT;
    await runCall('owner-1', ownerSession('s-off'));
    expect(followUps('owner-1')).toHaveLength(0);
  });

  it('writes nothing for an anonymous or eval caller, even on a session the dispatch named', async () => {
    for (const uid of ['anonymous', 'anon:3f2b', 'voice-eval-sam']) {
      // eslint-disable-next-line no-await-in-loop -- one call at a time, like the job runner
      await runCall(uid, ownerSession(`s-${uid}`));
      expect(followUps(uid)).toHaveLength(0);
    }
  });

  it("writes nothing when the caller isn't the proven owner, or Ferni placed the call", async () => {
    await runCall('owner-1', 's-unrecognised-phone');
    expect(followUps('owner-1')).toHaveLength(0);

    const onBehalf = ownerSession('s-on-behalf');
    setOutboundCallContext(onBehalf, {
      callId: 'c',
      recipientName: 'Doug',
      kind: 'on_behalf',
    } as never);
    await runCall('sponsor-1', onBehalf);
    expect(followUps('sponsor-1')).toHaveLength(0);
  });

  it('treats nobody as the owner when no owner check is handed in', async () => {
    const r = await importFollowUpsAfterCall(call('owner-1', ownerSession('s-no-check')));
    expect(r).toEqual({ imported: false, reason: 'not-owner' });
    expect(followUps('owner-1')).toHaveLength(0);
  });

  it('waits for a call with a known zone rather than guessing one', async () => {
    const r = await importFollowUpsAfterCall(
      { userId: 'owner-1', sessionId: ownerSession('s-no-zone') },
      { verifiedOwner: ownerOnTheLine }
    );
    expect(r).toEqual({ imported: false, reason: 'no-zone' });
    expect(followUps('owner-1')).toHaveLength(0);
  });
});

describe('FOLLOW_THROUGH_IMPORT from the caller’s cohort, the agent’s own flag off', () => {
  const env = { COHORT_FLAGS: 'on' }; // the agent: FOLLOW_THROUGH_IMPORT unset
  const cohorts = {
    cohortsFor: async (u: string) =>
      u === 'owner-1'
        ? [{ id: 'seth', enabled: true, flags: { FOLLOW_THROUGH_IMPORT: 'on' } }]
        : [],
    overridesFor: async () => ({}),
  };
  const deps = { env, cohorts, verifiedOwner: () => true };

  it('imports for the cohort member only', async () => {
    delete process.env.FOLLOW_THROUGH_IMPORT;
    const member = await importFollowUpsAfterCall(call('owner-1', 's-cohort'), deps);
    const other = await importFollowUpsAfterCall(call('sponsor-1', 's-other'), deps);

    expect(member.imported).toBe(true);
    expect(followUps('owner-1').length).toBeGreaterThan(0);
    expect(other).toEqual({ imported: false, reason: 'flag-off' });
    expect(followUps('sponsor-1')).toHaveLength(0);
  });
});

describe('BOOKENDS: timed one-time dates come in with eventAt, per person', () => {
  // A biopsy the caller said was Monday at 3, stored by dates that matter (dates/store.ts).
  const biopsy = {
    subject: 'self',
    attribute: 'event',
    value: 'biopsy',
    origin: 'dates',
    kind: 'medical',
    recurrence: 'once',
    eventDate: '2026-10-19',
    at: '15:00',
    when: 'Monday at 3',
    needsConfirmation: false,
    validTo: null,
  };
  const cohortWith = (flags: Record<string, string>) => ({
    cohortsFor: async () => [{ id: 'seth', enabled: true, flags }],
    overridesFor: async () => ({}),
  });
  const run = (flags: Record<string, string>) =>
    importFollowUpsAfterCall(call('owner-1', 's-bookends'), {
      env: { COHORT_FLAGS: 'on' },
      cohorts: cohortWith(flags),
      verifiedOwner: () => true,
      now: () => new Date(NOW),
    });
  const BRAIN = ['eventAt', 'eventPrecision', 'askType', 'salience'];

  beforeEach(() => {
    delete process.env.FOLLOW_THROUGH_IMPORT;
    h.docs.set('bogle_users/owner-1/world_facts/wd_1', biopsy);
  });

  it('flag off: the same two follow-ups as before, and no brain field on any', async () => {
    await run({ FOLLOW_THROUGH_IMPORT: 'on' });
    const made = followUps('owner-1');
    expect(made.map((f) => f.kind).sort()).toEqual(['commitment', 'reminder']);
    expect(made.flatMap((f) => BRAIN.filter((k) => k in f))).toEqual([]);
  });

  it('flag on for this caller: the biopsy is a follow-up that knows when it happens', async () => {
    await run({ FOLLOW_THROUGH_IMPORT: 'on', BOOKENDS: 'on' });
    const date = followUps('owner-1').find((f) => f.kind === 'date');
    expect(date).toMatchObject({
      text: 'biopsy',
      dueAt: null,
      zone: 'America/Denver',
      source: { store: 'world_facts', ref: 'wd_1' },
      // 15:00 in Denver (MDT, UTC-6)
      eventAt: '2026-10-19T21:00:00.000Z',
      eventPrecision: 'time',
      askType: 'how-did-it-go',
      salience: { weight: 0.9, heavy: true, sensitive: true, by: 'rule', v: 1 },
    });
    expect(followUps('owner-1')).toHaveLength(3);
  });

  it("the registered task reads heaviness with the Home Screen's test (a recital is light)", async () => {
    process.env.FOLLOW_THROUGH_IMPORT = 'on';
    process.env.BOOKENDS = 'on';
    const recital = { ...biopsy, kind: 'event', value: 'recital', eventDate: '2099-01-05' };
    h.docs.set('bogle_users/owner-1/world_facts/wd_1', recital);
    try {
      await runCall('owner-1', ownerSession('s-registered'));
    } finally {
      delete process.env.BOOKENDS;
    }
    const date = followUps('owner-1').find((f) => f.kind === 'date');
    expect(date?.salience).toMatchObject({ heavy: false, sensitive: false });
  });
});
