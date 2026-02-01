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

// ============================================================================
// KNOWLEDGE GRAPH CAPTURE METRICS (Jan 2026)
// ============================================================================

interface KnowledgeGraphMetrics {
  totalCaptures: number;
  successfulCaptures: number;
  failedCaptures: number;
  entitiesCreated: number;
  entitiesUpdated: number;
  factsExtracted: number;
  relationshipsExtracted: number;
  avgCaptureLatencyMs: number;
  entityStoreReady: boolean;
  initializationAttempted: boolean;
}

const knowledgeGraphMetrics: KnowledgeGraphMetrics = {
  totalCaptures: 0,
  successfulCaptures: 0,
  failedCaptures: 0,
  entitiesCreated: 0,
  entitiesUpdated: 0,
  factsExtracted: 0,
  relationshipsExtracted: 0,
  avgCaptureLatencyMs: 0,
  entityStoreReady: false,
  initializationAttempted: false,
};

/**
 * Record knowledge graph capture operation
 */
export function recordKnowledgeCapture(
  success: boolean,
  latencyMs: number,
  entitiesCreated: number,
  entitiesUpdated: number,
  factsCount: number,
  relationshipsCount: number
): void {
  knowledgeGraphMetrics.totalCaptures++;
  if (success) {
    knowledgeGraphMetrics.successfulCaptures++;
  } else {
    knowledgeGraphMetrics.failedCaptures++;
  }

  knowledgeGraphMetrics.entitiesCreated += entitiesCreated;
  knowledgeGraphMetrics.entitiesUpdated += entitiesUpdated;
  knowledgeGraphMetrics.factsExtracted += factsCount;
  knowledgeGraphMetrics.relationshipsExtracted += relationshipsCount;

  // Rolling average latency
  const total = knowledgeGraphMetrics.totalCaptures;
  knowledgeGraphMetrics.avgCaptureLatencyMs =
    (knowledgeGraphMetrics.avgCaptureLatencyMs * (total - 1) + latencyMs) / total;
}

/**
 * Update knowledge graph initialization status
 */
export function recordKnowledgeGraphStatus(entityStoreReady: boolean, initAttempted: boolean): void {
  knowledgeGraphMetrics.entityStoreReady = entityStoreReady;
  knowledgeGraphMetrics.initializationAttempted = initAttempted;
}

/**
 * Get knowledge graph metrics
 */
export function getKnowledgeGraphMetrics(): KnowledgeGraphMetrics {
  return { ...knowledgeGraphMetrics };
}

// ============================================================================
// HUMAN SIGNAL EXTRACTION METRICS (Jan 2026)
// ============================================================================

interface HumanSignalMetrics {
  totalExtractions: number;
  llmExtractions: number;
  regexFallbacks: number;
  signalsExtracted: {
    importantDates: number;
    values: number;
    dreams: number;
    fears: number;
    growthMarkers: number;
    challenges: number;
    comfortPatterns: number;
    stressTriggers: number;
  };
  avgExtractionLatencyMs: number;
  persistenceSuccessRate: number;
}

const humanSignalMetrics: HumanSignalMetrics = {
  totalExtractions: 0,
  llmExtractions: 0,
  regexFallbacks: 0,
  signalsExtracted: {
    importantDates: 0,
    values: 0,
    dreams: 0,
    fears: 0,
    growthMarkers: 0,
    challenges: 0,
    comfortPatterns: 0,
    stressTriggers: 0,
  },
  avgExtractionLatencyMs: 0,
  persistenceSuccessRate: 1.0,
};

let persistenceAttempts = 0;
let persistenceSuccesses = 0;

/**
 * Record human signal extraction
 */
export function recordHumanSignalExtraction(
  method: 'llm' | 'regex',
  latencyMs: number,
  signals: {
    importantDates?: number;
    values?: number;
    dreams?: number;
    fears?: number;
    growthMarkers?: number;
    challenges?: number;
    comfortPatterns?: number;
    stressTriggers?: number;
  }
): void {
  humanSignalMetrics.totalExtractions++;
  if (method === 'llm') {
    humanSignalMetrics.llmExtractions++;
  } else {
    humanSignalMetrics.regexFallbacks++;
  }

  // Accumulate signal counts
  humanSignalMetrics.signalsExtracted.importantDates += signals.importantDates || 0;
  humanSignalMetrics.signalsExtracted.values += signals.values || 0;
  humanSignalMetrics.signalsExtracted.dreams += signals.dreams || 0;
  humanSignalMetrics.signalsExtracted.fears += signals.fears || 0;
  humanSignalMetrics.signalsExtracted.growthMarkers += signals.growthMarkers || 0;
  humanSignalMetrics.signalsExtracted.challenges += signals.challenges || 0;
  humanSignalMetrics.signalsExtracted.comfortPatterns += signals.comfortPatterns || 0;
  humanSignalMetrics.signalsExtracted.stressTriggers += signals.stressTriggers || 0;

  // Rolling average latency
  const total = humanSignalMetrics.totalExtractions;
  humanSignalMetrics.avgExtractionLatencyMs =
    (humanSignalMetrics.avgExtractionLatencyMs * (total - 1) + latencyMs) / total;
}

/**
 * Record human signal persistence attempt
 */
export function recordHumanSignalPersistence(success: boolean): void {
  persistenceAttempts++;
  if (success) {
    persistenceSuccesses++;
  }
  humanSignalMetrics.persistenceSuccessRate =
    persistenceSuccesses / Math.max(persistenceAttempts, 1);
}

/**
 * Get human signal metrics
 */
export function getHumanSignalMetrics(): HumanSignalMetrics {
  return { ...humanSignalMetrics };
}

// ============================================================================
// COMPREHENSIVE MEMORY HEALTH STATUS (Jan 2026)
// ============================================================================

export interface MemoryHealthStatus {
  overall: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    fastCapture: { status: 'ok' | 'slow' | 'failing'; avgLatencyMs: number };
    stmBuffer: { status: 'ok' | 'warning' | 'error'; activeSessions: number };
    deepExtraction: { status: 'ok' | 'backlogged' | 'failing'; queueDepth: number };
    knowledgeGraph: { status: 'ok' | 'degraded' | 'offline'; entityStoreReady: boolean };
    humanSignals: { status: 'ok' | 'degraded' | 'offline'; llmRate: number };
  };
  issues: string[];
  recommendations: string[];
}

/**
 * Get comprehensive memory system health status
 */
export function getMemoryHealthStatus(): MemoryHealthStatus {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Fast capture health
  let fastCaptureStatus: 'ok' | 'slow' | 'failing' = 'ok';
  if (fastCaptureMetrics.avgLatencyMs > 100) {
    fastCaptureStatus = 'slow';
    issues.push(`Fast capture latency high: ${Math.round(fastCaptureMetrics.avgLatencyMs)}ms avg`);
  }
  if (fastCaptureMetrics.p95LatencyMs > 200) {
    fastCaptureStatus = 'failing';
    issues.push(`Fast capture P95 exceeds SLA: ${Math.round(fastCaptureMetrics.p95LatencyMs)}ms`);
  }

  // STM buffer health
  let stmStatus: 'ok' | 'warning' | 'error' = 'ok';
  if (stmMetrics.promotionSuccessRate < 0.95) {
    stmStatus = 'warning';
    issues.push(`STM promotion success rate low: ${Math.round(stmMetrics.promotionSuccessRate * 100)}%`);
  }
  if (stmMetrics.promotionSuccessRate < 0.8) {
    stmStatus = 'error';
    recommendations.push('Investigate STM promotion failures - memory may be lost');
  }

  // Deep extraction health
  let deepStatus: 'ok' | 'backlogged' | 'failing' = 'ok';
  if (deepExtractionMetrics.currentQueueDepth > 50) {
    deepStatus = 'backlogged';
    issues.push(`Deep extraction queue backlogged: ${deepExtractionMetrics.currentQueueDepth} jobs`);
  }
  if (deepExtractionMetrics.totalJobsFailed > deepExtractionMetrics.totalJobsProcessed * 0.1) {
    deepStatus = 'failing';
    issues.push(`Deep extraction failure rate high: ${deepExtractionMetrics.totalJobsFailed} failed`);
  }

  // Knowledge graph health
  let kgStatus: 'ok' | 'degraded' | 'offline' = 'ok';
  if (!knowledgeGraphMetrics.initializationAttempted) {
    kgStatus = 'offline';
    issues.push('Knowledge graph not initialized');
    recommendations.push('Ensure initializeKnowledgeCapture() is called at startup');
  } else if (!knowledgeGraphMetrics.entityStoreReady) {
    kgStatus = 'degraded';
    issues.push('Entity store not ready - extraction running but not persisting');
  }

  // Human signal health
  let hsStatus: 'ok' | 'degraded' | 'offline' = 'ok';
  const llmRate = humanSignalMetrics.totalExtractions > 0
    ? humanSignalMetrics.llmExtractions / humanSignalMetrics.totalExtractions
    : 1;
  if (llmRate < 0.5) {
    hsStatus = 'degraded';
    issues.push(`LLM extraction rate low: ${Math.round(llmRate * 100)}% (using regex fallback)`);
    recommendations.push('Check Gemini API key and quota');
  }
  if (humanSignalMetrics.persistenceSuccessRate < 0.9) {
    hsStatus = 'degraded';
    issues.push(`Human signal persistence failing: ${Math.round(humanSignalMetrics.persistenceSuccessRate * 100)}%`);
  }

  // Overall health
  let overall: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (issues.length > 0) overall = 'degraded';
  if (
    deepStatus === 'failing' ||
    kgStatus === 'offline' ||
    stmStatus === 'error'
  ) {
    overall = 'unhealthy';
  }

  return {
    overall,
    components: {
      fastCapture: { status: fastCaptureStatus, avgLatencyMs: fastCaptureMetrics.avgLatencyMs },
      stmBuffer: { status: stmStatus, activeSessions: stmMetrics.activeSessions },
      deepExtraction: { status: deepStatus, queueDepth: deepExtractionMetrics.currentQueueDepth },
      knowledgeGraph: { status: kgStatus, entityStoreReady: knowledgeGraphMetrics.entityStoreReady },
      humanSignals: { status: hsStatus, llmRate },
    },
    issues,
    recommendations,
  };
}
