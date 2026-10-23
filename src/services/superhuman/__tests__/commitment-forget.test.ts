/**
 * Forget requests reach every reader of bogle_users/{uid}/commitments: a
 * forgotten topic in the statement, and a forgotten person named only in the
 * person field, are hidden; an unreadable forget list shows nothing; anything
 * else still shows. Only Firestore and the forget list are fakes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  rows: {} as Record<string, Array<{ id: string; data: Record<string, unknown> }>>,
  forgotten: [] as string[] | null | 'throw',
}));

/** Any query chain over the fake rows: per user under doc(uid), every user for collectionGroup. */
function query(uid?: string): Record<string, unknown> {
  const rows = uid
    ? (h.rows[uid] ?? []).map((r) => ({ ...r, uid }))
    : Object.entries(h.rows).flatMap(([u, rs]) => rs.map((r) => ({ ...r, uid: u })));
  const docs = rows.map((r) => ({ id: r.id, data: () => r.data, ref: { parent: { parent: { id: r.uid } } } })); // prettier-ignore
  const q: Record<string, unknown> = {
    doc: (id: string) => query(id),
    collection: () => query(uid),
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    get: async () => ({ empty: docs.length === 0, docs }),
  };
  return q;
}
const db = { collection: () => query(), collectionGroup: () => query() };

vi.mock('../../../utils/firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../../../utils/firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
// The test setup mocks this re-export on its own (src/tests/setup.ts).
vi.mock('../firestore-utils.js', async (orig) => ({
  ...(await orig<typeof import('../firestore-utils.js')>()),
  getFirestoreDb: () => db,
}));
vi.mock('firebase-admin/firestore', async (orig) => ({
  ...(await orig<typeof import('firebase-admin/firestore')>()),
  getFirestore: () => db,
}));
vi.mock('../../../memory/recall/forget.js', async (orig) => ({
  ...(await orig<typeof import('../../../memory/recall/forget.js')>()),
  forgottenTopicsOrNull: async () => {
    if (h.forgotten === 'throw') throw new Error('forget list down');
    return h.forgotten;
  },
}));
vi.mock('../../outreach/proactive-channels/proactive-tick.js', () => ({
  proactiveUserIds: async () => [],
}));

const { commitmentsShown, forgetText } = await import('../commitment-forget.js');
const { loadCallCheckIns } = await import('../commitment-follow-up.js');
const { loadActiveCommitmentsOrThrow } = await import('../commitment-store.js');
const { sendCommitmentPushes } = await import('../../../api/scheduled-jobs/commitment-push.js');
const { commitmentTriggers } = await import('../../outreach/proactive-channels/more-triggers.js');
const { getActiveCommitments } = await import('../../trust-systems/commitment-tracking.js');
const { buildUnifiedUserKnowledge } = await import('../unified-user-knowledge.js');

const NOW = Date.parse('2026-10-18T16:00:00Z');
const DAY = 86_400_000;
const row = (id: string, over: Record<string, unknown>) => ({
  id,
  data: {
    status: 'active',
    createdAt: NOW - DAY,
    lastMentioned: NOW - DAY,
    followUpAfter: NOW - 3_600_000,
    followUpCount: 0,
    ...over,
    // The field older readers show (unified-user-knowledge.ts).
    description: over.statement,
  },
});
/** One user's rows: a forgotten topic in the statement, a forgotten person only in `person`, one kept. */
const rowsFor = (uid: string) => [
  row(`${uid}-topic`, { statement: 'call Mindy about the wedding tomorrow' }),
  // The earliest follow-up, so the push (one per person) sends it whenever it is shown.
  row(`${uid}-person`, { statement: 'call your sister tomorrow', person: 'Mindy', followUpAfter: NOW - 2 * 3_600_000 }), // prettier-ignore
  row(`${uid}-kept`, { statement: 'pay the water bill tonight' }),
];

/** Each reader, as the statements it would show this user. */
const READERS: Record<string, (uid: string) => Promise<string[]>> = {
  'call check-in (loadCallCheckIns)': async (uid) =>
    (await loadCallCheckIns(uid, undefined, NOW)).map((c) => c.statement),
  'store read (loadActiveCommitmentsOrThrow)': async (uid) =>
    (await loadActiveCommitmentsOrThrow(uid)).map((c) => c.statement),
  'between-call push (sendCommitmentPushes)': async () => {
    const sent: string[] = [];
    await sendCommitmentPushes({ send: async (_u, msg) => Boolean(sent.push(msg)) }, NOW);
    return sent;
  },
  'proactive trigger (commitmentTriggers)': async (uid) =>
    (await commitmentTriggers(uid, new Date(NOW))).map((t) => t.text),
  'coach follow-through (getActiveCommitments)': async (uid) =>
    (await getActiveCommitments(uid)).map((c) => c.content),
  'unified knowledge (buildUnifiedUserKnowledge)': async (uid) => {
    const off = { includeProfile: false, includeVoiceMemory: false, includePersonaMemories: false, includeCognitiveMemory: false, includeDynamicMemory: false }; // prettier-ignore
    const k = await buildUnifiedUserKnowledge(uid, { ...off, includeSuperhuman: true });
    return k.commitments.map((c) => String(c.description));
  },
};

let n = 0;
beforeEach(() => {
  process.env.COACH_FOLLOW_THROUGH = 'on';
  h.rows = {};
  h.forgotten = ['mindy'];
});
afterEach(() => {
  delete process.env.COACH_FOLLOW_THROUGH;
});

describe('commitmentsShown', () => {
  it('reads every field that says who or what', () => {
    expect(
      forgetText({ statement: 'call your sister', person: 'Mindy', quote: 'q', x: 'no' })
    ).toBe('call your sister q Mindy');
  });

  it('hides a forgotten topic or person, shows the rest, and shows nothing blind', async () => {
    const shown = await commitmentsShown('u', async () => ['mindy']);
    expect(shown({ statement: 'call Mindy tomorrow' })).toBe(false);
    expect(shown({ statement: 'call your sister tomorrow', personInvolved: 'Mindy' })).toBe(false);
    expect(shown({ statement: 'pay the water bill' })).toBe(true);
    expect((await commitmentsShown('u', async () => null))({ statement: 'pay rent' })).toBe(false);
    const down = async (): Promise<string[]> => {
      throw new Error('down');
    };
    expect((await commitmentsShown('u', down))({ statement: 'pay rent' })).toBe(false);
  });
});

describe.each(Object.entries(READERS))('%s', (_name, read) => {
  it('hides a forgotten topic in the statement and a forgotten person only in person, keeps the rest', async () => {
    const uid = `u${++n}`;
    h.rows[uid] = rowsFor(uid);
    const shown = await read(uid);
    expect(shown.some((s) => s.includes('water bill'))).toBe(true);
    expect(shown.filter((s) => /mindy|sister/i.test(s))).toEqual([]);
  });

  it('shows nothing when the forget list cannot be read', async () => {
    const uid = `u${++n}`;
    h.rows[uid] = rowsFor(uid);
    h.forgotten = 'throw';
    expect(await read(uid)).toEqual([]);
    h.forgotten = null;
    expect(await read(`${uid}`)).toEqual([]);
  });

  it('with nothing forgotten, shows all of them', async () => {
    const uid = `u${++n}`;
    h.rows[uid] = rowsFor(uid);
    h.forgotten = [];
    expect((await read(uid)).length).toBeGreaterThan(0);
    expect((await read(uid)).some((s) => /sister/i.test(s))).toBe(true);
  });
});

describe('a forget list that never loads', () => {
  it('shows nothing, within the bound, instead of holding the reader', async () => {
    vi.useFakeTimers();
    try {
      const { commitmentsShown, SHOWN_TIMEOUT_MS } = await import('../commitment-forget.js');
      const pending = commitmentsShown('member-hang', () => new Promise(() => undefined));
      await vi.advanceTimersByTimeAsync(SHOWN_TIMEOUT_MS);
      const shown = await pending;
      expect(shown({ statement: 'send the resume to Dana' })).toBe(false); // closed
    } finally {
      vi.useRealTimers();
    }
  });
});
