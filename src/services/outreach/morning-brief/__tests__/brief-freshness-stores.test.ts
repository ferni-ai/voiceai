/**
 * The freshness gate end to end on its real reads: the real brief run, the real
 * readDay and the real defaultMorningBriefDeps().freshness, over an in-memory
 * Firestore that orders strings the way Firestore does. The stub-read rows in
 * brief-freshness.test.ts can't catch a read that never returns anything (the
 * ledger's end bound did exactly that). No emulator here: the fake is the store.
 * Fictional people and items only.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuardedText, TextOutcome } from '../../guarded-text.js';

type Doc = Record<string, unknown>;

const fake = vi.hoisted(() => {
  const cols = new Map<string, Map<string, Doc>>();
  const docsOf = (path: string): Map<string, Doc> => {
    const docs = cols.get(path) ?? new Map<string, Doc>();
    cols.set(path, docs);
    return docs;
  };
  // Firestore orders values by type first, so a string range never matches another type.
  const passes = (v: unknown, op: string, x: unknown): boolean => {
    if (op === '==') return v === x;
    if (op === 'in') return Array.isArray(x) && x.includes(v);
    if (typeof v !== 'string' || typeof x !== 'string') return false;
    if (op === '>=') return v >= x;
    if (op === '<') return v < x;
    if (op === '<=') return v <= x;
    throw new Error(`fake Firestore has no '${op}'`);
  };
  type Where = readonly [string, string, unknown];
  const query = (path: string, wheres: readonly Where[], max: number) => ({
    where: (f: string, op: string, x: unknown) => query(path, [...wheres, [f, op, x]], max),
    orderBy: () => query(path, wheres, max),
    limit: (n: number) => query(path, wheres, n),
    get: async () => ({
      docs: [...docsOf(path)]
        .filter(([, d]) => wheres.every(([f, op, x]) => passes(d[f], op, x)))
        .slice(0, max)
        .map(([id, d]) => ({ id, exists: true, data: () => d })),
    }),
  });
  const collection = (path: string): unknown => ({
    ...query(path, [], Infinity),
    doc: (id: string) => ({
      id,
      parent: path,
      collection: (name: string) => collection(`${path}/${id}/${name}`),
      get: async () => ({ id, exists: docsOf(path).has(id), data: () => docsOf(path).get(id) }),
    }),
  });
  const db = {
    collection,
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        delete: (ref: { parent: string; id: string }) => ops.push(() => docsOf(ref.parent).delete(ref.id)), // prettier-ignore
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { db, cols, put: (path: string, id: string, d: Doc) => docsOf(path).set(id, d) };
});

const runLines = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const forgotten = vi.hoisted(() => vi.fn<(userId: string) => Promise<string[] | null>>());
const active = vi.hoisted(() => vi.fn<(userId: string) => Promise<Array<{ id: string; data: Doc }>>>()); // prettier-ignore

vi.mock('../../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => fake.db }));
vi.mock('../../../calendar/calendar-service.js', () => ({ getEventsForDay: async () => [] }));
vi.mock('../../../../memory/recall/forget.js', () => ({ forgottenTopicsOrNull: forgotten }));
vi.mock('../../../superhuman/commitment-follow-up.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  firestoreCommitmentStore: { active },
  toOpenCommitment: (id: string, data: { statement: string }) => ({ id, statement: data.statement }), // prettier-ignore
}));
vi.mock('../../../superhuman/commitment-single-writer.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  singleWriterFor: async () => false,
}));
vi.mock('../../../../tasks/scheduled/calendar-briefing-job.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  resolveClaimStore: async () => null,
}));
vi.mock('../../../../utils/safe-logger.js', async (importOriginal) => {
  const logger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn((fields: Record<string, unknown>, msg?: string) => {
      if (msg === 'MORNING_BRIEF_RUN') runLines.push(fields);
    }),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger(),
  });
  return { ...(await importOriginal<object>()), createLogger: logger };
});

const { runMorningBriefs } = await import('../brief-job.js');
const { defaultMorningBriefDeps } = await import('../default-deps.js');

const OWNER = 'uid-owner';
const EIGHT_AM = new Date('2026-10-18T13:05:00Z'); // 08:05 in Chicago
const HOURS = (n: number) => new Date(EIGHT_AM.getTime() - n * 3_600_000).toISOString();
const mine = (name: string) => `bogle_users/${OWNER}/${name}`;

function reminder(id: string, message: string, extra: Doc = {}): void {
  fake.put(mine('reminders'), id, { userId: OWNER, message, scheduledFor: '2026-10-18T20:00:00.000Z', status: 'pending', ...extra }); // prettier-ignore
}

/** A follow-up for reminder `ref`, closed on a call yesterday evening. */
function closedYesterday(ref: string, text: string): void {
  fake.put(mine('follow_through'), `f-${ref}`, {
    userId: OWNER,
    kind: 'reminder',
    text,
    dueAt: null,
    zone: 'America/Chicago',
    repeat: null,
    source: { store: 'reminders', ref },
    status: 'done',
    surfaced: [],
    createdAt: HOURS(400),
    updatedAt: HOURS(14),
    closedAt: HOURS(14),
  });
}

async function brief(env: Record<string, string> = {}) {
  const sendText = vi.fn(async (_t: GuardedText): Promise<TextOutcome> => ({ sent: true }));
  const sendPush = vi.fn(async () => false);
  const deps = {
    ...(await defaultMorningBriefDeps()),
    env: { MORNING_BRIEF: 'on', MORNING_BRIEF_USERS: OWNER, ...env },
    cohortUsers: async () => [],
    userDoc: async () => ({ contactInfo: { timezone: 'America/Chicago' }, name: 'Sam Tester' }),
    claims: { claim: async () => true, release: async () => undefined },
    sendText,
    sendPush,
  };
  const { report } = await runMorningBriefs(deps, EIGHT_AM);
  return { report, sendText, sendPush, body: sendText.mock.calls[0]?.[0].body ?? null };
}

beforeEach(() => {
  fake.cols.clear();
  runLines.length = 0;
  forgotten.mockReset().mockResolvedValue([]);
  active.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());

describe('freshness gate on its real reads', () => {
  it('(b) a follow-up closed on a call yesterday keeps its reminder out of today', async () => {
    reminder('r1', 'Water the ferns');
    reminder('r2', 'Return the library books');
    closedYesterday('r1', 'Water the ferns');
    const { body } = await brief();
    expect(body).toContain('Return the library books');
    expect(body).not.toContain('Water the ferns');
    expect(runLines[0].dropped).toEqual({ 'ledger-closed': 1 });
  });

  it('(f) every item already dealt with: no text, no push, counted as all-stale', async () => {
    reminder('r1', 'Water the ferns');
    closedYesterday('r1', 'Water the ferns');
    const { report, sendText, sendPush } = await brief();
    expect(sendText).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
    expect(report.reasons).toEqual({ 'all-stale': 1 });
  });

  it('a stored safety reminder is kept whichever type field holds the safety value', async () => {
    reminder('r1', 'Water the ferns');
    reminder('r8', 'Ask how the new school is going', { category: 'minor-care' });
    reminder('r9', 'Check in with Ferni tonight', { kind: 'reminder', type: 'crisis_follow_up' });
    for (const [ref, text] of [['r1', 'Water the ferns'], ['r8', 'Ask how the new school is going'], ['r9', 'Check in with Ferni tonight']]) closedYesterday(ref, text); // prettier-ignore
    const { body } = await brief();
    expect(body).toContain('Check in with Ferni tonight');
    expect(body).toContain('Ask how the new school is going');
    expect(body).not.toContain('Water the ferns');
    expect(runLines[0].dropped).toEqual({ 'ledger-closed': 1 });
  });

  it('a reminder with an unreadable due time is left out alone: the rest of Due still goes', async () => {
    reminder('r1', 'Water the ferns');
    reminder('r3', 'Pick up the dry cleaning', { scheduledFor: 'not a date' });
    const { body } = await brief({ MORNING_BRIEF_FRESHNESS: 'off' });
    expect(body).toContain('Water the ferns');
    expect(body).not.toContain('Pick up the dry cleaning');
  });
});

describe('forget list unreadable at send time: exactly what main sends', () => {
  const COMMITMENTS = [
    { id: 'c1', data: { statement: 'I will send Priya the slides' } },
    { id: 'c2', data: { statement: 'I will mail the birthday card' } },
  ];

  it('current versions are unknown (null), not "nothing is open"', async () => {
    reminder('r1', 'Water the ferns');
    active.mockResolvedValue(COMMITMENTS);
    forgotten.mockResolvedValue(null);
    const { freshness } = await defaultMorningBriefDeps();
    const refs = [{ store: 'reminders', ref: 'r1' }, { store: 'commitments', ref: 'c1' }] as const; // prettier-ignore
    expect(await freshness?.current(OWNER, refs)).toBeNull();
    forgotten.mockResolvedValue([]);
    expect(await freshness?.current(OWNER, refs)).toEqual(
      new Map([['reminders:r1', '2026-10-18T20:00:00.000Z'], ['commitments:c1', ''], ['commitments:c2', '']]) // prettier-ignore
    );
  });

  it('read at 8:00, unreadable at send: nothing dropped, the same text as with the gate off', async () => {
    vi.stubEnv('MORNING_BRIEF_COMMITMENTS', 'on');
    reminder('r1', 'Water the ferns');
    active.mockResolvedValue(COMMITMENTS);
    const off = await brief({ MORNING_BRIEF_FRESHNESS: 'off' });
    expect(off.body).toContain('send Priya the slides');
    runLines.length = 0;
    forgotten.mockReset().mockResolvedValueOnce([]).mockResolvedValue(null);
    const on = await brief();
    expect(runLines[0].dropped).toEqual({});
    expect(on.body).toBe(off.body);
  });

  it('control: with the list readable, a commitment closed since it was read is left out', async () => {
    vi.stubEnv('MORNING_BRIEF_COMMITMENTS', 'on');
    reminder('r1', 'Water the ferns');
    active.mockResolvedValueOnce(COMMITMENTS).mockResolvedValue([COMMITMENTS[0]]);
    const { body } = await brief();
    expect(body).toContain('send Priya the slides');
    expect(body).not.toContain('mail the birthday card');
    expect(runLines[0].dropped).toEqual({ 'source-closed': 1 });
  });
});
