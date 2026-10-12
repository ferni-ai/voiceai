/**
 * The graph sync's fact queue, made safe for forgetting
 * (firestore-spanner-sync.ts runs it each cycle).
 *
 * - A fact marked forgottenAt is never copied; its existing copy (row and
 *   semantic-index entry) is removed, and only then is it marked synced, so
 *   the oldest-first cursor moves past it.
 * - A fact is marked synced in a transaction that re-reads it: if it was
 *   forgotten between the read and the write, the mark is refused and the
 *   copy just written is removed. forget.ts also resets syncedToSpanner,
 *   which queues the removal for a copy made earlier.
 * - A removal or a copy that fails never counts as done. The fact moves to
 *   its own retry queue (syncedToSpanner 'retry', backoff from 1 min,
 *   doubling to a day), so failing facts can't hold up the facts behind
 *   them in the main queue.
 *
 * The Firestore and graph-store side (FactSyncOps) is
 * spanner-graph/fact-sync-ops.ts.
 *
 * @module memory/dynamic/spanner-sync-forget
 */
import { createLogger } from '../../utils/safe-logger.js';
import type { SyncableFact } from './firestore-spanner-sync.js';

const log = createLogger({ module: 'spanner-sync-forget' });

export interface FactDoc {
  id: string;
  path: string;
  data: Record<string, unknown>;
}

export interface FactSyncOps {
  insert: (fact: SyncableFact) => Promise<boolean>;
  /** Removes a forgotten fact's copy from the graph (and the index it feeds); throws on failure. */
  remove: (userId: string, factId: string) => Promise<void>;
  /**
   * Marks the doc synced, in one transaction with a re-read: with onlyIfLive
   * it refuses (false) when the fact was forgotten since it was read.
   */
  markSynced: (userId: string, docId: string, opts: { onlyIfLive: boolean }) => Promise<boolean>;
  /** Moves a fact whose copy or removal failed to the retry queue, with backoff. */
  deferRetry: (userId: string, docId: string, attempts: number) => Promise<void>;
}

/** Failed removals since start, retried each cycle (a visible error count). */
export const factSyncForgetStats = { deleteFailures: 0, insertFailures: 0 };

const RETRY_BASE_MS = 60_000;
const RETRY_MAX_MS = 24 * 3_600_000;

/** When a failed fact may be tried again: 1 min, 2, 4, ... at most a day. */
export function retryAfter(attempts: number, now: number): string {
  return new Date(
    now + Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1))
  ).toISOString();
}

/** A deferred fact whose retry time has come. */
export function retryDue(data: Record<string, unknown>, now: number): boolean {
  const at = Date.parse(String(data.syncRetryAfter ?? ''));
  return !Number.isFinite(at) || at <= now;
}

/**
 * A dynamic_facts doc as a fact to copy to the graph, or null for one the
 * caller asked to forget: a copy would carry no mark, so it is never copied.
 */
export function syncableFact(
  id: string,
  path: string,
  data: Record<string, unknown>
): SyncableFact | null {
  if (data.forgottenAt !== undefined && data.forgottenAt !== null) return null;
  return {
    id,
    userId: path.split('/')[1] ?? '',
    entityName: String(data.entityName || ''),
    factType: String(data.factType || 'attribute'),
    key: String(data.key || ''),
    value: String(data.value || ''),
    confidence: Number(data.confidence || 0.5),
    extractedAt: data.extractedAt as SyncableFact['extractedAt'],
  };
}

/** Copies live facts and removes forgotten ones; see the module comment. */
export async function syncFactDocs(
  docs: readonly FactDoc[],
  ops: FactSyncOps
): Promise<{
  synced: number;
  removed: number;
  failed: number;
  deleteFailures: number;
}> {
  const out = { synced: 0, removed: 0, failed: 0, deleteFailures: 0 };
  const defer = async (userId: string, docId: string, data: Record<string, unknown>) =>
    ops.deferRetry(userId, docId, Number(data.syncRetryCount ?? 0) + 1);
  const removeCopy = async (userId: string, docId: string, data: Record<string, unknown>) => {
    try {
      await ops.remove(userId, `fact_${userId}_${docId}`);
    } catch (error) {
      // Never reported as removed: retried later, out of the main queue.
      out.deleteFailures++;
      factSyncForgetStats.deleteFailures++;
      log.error({ error: String(error), factId: docId }, 'Forgotten fact copy not removed');
      await defer(userId, docId, data);
      return;
    }
    out.removed++;
    await ops.markSynced(userId, docId, { onlyIfLive: false });
  };
  for (const doc of docs) {
    const fact = syncableFact(doc.id, doc.path, doc.data);
    const userId = doc.path.split('/')[1] ?? '';
    try {
      if (!fact) {
        await removeCopy(userId, doc.id, doc.data);
        continue;
      }
      if (!(await ops.insert(fact))) {
        // Out of the main queue too, so a fact that always fails can't block it.
        out.failed++;
        factSyncForgetStats.insertFailures++;
        await defer(userId, doc.id, doc.data);
        continue;
      }
      // Forgotten between the read and the write: take the copy back out.
      if (await ops.markSynced(userId, doc.id, { onlyIfLive: true })) out.synced++;
      else await removeCopy(userId, doc.id, doc.data);
    } catch (error) {
      out.failed++;
      log.warn({ error: String(error), factId: doc.id }, 'Fact not synced');
    }
  }
  return out;
}
