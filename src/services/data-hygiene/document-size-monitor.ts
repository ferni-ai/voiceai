/**
 * Document Size Monitor
 *
 * Monitors Firestore document sizes to detect collections approaching
 * the 1MB limit. Generates alerts for proactive intervention.
 *
 * Thresholds:
 * - Warning: 500KB (50% of limit)
 * - Critical: 900KB (90% of limit)
 *
 * @module services/data-hygiene/document-size-monitor
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'document-size-monitor' });

// ============================================================================
// TYPES
// ============================================================================

interface SizeAlert {
  userId: string;
  collection: string;
  documentId: string;
  sizeBytes: number;
  threshold: 'warning' | 'critical';
  timestamp: Date;
}

interface CollectionStats {
  collection: string;
  documentCount: number;
  totalSizeBytes: number;
  avgSizeBytes: number;
  maxSizeBytes: number;
  documentsOverWarning: number;
  documentsOverCritical: number;
}

interface MonitorResult {
  success: boolean;
  alerts: SizeAlert[];
  collectionStats: CollectionStats[];
  sampleSize: number;
  durationMs: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const THRESHOLDS = {
  WARNING_BYTES: 500_000, // 500KB
  CRITICAL_BYTES: 900_000, // 900KB
  FIRESTORE_LIMIT_BYTES: 1_048_576, // 1MB
};

const MONITORED_COLLECTIONS = [
  'summaries',
  'communication_preferences',
  'superhuman_cache',
  'associative_memory',
  'behavioral_patterns',
  'emotional_threads',
  'ceo_wins',
  'ceo_energy',
  'ceo_decisions',
  'ceo_priorities',
  'ceo_blockers',
];

const SAMPLE_SIZE = 50; // Number of users to sample

// ============================================================================
// SIZE ESTIMATION
// ============================================================================

/**
 * Estimate the size of a document in bytes.
 * Uses JSON serialization as a reasonable approximation.
 */
function estimateDocumentSize(data: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(data)).length;
  } catch {
    return 0;
  }
}

// ============================================================================
// MONITORING FUNCTIONS
// ============================================================================

/**
 * Check document sizes for a single user's subcollection.
 */
async function checkUserCollection(
  db: FirebaseFirestore.Firestore,
  userId: string,
  collection: string
): Promise<{ alerts: SizeAlert[]; stats: Partial<CollectionStats> }> {
  const alerts: SizeAlert[] = [];
  let totalSize = 0;
  let maxSize = 0;
  let docCount = 0;
  let overWarning = 0;
  let overCritical = 0;

  try {
    const collectionRef = db.collection(`bogle_users/${userId}/${collection}`);
    const snapshot = await collectionRef.limit(100).get();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const size = estimateDocumentSize(data);

      docCount++;
      totalSize += size;
      if (size > maxSize) maxSize = size;

      if (size >= THRESHOLDS.CRITICAL_BYTES) {
        overCritical++;
        alerts.push({
          userId,
          collection,
          documentId: doc.id,
          sizeBytes: size,
          threshold: 'critical',
          timestamp: new Date(),
        });
      } else if (size >= THRESHOLDS.WARNING_BYTES) {
        overWarning++;
        alerts.push({
          userId,
          collection,
          documentId: doc.id,
          sizeBytes: size,
          threshold: 'warning',
          timestamp: new Date(),
        });
      }
    }
  } catch (error) {
    log.debug({ error: String(error), userId, collection }, 'Error checking collection');
  }

  return {
    alerts,
    stats: {
      documentCount: docCount,
      totalSizeBytes: totalSize,
      maxSizeBytes: maxSize,
      documentsOverWarning: overWarning,
      documentsOverCritical: overCritical,
    },
  };
}

/**
 * Run document size monitoring across sampled users.
 */
export async function runDocumentSizeMonitor(): Promise<MonitorResult> {
  const startTime = Date.now();
  log.info({ sampleSize: SAMPLE_SIZE }, 'Starting document size monitor');

  const allAlerts: SizeAlert[] = [];
  const collectionStatsMap = new Map<string, CollectionStats>();

  // Initialize stats for each collection
  for (const coll of MONITORED_COLLECTIONS) {
    collectionStatsMap.set(coll, {
      collection: coll,
      documentCount: 0,
      totalSizeBytes: 0,
      avgSizeBytes: 0,
      maxSizeBytes: 0,
      documentsOverWarning: 0,
      documentsOverCritical: 0,
    });
  }

  try {
    const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      log.warn('Firestore not available, skipping document size monitor');
      return {
        success: false,
        alerts: [],
        collectionStats: [],
        sampleSize: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // Get sample of users
    const usersSnapshot = await db
      .collection('bogle_users')
      .orderBy('updatedAt', 'desc')
      .limit(SAMPLE_SIZE)
      .get();

    log.debug({ userCount: usersSnapshot.size }, 'Sampled users for size check');

    // Check each user's collections
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;

      // Also check the root user document
      const rootSize = estimateDocumentSize(userDoc.data());
      if (rootSize >= THRESHOLDS.WARNING_BYTES) {
        allAlerts.push({
          userId,
          collection: 'bogle_users (root)',
          documentId: userId,
          sizeBytes: rootSize,
          threshold: rootSize >= THRESHOLDS.CRITICAL_BYTES ? 'critical' : 'warning',
          timestamp: new Date(),
        });
      }

      // Check subcollections
      for (const collection of MONITORED_COLLECTIONS) {
        const { alerts, stats } = await checkUserCollection(db, userId, collection);

        allAlerts.push(...alerts);

        // Aggregate stats
        const existing = collectionStatsMap.get(collection)!;
        existing.documentCount += stats.documentCount || 0;
        existing.totalSizeBytes += stats.totalSizeBytes || 0;
        if ((stats.maxSizeBytes || 0) > existing.maxSizeBytes) {
          existing.maxSizeBytes = stats.maxSizeBytes || 0;
        }
        existing.documentsOverWarning += stats.documentsOverWarning || 0;
        existing.documentsOverCritical += stats.documentsOverCritical || 0;
      }
    }

    // Calculate averages
    for (const stats of collectionStatsMap.values()) {
      if (stats.documentCount > 0) {
        stats.avgSizeBytes = Math.round(stats.totalSizeBytes / stats.documentCount);
      }
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Document size monitor failed');
    return {
      success: false,
      alerts: allAlerts,
      collectionStats: Array.from(collectionStatsMap.values()),
      sampleSize: SAMPLE_SIZE,
      durationMs: Date.now() - startTime,
    };
  }

  const result: MonitorResult = {
    success: true,
    alerts: allAlerts,
    collectionStats: Array.from(collectionStatsMap.values()),
    sampleSize: SAMPLE_SIZE,
    durationMs: Date.now() - startTime,
  };

  // Log summary
  if (allAlerts.length > 0) {
    const criticalCount = allAlerts.filter((a) => a.threshold === 'critical').length;
    const warningCount = allAlerts.filter((a) => a.threshold === 'warning').length;

    log.warn(
      {
        totalAlerts: allAlerts.length,
        criticalCount,
        warningCount,
        durationMs: result.durationMs,
      },
      'Document size alerts detected'
    );

    // Log critical alerts individually
    for (const alert of allAlerts.filter((a) => a.threshold === 'critical')) {
      log.error(
        {
          userId: alert.userId,
          collection: alert.collection,
          documentId: alert.documentId,
          sizeKB: Math.round(alert.sizeBytes / 1024),
        },
        'CRITICAL: Document approaching 1MB limit'
      );
    }
  } else {
    log.info(
      {
        durationMs: result.durationMs,
        sampledUsers: SAMPLE_SIZE,
        collectionsChecked: MONITORED_COLLECTIONS.length,
      },
      'Document size monitor completed - no alerts'
    );
  }

  return result;
}

// ============================================================================
// HEALTH METRICS
// ============================================================================

/**
 * Get document size health metrics for observability.
 */
export async function getDocumentSizeMetrics(): Promise<{
  healthy: boolean;
  criticalDocuments: number;
  warningDocuments: number;
  largestCollections: Array<{ collection: string; avgSizeKB: number }>;
  lastCheckAt: Date | null;
}> {
  // This would typically read from cached results of the monitor
  // For now, run a quick check
  const result = await runDocumentSizeMonitor();

  return {
    healthy: result.alerts.filter((a) => a.threshold === 'critical').length === 0,
    criticalDocuments: result.alerts.filter((a) => a.threshold === 'critical').length,
    warningDocuments: result.alerts.filter((a) => a.threshold === 'warning').length,
    largestCollections: result.collectionStats
      .filter((s) => s.avgSizeBytes > 0)
      .sort((a, b) => b.avgSizeBytes - a.avgSizeBytes)
      .slice(0, 5)
      .map((s) => ({
        collection: s.collection,
        avgSizeKB: Math.round(s.avgSizeBytes / 1024),
      })),
    lastCheckAt: new Date(),
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { THRESHOLDS, MONITORED_COLLECTIONS };

export default {
  runDocumentSizeMonitor,
  getDocumentSizeMetrics,
  estimateDocumentSize,
  THRESHOLDS,
};
