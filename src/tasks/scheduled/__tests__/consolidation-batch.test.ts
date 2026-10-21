/**
 * The weekly memory consolidation must answer before its socket times out
 * (2026-10-11: 3 of 3 attempts cut at the old 30.0 s, Cloud Run 503). Job
 * routes now get JOB_SOCKET_TIMEOUT_MS. These tests pin the time budget and
 * the resume.
 */

import { describe, expect, it, vi } from 'vitest';
import type { ConsolidationResult, MemoryItem } from '../../../memory/index.js';
import { JOB_SOCKET_TIMEOUT_MS } from '../../../api/scheduled-jobs/job-run-guard.js';
import type { JobContext } from '../base-job.js';
import {
  CONSOLIDATION_TIME_BUDGET_MS,
  runConsolidationBatch,
  type ActiveUser,
  type ConsolidationBatchDeps,
  type UserCursor,
} from '../consolidation-batch.js';

const PER_USER_MS = 6_000; // inside the 3 to 10 s per user seen in prod logs

function makeCtx(): JobContext {
  const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    startedAt: new Date(0),
    log: log as unknown as JobContext['log'],
    isDryRun: false,
    counters: { processed: 0, success: 0, skipped: 0, errors: 0 },
  };
}

function makeUsers(n: number): ActiveUser[] {
  return Array.from({ length: n }, (_, i) => ({
    userId: `user-${String(i).padStart(2, '0')}`,
    lastContact: `2026-10-${String(1 + i).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

/** A fake world where every consolidation pass advances the clock. */
function makeDeps(all: ActiveUser[], initialCursor: UserCursor | null = null) {
  let clock = 0;
  let saved: UserCursor | null = initialCursor;
  const consolidatedUsers: string[] = [];
  const memories = Array.from({ length: 25 }, (_, i): MemoryItem => ({
    id: `m${i}`,
    type: 'moment',
    content: `memory ${i}`,
    timestamp: new Date(0),
    emotionalWeight: 0.5,
    relevanceDecay: 0,
    source: { collection: 'dynamic_facts', documentId: `m${i}` },
    baseImportance: 0.5,
  }));
  let current = '';

  const deps: ConsolidationBatchDeps = {
    now: () => clock,
    listUsers: vi.fn(async (limit: number, after: UserCursor | null) => {
      const start = after ? all.findIndex((u) => u.userId === after.userId) + 1 : 0;
      return all.slice(start, start + limit);
    }),
    loadMemories: vi.fn(async (userId: string) => {
      current = userId;
      return memories;
    }),
    consolidate: vi.fn(async (batch: MemoryItem[]): Promise<ConsolidationResult> => {
      clock += PER_USER_MS;
      consolidatedUsers.push(current);
      return { consolidated: [], memoriesProcessed: batch.length, groupsFound: 0, durationMs: 0 };
    }),
    cursor: {
      load: vi.fn(async () => saved),
      save: vi.fn(async (c: UserCursor | null) => {
        saved = c;
      }),
    },
  };
  return { deps, consolidatedUsers, getClock: () => clock, getSaved: () => saved };
}

// A short budget keeps the resume tests small; the default is pinned below.
const OPTIONS = {
  minMemoriesForConsolidation: 20,
  maxMemoriesToProcess: 100,
  maxUsersPerRun: 50,
  budgetMs: 15_000,
};

describe('runConsolidationBatch time budget', () => {
  it('keeps its budget plus one slow user under the job socket timeout', () => {
    expect(CONSOLIDATION_TIME_BUDGET_MS + 10_000).toBeLessThanOrEqual(JOB_SOCKET_TIMEOUT_MS);
  });

  it('reaches most of a 50-user pass in one run on the default budget', async () => {
    const { deps, consolidatedUsers, getClock } = makeDeps(makeUsers(50));

    const result = await runConsolidationBatch(
      { ...OPTIONS, budgetMs: undefined },
      deps,
      makeCtx()
    );

    // 6 s a user: users start at 0, 6, ..., 234 s; at 240 s the budget is spent.
    expect(consolidatedUsers).toHaveLength(40);
    expect(result.budgetExhausted).toBe(true);
    expect(getClock()).toBeLessThan(JOB_SOCKET_TIMEOUT_MS);
  });

  it('stops starting users once the budget is spent and returns within one more user', async () => {
    const { deps, consolidatedUsers, getClock } = makeDeps(makeUsers(50));

    const result = await runConsolidationBatch(OPTIONS, deps, makeCtx());

    // Users start at 0, 6 and 12 s; at 18 s the 15 s budget is spent.
    expect(consolidatedUsers).toEqual(['user-00', 'user-01', 'user-02']);
    expect(result.usersVisited).toBe(3);
    expect(result.budgetExhausted).toBe(true);
    expect(result.passComplete).toBe(false);
    expect(getClock()).toBeLessThan(15_000 + 10_000);
  });

  it('saves a cursor at the last finished user and the next run resumes after it', async () => {
    const users = makeUsers(50);
    const first = makeDeps(users);
    await runConsolidationBatch(OPTIONS, first.deps, makeCtx());
    expect(first.getSaved()).toEqual({ userId: 'user-02', lastContact: users[2].lastContact });

    const second = makeDeps(users, first.getSaved());
    await runConsolidationBatch(OPTIONS, second.deps, makeCtx());

    expect(second.deps.listUsers).toHaveBeenCalledWith(50, first.getSaved());
    expect(second.consolidatedUsers).toEqual(['user-03', 'user-04', 'user-05']);
  });

  it('resets the cursor when the scan reaches the last active user', async () => {
    const users = makeUsers(5);
    const run = makeDeps(users, { userId: 'user-02', lastContact: users[2].lastContact });

    const result = await runConsolidationBatch(OPTIONS, run.deps, makeCtx());

    expect(run.consolidatedUsers).toEqual(['user-03', 'user-04']);
    expect(result.passComplete).toBe(true);
    expect(run.deps.cursor.save).toHaveBeenCalledWith(null);
  });

  it('does not move the cursor on a dry run', async () => {
    const run = makeDeps(makeUsers(50));

    await runConsolidationBatch({ ...OPTIONS, dryRun: true }, run.deps, makeCtx());

    expect(run.deps.cursor.save).not.toHaveBeenCalled();
    expect(run.deps.consolidate).not.toHaveBeenCalled();
  });

  it('still runs from the start when the cursor cannot be loaded', async () => {
    const run = makeDeps(makeUsers(50));
    run.deps.cursor.load = vi.fn(async () => {
      throw new Error('firestore unavailable');
    });
    const ctx = makeCtx();

    await runConsolidationBatch(OPTIONS, run.deps, ctx);

    expect(run.deps.listUsers).toHaveBeenCalledWith(50, null);
    expect(run.consolidatedUsers[0]).toBe('user-00');
    expect(ctx.log.warn).toHaveBeenCalled();
  });
});
