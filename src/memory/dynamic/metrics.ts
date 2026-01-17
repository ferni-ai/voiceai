/**
 * Dynamic Memory Observability Metrics
 *
 * Tracks key performance indicators for the memory system:
 * - Fast capture latency and throughput
 * - STM buffer utilization
 * - Deep extraction queue depth and processing time
 * - Firestore write/read performance
 * - Promotion and sync success rates
 *
 * @module memory/dynamic/metrics
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'DynamicMemoryMetrics' });

// ============================================================================
// METRIC TYPES
// ============================================================================

interface FastCaptureMetrics {
  totalCalls: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  p95LatencyMs: number;
  entitiesExtracted: number;
  emotionsDetected: number;
  topicsDetected: number;
  jobsQueued: number;
  latencyBuckets: number[]; // For percentile calculation
}

interface STMMetrics {
  activeSessions: number;
  totalTurnsRecorded: number;
  totalEntitiesTracked: number;
  avgTurnsPerSession: number;
  avgEntitiesPerSession: number;
  sessionsPromoted: number;
  promotionSuccessRate: number;
}

interface DeepExtractionMetrics {
  totalJobsProcessed: number;
  totalJobsFailed: number;
  avgProcessingTimeMs: number;
  currentQueueDepth: number;
  entitiesExtracted: number;
  factsExtracted: number;
  relationshipsExtracted: number;
}

interface FirestoreMetrics {
  totalWrites: number;
  totalReads: number;
  writeSuccessRate: number;
  avgWriteLatencyMs: number;
  avgReadLatencyMs: number;
  writeErrors: number;
  readErrors: number;
}

interface SyncMetrics {
  totalSyncCycles: number;
  entitiesSynced: number;
  factsSynced: number;
  relationshipsSynced: number;
  syncSuccessRate: number;
  lastSyncDurationMs: number;
  avgSyncDurationMs: number;
}

export interface DynamicMemoryMetrics {
  fastCapture: FastCaptureMetrics;
  stm: STMMetrics;
  deepExtraction: DeepExtractionMetrics;
  firestore: FirestoreMetrics;
  sync: SyncMetrics;
  collectedAt: Date;
  uptimeMs: number;
}

// ============================================================================
// METRIC STATE
// ============================================================================

const startTime = Date.now();

const fastCaptureMetrics: FastCaptureMetrics = {
  totalCalls: 0,
  totalLatencyMs: 0,
  avgLatencyMs: 0,
  maxLatencyMs: 0,
  minLatencyMs: Infinity,
  p95LatencyMs: 0,
  entitiesExtracted: 0,
  emotionsDetected: 0,
  topicsDetected: 0,
  jobsQueued: 0,
  latencyBuckets: [],
};

const stmMetrics: STMMetrics = {
  activeSessions: 0,
  totalTurnsRecorded: 0,
  totalEntitiesTracked: 0,
  avgTurnsPerSession: 0,
  avgEntitiesPerSession: 0,
  sessionsPromoted: 0,
  promotionSuccessRate: 1.0,
};

const deepExtractionMetrics: DeepExtractionMetrics = {
  totalJobsProcessed: 0,
  totalJobsFailed: 0,
  avgProcessingTimeMs: 0,
  currentQueueDepth: 0,
  entitiesExtracted: 0,
  factsExtracted: 0,
  relationshipsExtracted: 0,
};

const firestoreMetrics: FirestoreMetrics = {
  totalWrites: 0,
  totalReads: 0,
  writeSuccessRate: 1.0,
  avgWriteLatencyMs: 0,
  avgReadLatencyMs: 0,
  writeErrors: 0,
  readErrors: 0,
};

const syncMetrics: SyncMetrics = {
  totalSyncCycles: 0,
  entitiesSynced: 0,
  factsSynced: 0,
  relationshipsSynced: 0,
  syncSuccessRate: 1.0,
  lastSyncDurationMs: 0,
  avgSyncDurationMs: 0,
};

// Keep last 1000 latencies for percentile calculation
const MAX_LATENCY_SAMPLES = 1000;

// ============================================================================
// RECORDING FUNCTIONS
// ============================================================================

/**
 * Record a fast capture operation
 */
export function recordFastCapture(
  latencyMs: number,
  entityCount: number,
  emotionCount: number,
  topicCount: number,
  jobQueued: boolean
): void {
  fastCaptureMetrics.totalCalls++;
  fastCaptureMetrics.totalLatencyMs += latencyMs;
  fastCaptureMetrics.avgLatencyMs = fastCaptureMetrics.totalLatencyMs / fastCaptureMetrics.totalCalls;
  fastCaptureMetrics.maxLatencyMs = Math.max(fastCaptureMetrics.maxLatencyMs, latencyMs);
  fastCaptureMetrics.minLatencyMs = Math.min(fastCaptureMetrics.minLatencyMs, latencyMs);
  fastCaptureMetrics.entitiesExtracted += entityCount;
  fastCaptureMetrics.emotionsDetected += emotionCount;
  fastCaptureMetrics.topicsDetected += topicCount;
  if (jobQueued) fastCaptureMetrics.jobsQueued++;

  // Track latency for percentile
  fastCaptureMetrics.latencyBuckets.push(latencyMs);
  if (fastCaptureMetrics.latencyBuckets.length > MAX_LATENCY_SAMPLES) {
    fastCaptureMetrics.latencyBuckets.shift();
  }

  // Calculate p95
  if (fastCaptureMetrics.latencyBuckets.length >= 20) {
    const sorted = [...fastCaptureMetrics.latencyBuckets].sort((a, b) => a - b);
    const p95Index = Math.floor(sorted.length * 0.95);
    fastCaptureMetrics.p95LatencyMs = sorted[p95Index];
  }
}

/**
 * Record STM buffer state
 */
export function recordSTMState(
  activeSessions: number,
  totalTurns: number,
  totalEntities: number
): void {
  stmMetrics.activeSessions = activeSessions;
  stmMetrics.totalTurnsRecorded = totalTurns;
  stmMetrics.totalEntitiesTracked = totalEntities;
  if (activeSessions > 0) {
    stmMetrics.avgTurnsPerSession = totalTurns / activeSessions;
    stmMetrics.avgEntitiesPerSession = totalEntities / activeSessions;
  }
}

/**
 * Record a turn being recorded to STM
 */
export function recordSTMTurn(entityCount: number): void {
  stmMetrics.totalTurnsRecorded++;
  stmMetrics.totalEntitiesTracked += entityCount;
}

/**
 * Record session promotion
 */
export function recordPromotion(success: boolean): void {
  if (success) {
    stmMetrics.sessionsPromoted++;
  }
  const total = stmMetrics.sessionsPromoted + (success ? 0 : 1);
  stmMetrics.promotionSuccessRate = stmMetrics.sessionsPromoted / Math.max(total, 1);
}

/**
 * Record deep extraction job
 */
export function recordDeepExtraction(
  success: boolean,
  processingTimeMs: number,
  entityCount: number,
  factCount: number,
  relationshipCount: number
): void {
  if (success) {
    deepExtractionMetrics.totalJobsProcessed++;
  } else {
    deepExtractionMetrics.totalJobsFailed++;
  }

  const totalJobs = deepExtractionMetrics.totalJobsProcessed;
  deepExtractionMetrics.avgProcessingTimeMs =
    (deepExtractionMetrics.avgProcessingTimeMs * (totalJobs - 1) + processingTimeMs) /
    Math.max(totalJobs, 1);

  deepExtractionMetrics.entitiesExtracted += entityCount;
  deepExtractionMetrics.factsExtracted += factCount;
  deepExtractionMetrics.relationshipsExtracted += relationshipCount;
}

/**
 * Update deep extraction queue depth
 */
export function recordQueueDepth(depth: number): void {
  deepExtractionMetrics.currentQueueDepth = depth;
}

/**
 * Record Firestore write
 */
export function recordFirestoreWrite(success: boolean, latencyMs: number): void {
  firestoreMetrics.totalWrites++;
  if (!success) {
    firestoreMetrics.writeErrors++;
  }
  firestoreMetrics.writeSuccessRate =
    (firestoreMetrics.totalWrites - firestoreMetrics.writeErrors) / firestoreMetrics.totalWrites;

  const successfulWrites = firestoreMetrics.totalWrites - firestoreMetrics.writeErrors;
  if (success && successfulWrites > 0) {
    firestoreMetrics.avgWriteLatencyMs =
      (firestoreMetrics.avgWriteLatencyMs * (successfulWrites - 1) + latencyMs) / successfulWrites;
  }
}

/**
 * Record Firestore read
 */
export function recordFirestoreRead(success: boolean, latencyMs: number): void {
  firestoreMetrics.totalReads++;
  if (!success) {
    firestoreMetrics.readErrors++;
  }

  const successfulReads = firestoreMetrics.totalReads - firestoreMetrics.readErrors;
  if (success && successfulReads > 0) {
    firestoreMetrics.avgReadLatencyMs =
      (firestoreMetrics.avgReadLatencyMs * (successfulReads - 1) + latencyMs) / successfulReads;
  }
}

/**
 * Record sync cycle
 */
export function recordSyncCycle(
  success: boolean,
  durationMs: number,
  entitiesSynced: number,
  factsSynced: number,
  relationshipsSynced: number
): void {
  syncMetrics.totalSyncCycles++;
  syncMetrics.lastSyncDurationMs = durationMs;
  syncMetrics.avgSyncDurationMs =
    (syncMetrics.avgSyncDurationMs * (syncMetrics.totalSyncCycles - 1) + durationMs) /
    syncMetrics.totalSyncCycles;

  if (success) {
    syncMetrics.entitiesSynced += entitiesSynced;
    syncMetrics.factsSynced += factsSynced;
    syncMetrics.relationshipsSynced += relationshipsSynced;
  }

  const successfulSyncs = success
    ? syncMetrics.totalSyncCycles
    : syncMetrics.totalSyncCycles - 1;
  syncMetrics.syncSuccessRate = successfulSyncs / syncMetrics.totalSyncCycles;
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Get all metrics
 */
export function getDynamicMemoryMetrics(): DynamicMemoryMetrics {
  return {
    fastCapture: { ...fastCaptureMetrics },
    stm: { ...stmMetrics },
    deepExtraction: { ...deepExtractionMetrics },
    firestore: { ...firestoreMetrics },
    sync: { ...syncMetrics },
    collectedAt: new Date(),
    uptimeMs: Date.now() - startTime,
  };
}

/**
 * Get a summary for logging
 */
export function getMetricsSummary(): Record<string, unknown> {
  return {
    fastCapture: {
      calls: fastCaptureMetrics.totalCalls,
      avgLatencyMs: Math.round(fastCaptureMetrics.avgLatencyMs * 10) / 10,
      p95LatencyMs: Math.round(fastCaptureMetrics.p95LatencyMs * 10) / 10,
      entitiesExtracted: fastCaptureMetrics.entitiesExtracted,
      jobsQueued: fastCaptureMetrics.jobsQueued,
    },
    stm: {
      activeSessions: stmMetrics.activeSessions,
      totalTurns: stmMetrics.totalTurnsRecorded,
      sessionsPromoted: stmMetrics.sessionsPromoted,
    },
    deepExtraction: {
      processed: deepExtractionMetrics.totalJobsProcessed,
      failed: deepExtractionMetrics.totalJobsFailed,
      queueDepth: deepExtractionMetrics.currentQueueDepth,
    },
    firestore: {
      writes: firestoreMetrics.totalWrites,
      writeSuccessRate: Math.round(firestoreMetrics.writeSuccessRate * 100) + '%',
      reads: firestoreMetrics.totalReads,
    },
    sync: {
      cycles: syncMetrics.totalSyncCycles,
      entitiesSynced: syncMetrics.entitiesSynced,
    },
    uptimeMs: Date.now() - startTime,
  };
}

/**
 * Log metrics periodically (call from health check)
 */
export function logMetrics(): void {
  log.info(getMetricsSummary(), '📊 Dynamic memory metrics');
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  Object.assign(fastCaptureMetrics, {
    totalCalls: 0,
    totalLatencyMs: 0,
    avgLatencyMs: 0,
    maxLatencyMs: 0,
    minLatencyMs: Infinity,
    p95LatencyMs: 0,
    entitiesExtracted: 0,
    emotionsDetected: 0,
    topicsDetected: 0,
    jobsQueued: 0,
    latencyBuckets: [],
  });

  Object.assign(stmMetrics, {
    activeSessions: 0,
    totalTurnsRecorded: 0,
    totalEntitiesTracked: 0,
    avgTurnsPerSession: 0,
    avgEntitiesPerSession: 0,
    sessionsPromoted: 0,
    promotionSuccessRate: 1.0,
  });

  Object.assign(deepExtractionMetrics, {
    totalJobsProcessed: 0,
    totalJobsFailed: 0,
    avgProcessingTimeMs: 0,
    currentQueueDepth: 0,
    entitiesExtracted: 0,
    factsExtracted: 0,
    relationshipsExtracted: 0,
  });

  Object.assign(firestoreMetrics, {
    totalWrites: 0,
    totalReads: 0,
    writeSuccessRate: 1.0,
    avgWriteLatencyMs: 0,
    avgReadLatencyMs: 0,
    writeErrors: 0,
    readErrors: 0,
  });

  Object.assign(syncMetrics, {
    totalSyncCycles: 0,
    entitiesSynced: 0,
    factsSynced: 0,
    relationshipsSynced: 0,
    syncSuccessRate: 1.0,
    lastSyncDurationMs: 0,
    avgSyncDurationMs: 0,
  });
}

// ============================================================================
// MEMORY ATTRIBUTION METRICS
// ============================================================================

interface MemoryAttributionMetrics {
  totalAttributions: number;
  memoriesInjected: number;
  memoriesAttributed: number;
  avgAttributionRate: number;
}

const attributionMetrics: MemoryAttributionMetrics = {
  totalAttributions: 0,
  memoriesInjected: 0,
  memoriesAttributed: 0,
  avgAttributionRate: 0,
};

/**
 * Record memory attribution after agent turn
 * Tracks how many injected memories were actually used
 */
export function recordMemoryAttribution(
  injectedCount: number,
  attributedCount: number,
  _breakdown: { explicit: number; implicit: number; semantic: number }
): void {
  attributionMetrics.totalAttributions++;
  attributionMetrics.memoriesInjected += injectedCount;
  attributionMetrics.memoriesAttributed += attributedCount;

  if (attributionMetrics.memoriesInjected > 0) {
    attributionMetrics.avgAttributionRate =
      attributionMetrics.memoriesAttributed / attributionMetrics.memoriesInjected;
  }
}

/**
 * Record that memories were injected into context
 */
export function recordMemoriesInjected(count: number): void {
  attributionMetrics.memoriesInjected += count;
}

/**
 * Get memory attribution metrics
 */
export function getAttributionMetrics(): MemoryAttributionMetrics {
  return { ...attributionMetrics };
}
