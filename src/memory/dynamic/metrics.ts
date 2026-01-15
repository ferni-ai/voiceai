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

interface ContinuityMetrics {
  /** Total continuity writes (session ends) */
  totalWrites: number;
  /** Threads updated across all writes */
  totalThreadsUpdated: number;
  /** Anchors created across all writes */
  totalAnchorsCreated: number;
  /** Capsule updates */
  totalCapsuleUpdates: number;
  /** Hybrid retrievals performed */
  totalRetrievals: number;
  /** Average retrieval latency */
  avgRetrievalLatencyMs: number;
  /** Spanner availability rate */
  spannerAvailabilityRate: number;
  /** Session cache hits */
  cacheHits: number;
  /** Session cache misses */
  cacheMisses: number;
}

interface AttributionMetrics {
  /** Total memories injected into context */
  totalMemoriesInjected: number;
  /** Total memories attributed (used in response) */
  totalMemoriesAttributed: number;
  /** Explicit attributions (tag found in response) */
  explicitAttributions: number;
  /** Implicit attributions (fuzzy content match) */
  implicitAttributions: number;
  /** Overall attribution rate (0-1) */
  attributionRate: number;
  /** By memory type */
  byType: {
    thread: { injected: number; attributed: number };
    anchor: { injected: number; attributed: number };
    semantic: { injected: number; attributed: number };
  };
}

export interface DynamicMemoryMetrics {
  fastCapture: FastCaptureMetrics;
  stm: STMMetrics;
  deepExtraction: DeepExtractionMetrics;
  firestore: FirestoreMetrics;
  sync: SyncMetrics;
  continuity: ContinuityMetrics;
  attribution: AttributionMetrics;
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

const continuityMetrics: ContinuityMetrics = {
  totalWrites: 0,
  totalThreadsUpdated: 0,
  totalAnchorsCreated: 0,
  totalCapsuleUpdates: 0,
  totalRetrievals: 0,
  avgRetrievalLatencyMs: 0,
  spannerAvailabilityRate: 1.0,
  cacheHits: 0,
  cacheMisses: 0,
};

const attributionMetrics: AttributionMetrics = {
  totalMemoriesInjected: 0,
  totalMemoriesAttributed: 0,
  explicitAttributions: 0,
  implicitAttributions: 0,
  attributionRate: 0,
  byType: {
    thread: { injected: 0, attributed: 0 },
    anchor: { injected: 0, attributed: 0 },
    semantic: { injected: 0, attributed: 0 },
  },
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
  fastCaptureMetrics.avgLatencyMs =
    fastCaptureMetrics.totalLatencyMs / fastCaptureMetrics.totalCalls;
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

  const successfulSyncs = success ? syncMetrics.totalSyncCycles : syncMetrics.totalSyncCycles - 1;
  syncMetrics.syncSuccessRate = successfulSyncs / syncMetrics.totalSyncCycles;
}

// ============================================================================
// CONTINUITY METRICS
// ============================================================================

/**
 * Record continuity write (session end)
 */
export function recordContinuityWrite(
  threadsUpdated: number,
  anchorsCreated: number,
  capsuleUpdated: boolean,
  spannerAvailable: boolean
): void {
  continuityMetrics.totalWrites++;
  continuityMetrics.totalThreadsUpdated += threadsUpdated;
  continuityMetrics.totalAnchorsCreated += anchorsCreated;
  if (capsuleUpdated) {
    continuityMetrics.totalCapsuleUpdates++;
  }

  // Update Spanner availability rate (rolling average)
  const spannerValue = spannerAvailable ? 1 : 0;
  continuityMetrics.spannerAvailabilityRate =
    (continuityMetrics.spannerAvailabilityRate * (continuityMetrics.totalWrites - 1) +
      spannerValue) /
    continuityMetrics.totalWrites;
}

/**
 * Record continuity retrieval (session start or mid-session)
 */
export function recordContinuityRetrieval(latencyMs: number, spannerAvailable: boolean): void {
  continuityMetrics.totalRetrievals++;
  continuityMetrics.avgRetrievalLatencyMs =
    (continuityMetrics.avgRetrievalLatencyMs * (continuityMetrics.totalRetrievals - 1) +
      latencyMs) /
    continuityMetrics.totalRetrievals;

  // Update Spanner availability rate
  const spannerValue = spannerAvailable ? 1 : 0;
  const total = continuityMetrics.totalWrites + continuityMetrics.totalRetrievals;
  continuityMetrics.spannerAvailabilityRate =
    (continuityMetrics.spannerAvailabilityRate * (total - 1) + spannerValue) / total;
}

/**
 * Record continuity cache access
 */
export function recordContinuityCacheAccess(hit: boolean): void {
  if (hit) {
    continuityMetrics.cacheHits++;
  } else {
    continuityMetrics.cacheMisses++;
  }
}

// ============================================================================
// ATTRIBUTION METRICS
// ============================================================================

/**
 * Record memory attribution results from a single LLM response
 *
 * @param injected - Number of memories injected into context
 * @param attributed - Number of memories referenced in response
 * @param explicit - Number of explicit tag references
 * @param byType - Attribution breakdown by memory type
 */
export function recordMemoryAttribution(
  injected: number,
  attributed: number,
  explicit: number,
  byType?: { thread?: number; anchor?: number; semantic?: number }
): void {
  attributionMetrics.totalMemoriesInjected += injected;
  attributionMetrics.totalMemoriesAttributed += attributed;
  attributionMetrics.explicitAttributions += explicit;
  attributionMetrics.implicitAttributions += attributed - explicit;

  // Update attribution rate (rolling average)
  if (attributionMetrics.totalMemoriesInjected > 0) {
    attributionMetrics.attributionRate =
      attributionMetrics.totalMemoriesAttributed / attributionMetrics.totalMemoriesInjected;
  }

  // Update by-type metrics (track injected count, not just attributed)
  if (byType) {
    // We track attributed counts, assuming injected is proportional
    if (byType.thread) {
      attributionMetrics.byType.thread.attributed += byType.thread;
    }
    if (byType.anchor) {
      attributionMetrics.byType.anchor.attributed += byType.anchor;
    }
    if (byType.semantic) {
      attributionMetrics.byType.semantic.attributed += byType.semantic;
    }
  }
}

/**
 * Record injected memory counts by type (for accurate rate calculation)
 */
export function recordMemoriesInjected(byType: {
  thread?: number;
  anchor?: number;
  semantic?: number;
}): void {
  if (byType.thread) {
    attributionMetrics.byType.thread.injected += byType.thread;
  }
  if (byType.anchor) {
    attributionMetrics.byType.anchor.injected += byType.anchor;
  }
  if (byType.semantic) {
    attributionMetrics.byType.semantic.injected += byType.semantic;
  }
}

/**
 * Get current attribution rate
 */
export function getAttributionRate(): number {
  return attributionMetrics.attributionRate;
}

/**
 * Get attribution metrics summary
 */
export function getAttributionMetrics(): AttributionMetrics {
  return { ...attributionMetrics };
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
    continuity: { ...continuityMetrics },
    attribution: {
      ...attributionMetrics,
      byType: {
        thread: { ...attributionMetrics.byType.thread },
        anchor: { ...attributionMetrics.byType.anchor },
        semantic: { ...attributionMetrics.byType.semantic },
      },
    },
    collectedAt: new Date(),
    uptimeMs: Date.now() - startTime,
  };
}

/**
 * Get a summary for logging
 */
export function getMetricsSummary(): Record<string, unknown> {
  const cacheTotal = continuityMetrics.cacheHits + continuityMetrics.cacheMisses;
  const cacheHitRate = cacheTotal > 0 ? continuityMetrics.cacheHits / cacheTotal : 0;

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
    continuity: {
      writes: continuityMetrics.totalWrites,
      threadsUpdated: continuityMetrics.totalThreadsUpdated,
      anchorsCreated: continuityMetrics.totalAnchorsCreated,
      retrievals: continuityMetrics.totalRetrievals,
      avgRetrievalMs: Math.round(continuityMetrics.avgRetrievalLatencyMs * 10) / 10,
      spannerAvailable: Math.round(continuityMetrics.spannerAvailabilityRate * 100) + '%',
      cacheHitRate: Math.round(cacheHitRate * 100) + '%',
    },
    attribution: {
      injected: attributionMetrics.totalMemoriesInjected,
      attributed: attributionMetrics.totalMemoriesAttributed,
      explicit: attributionMetrics.explicitAttributions,
      implicit: attributionMetrics.implicitAttributions,
      rate: Math.round(attributionMetrics.attributionRate * 100) + '%',
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

  Object.assign(continuityMetrics, {
    totalWrites: 0,
    totalThreadsUpdated: 0,
    totalAnchorsCreated: 0,
    totalCapsuleUpdates: 0,
    totalRetrievals: 0,
    avgRetrievalLatencyMs: 0,
    spannerAvailabilityRate: 1.0,
    cacheHits: 0,
    cacheMisses: 0,
  });

  Object.assign(attributionMetrics, {
    totalMemoriesInjected: 0,
    totalMemoriesAttributed: 0,
    explicitAttributions: 0,
    implicitAttributions: 0,
    attributionRate: 0,
    byType: {
      thread: { injected: 0, attributed: 0 },
      anchor: { injected: 0, attributed: 0 },
      semantic: { injected: 0, attributed: 0 },
    },
  });
}
