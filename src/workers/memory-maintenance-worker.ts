/**
 * Memory Maintenance Worker
 *
 * Runs daily to maintain memory health across all active users:
 * - Consolidate related memories
 * - Apply time-based decay
 * - Prune weak graph links
 *
 * Deployed via Cloud Scheduler to trigger every day at 3 AM.
 *
 * Deployment:
 *   gcloud functions deploy memoryMaintenanceWorker \
 *     --gen2 --runtime=nodejs20 \
 *     --trigger-topic=memory-maintenance-trigger \
 *     --entry-point memoryMaintenanceWorker \
 *     --timeout=540s --memory=1GB --region=us-central1
 *
 *   gcloud scheduler jobs create pubsub memory-maintenance \
 *     --schedule="0 3 * * *" \
 *     --topic=memory-maintenance-trigger \
 *     --message-body="{}" \
 *     --time-zone="America/New_York" \
 *     --location=us-central1
 *
 * @module workers/memory-maintenance-worker
 */

import { createLogger } from '../utils/safe-logger.js';
import { getFirestoreDb } from '../utils/firestore-utils.js';
import { runMemoryMaintenance, type MaintenanceResult } from '../memory/memory-lifecycle.js';

const log = createLogger({ module: 'MemoryMaintenanceWorker' });

// ============================================================================
// TYPES
// ============================================================================

interface WorkerResult {
  usersProcessed: number;
  totalConsolidated: number;
  totalDecayed: number;
  totalArchived: number;
  totalGraphPruned: number;
  errors: number;
  durationMs: number;
}

// ============================================================================
// WORKER
// ============================================================================

/**
 * Get active users (users with sessions in the last 30 days)
 */
async function getActiveUsers(): Promise<string[]> {
  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Query users with recent sessions
    const snapshot = await db
      .collection('bogle_users')
      .where('lastSessionAt', '>=', thirtyDaysAgo)
      .select() // Only get IDs
      .limit(1000) // Process in batches
      .get();

    return snapshot.docs.map((doc) => doc.id);
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get active users');
    return [];
  }
}

/**
 * Run memory maintenance for all active users
 */
export async function runMemoryMaintenanceWorker(): Promise<WorkerResult> {
  const startTime = Date.now();

  log.info('🧠 Starting memory maintenance worker');

  const result: WorkerResult = {
    usersProcessed: 0,
    totalConsolidated: 0,
    totalDecayed: 0,
    totalArchived: 0,
    totalGraphPruned: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    const users = await getActiveUsers();
    log.info({ userCount: users.length }, 'Found active users for maintenance');

    // Process users in batches of 10 (parallel)
    const batchSize = 10;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const batchResults = await Promise.allSettled(
        batch.map((userId) => runMemoryMaintenance(userId))
      );

      for (const batchResult of batchResults) {
        result.usersProcessed++;

        if (batchResult.status === 'fulfilled') {
          const maintenance: MaintenanceResult = batchResult.value;
          result.totalConsolidated += maintenance.consolidation.consolidated;
          result.totalDecayed += maintenance.decay.decayed;
          result.totalArchived += maintenance.decay.archived;
          result.totalGraphPruned += maintenance.graphPruned;
        } else {
          result.errors++;
          log.warn({ error: String(batchResult.reason) }, 'User maintenance failed');
        }
      }

      // Brief pause between batches to avoid overwhelming Firestore
      if (i + batchSize < users.length) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 1000);
        });
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Memory maintenance worker failed');
    result.errors++;
  }

  result.durationMs = Date.now() - startTime;

  log.info(
    {
      ...result,
      durationMinutes: (result.durationMs / 60000).toFixed(1),
    },
    '🧠 Memory maintenance worker completed'
  );

  return result;
}

// ============================================================================
// CLOUD FUNCTION ENTRY POINT
// ============================================================================

/**
 * Cloud Function entry point
 * Triggered by Cloud Scheduler via Pub/Sub
 */
export async function memoryMaintenanceWorker(): Promise<void> {
  try {
    const result = await runMemoryMaintenanceWorker();

    // Log summary for Cloud Monitoring
    console.log(
      JSON.stringify({
        severity: 'INFO',
        message: 'Memory maintenance completed',
        ...result,
      })
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        severity: 'ERROR',
        message: 'Memory maintenance failed',
        error: String(error),
      })
    );
    throw error;
  }
}

// ============================================================================
// CLI ENTRY POINT (for testing)
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  runMemoryMaintenanceWorker()
    .then((result) => {
      console.log('Memory maintenance completed:', result);
      process.exit(0);
    })
    .catch((error) => {
      console.error('Memory maintenance failed:', error);
      process.exit(1);
    });
}

export default {
  runMemoryMaintenanceWorker,
  memoryMaintenanceWorker,
};
