/**
 * Spanner Graph - privacy deletion
 *
 * Removes a user's graph records (user deletion / forget).
 * Re-exported from client.ts.
 *
 * @module memory/spanner-graph/graph-deletion
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  getDatabase,
  initializeSpanner,
  isSpannerConfigured,
  isSpannerReady,
} from './connection.js';

const log = createLogger({ module: 'SpannerGraphClient' });

/** What to remove from the graph for one user. Omit both lists to remove everything. */
export interface GraphDeletionScope {
  factIds?: readonly string[];
  entityIds?: readonly string[];
}

/**
 * Remove a user's graph records (user deletion / forget). No-op returning 0
 * when Spanner isn't configured or reachable. IDs are Spanner IDs
 * (`fact_{uid}_{docId}`, `entity_{uid}_{docId}`).
 */
export async function deleteUserGraphRecords(
  userId: string,
  scope: GraphDeletionScope = {}
): Promise<number> {
  if (!isSpannerConfigured()) return 0;
  if (!isSpannerReady() && !(await initializeSpanner())) return 0;

  const wipeAll = !scope.factIds && !scope.entityIds;
  const statements: Array<{ sql: string; params: Record<string, unknown> }> = [];

  if (wipeAll) {
    for (const table of [
      'entity_facts',
      'relationships',
      'facts',
      'entities',
      'memory_threads',
      'memory_anchors',
    ]) {
      statements.push({ sql: `DELETE FROM ${table} WHERE user_id = @userId`, params: { userId } });
    }
  }
  if (scope.factIds && scope.factIds.length > 0) {
    const params = { userId, ids: [...scope.factIds] };
    statements.push(
      {
        sql: 'DELETE FROM entity_facts WHERE user_id = @userId AND fact_id IN UNNEST(@ids)',
        params,
      },
      { sql: 'DELETE FROM facts WHERE user_id = @userId AND fact_id IN UNNEST(@ids)', params }
    );
  }
  if (scope.entityIds && scope.entityIds.length > 0) {
    const params = { userId, ids: [...scope.entityIds] };
    statements.push(
      {
        sql: 'DELETE FROM entity_facts WHERE user_id = @userId AND entity_id IN UNNEST(@ids)',
        params,
      },
      {
        sql: `DELETE FROM relationships WHERE user_id = @userId
              AND (source_entity_id IN UNNEST(@ids) OR target_entity_id IN UNNEST(@ids))`,
        params,
      },
      { sql: 'DELETE FROM entities WHERE user_id = @userId AND entity_id IN UNNEST(@ids)', params }
    );
  }
  if (statements.length === 0) return 0;

  let removed = 0;
  await getDatabase().runTransactionAsync(async (transaction) => {
    for (const statement of statements) {
      const [count] = await transaction.runUpdate(statement);
      removed += Number(count) || 0;
    }
    await transaction.commit();
  });
  log.info({ removed, wipeAll }, 'Removed graph records for user');
  return removed;
}
