/**
 * Data Integrity Health Check Endpoint
 *
 * Provides comprehensive health metrics for user auth and data persistence.
 * Used to diagnose memory issues and track system health.
 *
 * @module api/health/data-integrity
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreHealthMetrics, getHealthSummary } from '../../services/observability/firestore-monitor.js';
import { getDynamicMemoryMetrics } from '../../memory/dynamic/metrics.js';

const log = createLogger({ module: 'data-integrity-health' });

// ============================================================================
// TYPES
// ============================================================================

interface DataIntegrityReport {
  timestamp: string;
  firestore: {
    available: boolean;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
    fallbackMetrics: {
      totalFallbacks: number;
      affectedServices: string[];
    };
  };
  dynamicMemory: {
    fastCaptureMetrics: {
      totalCalls: number;
      avgLatencyMs: number;
      entitiesExtracted: number;
    };
    deepExtractionMetrics: {
      totalJobs: number;
      successRate: number;
      factsExtracted: number;
    };
    stmBufferCount: number;
  };
  userDataSample?: {
    userId: string;
    hasMemories: boolean;
    hasPromotedEntities: boolean;
    hasConversations: boolean;
    hasTurns: boolean;
    memoryCount: number;
    entityCount: number;
    relationshipStage: string;
  };
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

/**
 * Run data integrity health check.
 * Can optionally check a specific user's data.
 */
export async function checkDataIntegrity(userId?: string): Promise<DataIntegrityReport> {
  const report: DataIntegrityReport = {
    timestamp: new Date().toISOString(),
    firestore: {
      available: false,
      healthStatus: 'unhealthy',
      fallbackMetrics: {
        totalFallbacks: 0,
        affectedServices: [],
      },
    },
    dynamicMemory: {
      fastCaptureMetrics: {
        totalCalls: 0,
        avgLatencyMs: 0,
        entitiesExtracted: 0,
      },
      deepExtractionMetrics: {
        totalJobs: 0,
        successRate: 0,
        factsExtracted: 0,
      },
      stmBufferCount: 0,
    },
  };

  // Check Firestore health
  const firestoreHealth = getHealthSummary();
  const firestoreMetrics = getFirestoreHealthMetrics();
  report.firestore = {
    available: firestoreHealth.status !== 'unhealthy',
    healthStatus: firestoreHealth.status,
    fallbackMetrics: {
      totalFallbacks: firestoreMetrics.totalFallbacks,
      affectedServices: firestoreMetrics.affectedServices,
    },
  };

  // Check dynamic memory metrics
  const memMetrics = getDynamicMemoryMetrics();
  const totalJobs = memMetrics.deepExtraction.totalJobsProcessed;
  const failedJobs = memMetrics.deepExtraction.totalJobsFailed;
  const successRate = totalJobs > 0 ? (totalJobs - failedJobs) / totalJobs : 1;
  report.dynamicMemory = {
    fastCaptureMetrics: {
      totalCalls: memMetrics.fastCapture.totalCalls,
      avgLatencyMs: memMetrics.fastCapture.avgLatencyMs,
      entitiesExtracted: memMetrics.fastCapture.entitiesExtracted,
    },
    deepExtractionMetrics: {
      totalJobs: totalJobs,
      successRate: successRate,
      factsExtracted: memMetrics.deepExtraction.factsExtracted,
    },
    stmBufferCount: memMetrics.stm.activeSessions,
  };

  // If userId provided, check their specific data
  if (userId) {
    try {
      const userSample = await checkUserData(userId);
      report.userDataSample = userSample;
    } catch (error) {
      log.warn({ error: String(error), userId }, 'Failed to check user data');
    }
  }

  return report;
}

/**
 * Check a specific user's data integrity.
 */
async function checkUserData(userId: string) {
  const db = getFirestoreDb();
  if (!db) {
    return {
      userId,
      hasMemories: false,
      hasPromotedEntities: false,
      hasConversations: false,
      hasTurns: false,
      memoryCount: 0,
      entityCount: 0,
      relationshipStage: 'unknown',
    };
  }

  const userRef = db.collection('bogle_users').doc(userId);

  // Check memories
  const memories = await userRef.collection('memories').limit(1).get();

  // Check promoted entities
  const entities = await userRef.collection('promoted_entities').limit(1).get();

  // Check conversations
  const convos = await userRef.collection('conversations').limit(1).get();

  // Check turns in most recent conversation
  let hasTurns = false;
  if (!convos.empty) {
    const turns = await convos.docs[0].ref.collection('turns').limit(1).get();
    hasTurns = !turns.empty;
  }

  // Check humanization
  let relationshipStage = 'unknown';
  const humanization = await userRef.collection('humanization').doc('comfort').get();
  if (humanization.exists) {
    try {
      const data = humanization.data();
      const parsed = JSON.parse(data?.data || '{}');
      relationshipStage = parsed.relationshipStage || 'unknown';
    } catch {
      // Ignore parse errors
    }
  }

  // Get counts
  const memoryCount = (await userRef.collection('memories').get()).size;
  const entityCount = (await userRef.collection('promoted_entities').get()).size;

  return {
    userId,
    hasMemories: !memories.empty,
    hasPromotedEntities: !entities.empty,
    hasConversations: !convos.empty,
    hasTurns,
    memoryCount,
    entityCount,
    relationshipStage,
  };
}

// ============================================================================
// HTTP HANDLER
// ============================================================================

/**
 * HTTP handler for /api/health/data-integrity
 */
export async function handleDataIntegrityHealth(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    // Parse query params
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const userId = url.searchParams.get('userId') || undefined;

    const report = await checkDataIntegrity(userId);

    // Determine response status
    const status = report.firestore.healthStatus === 'healthy' ? 200 : 
                   report.firestore.healthStatus === 'degraded' ? 200 : 503;

    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(report, null, 2));
  } catch (error) {
    log.error({ error: String(error) }, 'Data integrity health check failed');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Health check failed', details: String(error) }));
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  checkDataIntegrity,
  handleDataIntegrityHealth,
};
