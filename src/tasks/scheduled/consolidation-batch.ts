/**
 * Time-budgeted, resumable batches for the weekly memory consolidation job.
 *
 * Why this exists: the UI server kills any socket that is idle for 30 s
 * (`DDOS_CONFIG.socketTimeout`, applied by `hardenServer`). The consolidation
 * job used to walk up to 50 users (3 to 10 s each) before writing a response,
 * so on 2026-10-11 every attempt was cut off at 30.0 s and Cloud Run returned
 * 503. Now a run stops starting new users once its time budget is spent,
 * returns, and saves a cursor so the next run carries on from that user.
 * Job routes now lift that timeout for the run (api/scheduled-jobs/job-run-guard),
 * so the budget is sized against Cloud Run's 300 s request timeout instead.
 *
 * @module tasks/scheduled/consolidation-batch
 */

import type { ConsolidationResult, MemoryItem } from '../../memory/index.js';
import type { DocumentReference } from 'firebase-admin/firestore';
import type { JobContext } from './base-job.js';

/**
 * Stop starting new users after this long. It sits well under the job socket
 * timeout (290 s) so the user already in flight (up to ~10 s observed) can
 * finish and the response still goes out in time. At 15 s, sized for the old
 * 30 s cut-off, a weekly run reached 2 to 4 users.
 */
export const CONSOLIDATION_TIME_BUDGET_MS = 240_000;

const CURSOR_COLLECTION = 'scheduled_job_cursors';
const CURSOR_DOC = 'memory-consolidation';

/** Position in the active-user scan, ordered by (lastContact, userId). */
export interface UserCursor {
  lastContact: string;
  userId: string;
}

export interface ActiveUser {
  userId: string;
  lastContact: string;
}

export interface CursorStore {
  load: () => Promise<UserCursor | null>;
  save: (cursor: UserCursor | null) => Promise<void>;
}

export interface ConsolidationBatchDeps {
  listUsers: (limit: number, after: UserCursor | null) => Promise<ActiveUser[]>;
  loadMemories: (userId: string) => Promise<MemoryItem[]>;
  consolidate: (memories: MemoryItem[]) => Promise<ConsolidationResult>;
  cursor: CursorStore;
  now?: () => number;
}

export interface ConsolidationBatchOptions {
  dryRun?: boolean;
  minMemoriesForConsolidation: number;
  maxMemoriesToProcess: number;
  maxUsersPerRun: number;
  budgetMs?: number;
}

export interface ConsolidationBatchResult {
  memoriesAnalyzed: number;
  groupsConsolidated: number;
  memoriesCompressed: number;
  usersProcessed: number;
  usersVisited: number;
  /** True when the run stopped early because its time budget was spent. */
  budgetExhausted: boolean;
  /** True when the scan reached the last active user; the cursor is reset. */
  passComplete: boolean;
}

/**
 * Consolidate one batch of users, starting after the saved cursor and
 * stopping once `budgetMs` has elapsed.
 */
export async function runConsolidationBatch(
  options: ConsolidationBatchOptions,
  deps: ConsolidationBatchDeps,
  ctx: JobContext
): Promise<ConsolidationBatchResult> {
  const now = deps.now ?? Date.now;
  const budgetMs = options.budgetMs ?? CONSOLIDATION_TIME_BUDGET_MS;
  const startedAt = now();

  let after: UserCursor | null = null;
  try {
    after = await deps.cursor.load();
  } catch (error) {
    ctx.log.warn({ error }, 'Could not load consolidation cursor, starting from the beginning');
  }

  const users = await deps.listUsers(options.maxUsersPerRun, after);
  ctx.log.info(
    { userCount: users.length, resumed: after !== null },
    'Found users for consolidation'
  );

  const result: ConsolidationBatchResult = {
    memoriesAnalyzed: 0,
    groupsConsolidated: 0,
    memoriesCompressed: 0,
    usersProcessed: 0,
    usersVisited: 0,
    budgetExhausted: false,
    passComplete: false,
  };
  let last = after;

  for (const user of users) {
    if (now() - startedAt >= budgetMs) {
      result.budgetExhausted = true;
      break;
    }
    // eslint-disable-next-line no-await-in-loop -- one user at a time so the budget check holds
    await consolidateUser(user.userId, options, deps, ctx, result);
    result.usersVisited++;
    last = { lastContact: user.lastContact, userId: user.userId };
  }

  result.passComplete = !result.budgetExhausted && users.length < options.maxUsersPerRun;
  if (!options.dryRun) {
    try {
      await deps.cursor.save(result.passComplete ? null : last);
    } catch (error) {
      ctx.log.warn({ error }, 'Could not save consolidation cursor; next run repeats this batch');
    }
  }
  return result;
}

async function consolidateUser(
  userId: string,
  options: ConsolidationBatchOptions,
  deps: ConsolidationBatchDeps,
  ctx: JobContext,
  result: ConsolidationBatchResult
): Promise<void> {
  try {
    const memories = await deps.loadMemories(userId);
    if (memories.length < options.minMemoriesForConsolidation) {
      ctx.log.debug({ userId, memoryCount: memories.length }, 'Skipping user - too few memories');
      return;
    }

    ctx.counters.processed++;
    result.usersProcessed++;

    if (options.dryRun) {
      ctx.log.info({ userId, memoryCount: memories.length }, 'DRY RUN: Would consolidate memories');
      ctx.counters.skipped++;
      return;
    }

    const pass = await deps.consolidate(memories.slice(0, options.maxMemoriesToProcess));
    result.memoriesAnalyzed += pass.memoriesProcessed;
    result.groupsConsolidated += pass.groupsFound;
    result.memoriesCompressed += pass.consolidated.length;

    if (pass.consolidated.length > 0) {
      ctx.log.info(
        {
          userId,
          memoriesProcessed: pass.memoriesProcessed,
          consolidated: pass.consolidated.length,
        },
        'Consolidated memories for user'
      );
      ctx.counters.success++;
    }
  } catch (error) {
    ctx.counters.errors++;
    ctx.log.warn({ error, userId }, 'Failed to consolidate memories for user');
  }
}

// ============================================================================
// FIRESTORE ADAPTERS
// ============================================================================

/**
 * Users seen in the last 30 days, ordered by (lastContact, id), after `after`.
 * A user who comes back moves to the end of the order, so nobody is skipped.
 */
export async function listActiveUsersPage(
  limit: number,
  after: UserCursor | null
): Promise<ActiveUser[]> {
  const { getFirestore, FieldPath } = await import('firebase-admin/firestore');
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let query = getFirestore()
    .collection('bogle_users')
    .where('lastContact', '>=', thirtyDaysAgo.toISOString())
    .orderBy('lastContact')
    .orderBy(FieldPath.documentId());
  if (after) query = query.startAfter(after.lastContact, after.userId);

  const snapshot = await query.limit(limit).get();
  return snapshot.docs.map((doc) => {
    const lastContact: unknown = doc.get('lastContact');
    return { userId: doc.id, lastContact: typeof lastContact === 'string' ? lastContact : '' };
  });
}

/** Cursor persisted in Firestore so a new Cloud Run instance can resume. */
export function createFirestoreCursorStore(): CursorStore {
  const docRef = async (): Promise<DocumentReference> => {
    const { getFirestore } = await import('firebase-admin/firestore');
    return getFirestore().collection(CURSOR_COLLECTION).doc(CURSOR_DOC);
  };
  return {
    async load() {
      const snap = await (await docRef()).get();
      const lastContact: unknown = snap.get('lastContact');
      const userId: unknown = snap.get('userId');
      if (typeof lastContact !== 'string' || typeof userId !== 'string') return null;
      return { lastContact, userId };
    },
    async save(cursor) {
      await (
        await docRef()
      ).set({
        lastContact: cursor?.lastContact ?? null,
        userId: cursor?.userId ?? null,
        updatedAt: new Date().toISOString(),
      });
    },
  };
}
