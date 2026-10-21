import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it, vi } from 'vitest';
import { allowlisted, ponderingCohort, runPonderingJob } from '../ponder-job.js';

/** A path-keyed fake of the few Firestore calls the job makes. */
function fakeFirestore(docs: Record<string, Record<string, unknown>>) {
  const sets: Array<{ path: string; data: Record<string, unknown> }> = [];
  const reads: string[] = [];
  const doc = (path: string) => ({
    get: async () => {
      reads.push(path);
      return { exists: path in docs, data: () => docs[path] };
    },
    set: async (data: Record<string, unknown>) => {
      sets.push({ path, data });
    },
    collection: (name: string) => collection(`${path}/${name}`),
  });
  const collection = (path: string) => {
    const query = {
      select: () => query,
      orderBy: () => query,
      limit: () => query,
      get: async () => {
        reads.push(path);
        const rows = Object.entries(docs)
          .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
          .map(([k, data]) => ({ id: k.slice(path.length + 1), data: () => data }))
          .sort((a, b) => String(b.data().timestamp).localeCompare(String(a.data().timestamp)));
        return { docs: rows };
      },
    };
    return { ...query, doc: (id: string) => doc(`${path}/${id}`) };
  };
  const db = { collection: vi.fn((name: string) => collection(name)) };
  return { db: db as unknown as Firestore, sets, reads, spy: db.collection };
}

const on = { PONDERING: 'on' };
/** 2026-10-11 08:30 UTC is 04:30 in New York, inside every caller's night window. */
const night = new Date('2026-10-11T08:30:00Z');

function summary(at: string, over: Record<string, unknown> = {}) {
  return {
    timestamp: at,
    mainTopics: ['interview'],
    keyPoints: ['Seth has a Stripe interview on Thursday', 'Seth is nervous about the panel'],
    ...over,
  };
}

/** A caller with two real calls, the latest on the evening of Oct 10. */
function caller(uid: string, profile: Record<string, unknown> = {}) {
  return {
    [`bogle_users/${uid}`]: { name: uid, ...profile },
    [`bogle_users/${uid}/summaries/a`]: summary('2026-10-10T20:00:00Z'),
    [`bogle_users/${uid}/summaries/b`]: summary('2026-10-08T20:00:00Z'),
  };
}

const cohort = (members: string[], enabled = true) => ({
  'feature_cohorts/friends-and-family': { enabled, members },
});

const answer = JSON.stringify({
  followUps: [{ text: 'Is the Stripe interview still on for Thursday?', basis: 'a' }],
  thinkingOf: [],
});

describe('ponderingCohort', () => {
  it('is the enabled cohort plus PONDERING_USERS, and nothing else', async () => {
    const { db } = fakeFirestore({ ...cohort(['f1', 'f2']) });
    expect(await ponderingCohort(db, { PONDERING_USERS: 'p1, f1 bad/id' })).toEqual([
      'p1',
      'f1',
      'f2',
    ]);
  });

  it('drops a disabled cohort', async () => {
    const { db } = fakeFirestore({ ...cohort(['f1'], false) });
    expect(await ponderingCohort(db, { PONDERING_USERS: 'p1' })).toEqual(['p1']);
  });

  it('reads no uid from an empty allowlist', () => {
    expect(allowlisted({})).toEqual([]);
  });
});

describe('runPonderingJob', () => {
  it('reads and writes nothing when PONDERING is off', async () => {
    const { db, sets, spy } = fakeFirestore({ ...cohort(['u1']), ...caller('u1') });
    const llm = vi.fn();
    const out = await runPonderingJob(db, llm, { now: night, env: {} });
    expect(out.status).toBe('off');
    expect(spy).not.toHaveBeenCalled();
    expect(llm).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
  });

  it('with PONDERING off on the server, ponders only those whose own cohort flags turn it on', async () => {
    const { db, sets, reads } = fakeFirestore({
      ...cohort(['mom']),
      ...caller('seth'),
      ...caller('mom'),
    });
    const llm = vi.fn().mockResolvedValue(answer);
    const out = await runPonderingJob(db, llm, {
      now: night,
      env: {},
      holders: async () => ['seth'],
    });
    expect(out).toMatchObject({ status: 'ran', cohort: 1, due: 1, stored: 1 });
    expect(sets.map((x) => x.path)).toEqual(['bogle_users/seth/predictive_intelligence/pondering']);
    // friends-and-family is the server's own audience: not read while the server's flag is off.
    expect(reads.some((p) => p.includes('mom') || p.includes('feature_cohorts'))).toBe(false);
  });

  it('adds the flag holders to the cohort when the server has PONDERING on', async () => {
    const { db } = fakeFirestore({ ...cohort(['mom']), ...caller('seth'), ...caller('mom') });
    const llm = vi.fn().mockResolvedValue(answer);
    const out = await runPonderingJob(db, llm, {
      now: night,
      env: on,
      holders: async () => ['seth'],
    });
    expect(out).toMatchObject({ status: 'ran', cohort: 2, stored: 2 });
  });

  it('ponders a due cohort member and never touches a caller outside the cohort', async () => {
    const { db, sets, reads } = fakeFirestore({
      ...cohort(['u1']),
      ...caller('u1'),
      ...caller('stranger'),
    });
    const llm = vi.fn().mockResolvedValue(answer);
    const out = await runPonderingJob(db, llm, { now: night, env: on });
    expect(out).toMatchObject({ status: 'ran', cohort: 1, due: 1, stored: 1 });
    expect(reads.some((p) => p.includes('stranger'))).toBe(false);
    expect(sets).toHaveLength(1);
    expect(sets[0]?.path).toBe('bogle_users/u1/predictive_intelligence/pondering');
    expect(sets[0]?.data.followUps).toEqual([
      { text: 'Is the Stripe interview still on for Thursday?', basis: 'a' },
    ]);
  });

  it('skips an erased caller still listed in the cohort: no model call, no write', async () => {
    const { db, sets } = fakeFirestore({
      ...cohort(['gone']),
      // Only stray summaries left, no profile document: what an erased record looks like mid-delete.
      'bogle_users/gone/summaries/a': summary('2026-10-10T20:00:00Z'),
    });
    const llm = vi.fn();
    const out = await runPonderingJob(db, llm, { now: night, env: on });
    expect(out.skipped['no-record']).toBe(1);
    expect(llm).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
  });

  it('skips callers who turned proactive check-ins off or have not called in 14 days', async () => {
    const { db, sets } = fakeFirestore({
      ...cohort(['quiet', 'old']),
      ...caller('quiet', { preferences: { wantsProactiveAdvice: false } }),
      'bogle_users/old': {},
      'bogle_users/old/summaries/a': summary('2026-09-20T20:00:00Z'),
      'bogle_users/old/summaries/b': summary('2026-09-18T20:00:00Z'),
    });
    const llm = vi.fn();
    const out = await runPonderingJob(db, llm, { now: night, env: on });
    expect(out.skipped).toEqual({ 'no-record': 0, 'opted-out': 1, inactive: 1 });
    expect(llm).not.toHaveBeenCalled();
    expect(sets).toEqual([]);
  });

  it('waits for the night slot, and does not ponder twice without a new call', async () => {
    const evening = new Date('2026-10-10T23:00:00Z'); // 19:00 New York, three hours after the call
    const early = fakeFirestore({ ...cohort(['u1']), ...caller('u1') });
    const llm = vi.fn().mockResolvedValue(answer);
    expect((await runPonderingJob(early.db, llm, { now: evening, env: on })).due).toBe(0);

    const done = fakeFirestore({
      ...cohort(['u1']),
      ...caller('u1'),
      'bogle_users/u1/predictive_intelligence/pondering': { ponderedAt: '2026-10-11T07:00:00Z' },
    });
    expect((await runPonderingJob(done.db, llm, { now: night, env: on })).due).toBe(0);
    expect(llm).not.toHaveBeenCalled();
  });

  it('keeps forgotten and avoided topics away from the model', async () => {
    const { db } = fakeFirestore({
      ...cohort(['u1']),
      ...caller('u1', { preferences: { topicsToAvoid: ['divorce'] } }),
      'bogle_users/u1/summaries/a': summary('2026-10-10T20:00:00Z', {
        keyPoints: [
          'Seth has a Stripe interview on Thursday',
          'Seth is nervous about the panel',
          'Seth talked about his divorce lawyer',
          "Seth's sister Amy is moving to Boise",
        ],
      }),
      'bogle_users/u1/memory_state/forgotten': { topics: ['sister amy'] },
    });
    const llm = vi.fn().mockResolvedValue(answer);
    await runPonderingJob(db, llm, { now: night, env: on });
    const prompt = String(llm.mock.calls[0]?.[0]);
    expect(prompt).toContain('Stripe interview');
    expect(prompt).not.toContain('divorce');
    expect(prompt).not.toContain('Boise');
  });

  it('writes nothing in a dry run', async () => {
    const { db, sets } = fakeFirestore({ ...cohort(['u1']), ...caller('u1') });
    const out = await runPonderingJob(db, vi.fn().mockResolvedValue(answer), {
      now: night,
      env: on,
      dryRun: true,
    });
    expect(out.results[0]?.status).toBe('dry-run');
    expect(out.results[0]?.pondering?.followUps).toHaveLength(1);
    expect(sets).toEqual([]);
  });

  it('bounds a hung model call and records the pass so it is not retried every poll', async () => {
    const { db, sets } = fakeFirestore({ ...cohort(['u1']), ...caller('u1') });
    const hung = vi.fn(
      () =>
        new Promise<string | null>(() => {
          /* never settles */
        })
    );
    const out = await runPonderingJob(db, hung, { now: night, env: on, perUserTimeoutMs: 5 });
    expect(out.nothing).toBe(1);
    expect(sets).toEqual([
      {
        path: 'bogle_users/u1/predictive_intelligence/pondering',
        data: { ponderedAt: night.toISOString() },
      },
    ]);
  });
});
