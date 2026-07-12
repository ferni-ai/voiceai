/**
 * Memory/RAG Health Metrics
 *
 * Tracks memory system and RAG performance:
 * - Vector search latency
 * - Search relevance scores
 * - Storage utilization
 * - Cache hit rates
 * - Embedding generation times
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface VectorSearchEvent {
  id: string;
  timestamp: number;
  userId: string;
  queryLength: number;
  resultsCount: number;
  topScore: number;
  avgScore: number;
  latencyMs: number;
  cacheHit: boolean;
  storeType: 'memory' | 'firestore' | 'postgres';
}

export interface EmbeddingEvent {
  id: string;
  timestamp: number;
  provider: string;
  textLength: number;
  dimensions: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface MemoryHealthSnapshot {
  // Vector search
  avgSearchLatencyMs: number;
  p95SearchLatencyMs: number;
  avgResultsPerQuery: number;
  avgTopScore: number;
  avgRelevanceScore: number;
  searchesPerMinute: number;

  // Cache
  cacheHitRate: number;
  cacheMisses: number;

  // Embeddings
  avgEmbeddingLatencyMs: number;
  embeddingsGenerated: number;
  embeddingErrorRate: number;

  // Storage
  documentsStored: number;
  storageBySource: Record<string, number>;
  storeType: string;

  // Retrieval quality
  lowRelevanceSearches: number;
  emptyResultSearches: number;

  // Memory that speaks
  sessionsWithMemoryData: number;
  sessionsWithMemoryRecalls: number;
  memoryRecalls: number;
  memoryRecallsPerSession: number;
  memoryRecallRate: number;
}

// ============================================================================
// STATE
// ============================================================================

const searchEvents: VectorSearchEvent[] = [];
const embeddingEvents: EmbeddingEvent[] = [];
const MAX_EVENTS = 1000;
let currentStoreType = 'memory';
let documentCount = 0;
const storageBySource: Record<string, number> = {};
const sessionsWithMemoryData = new Set<string>();
const memoryRecallsBySession = new Map<string, number>();

// ============================================================================
// RECORDING
// ============================================================================

export function recordVectorSearch(event: Omit<VectorSearchEvent, 'id' | 'timestamp'>): void {
  const fullEvent: VectorSearchEvent = {
    ...event,
    id: `search_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  searchEvents.push(fullEvent);
  if (searchEvents.length > MAX_EVENTS) {
    searchEvents.shift();
  }

  log.debug({ latencyMs: event.latencyMs, results: event.resultsCount }, 'Vector search recorded');
}

export function recordEmbedding(event: Omit<EmbeddingEvent, 'id' | 'timestamp'>): void {
  const fullEvent: EmbeddingEvent = {
    ...event,
    id: `embed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
  };

  embeddingEvents.push(fullEvent);
  if (embeddingEvents.length > MAX_EVENTS) {
    embeddingEvents.shift();
  }

  if (!event.success) {
    log.warn({ provider: event.provider, error: event.error }, 'Embedding generation failed');
  }
}

export function updateStorageStats(
  storeType: string,
  count: number,
  bySource?: Record<string, number>
): void {
  currentStoreType = storeType;
  documentCount = count;
  if (bySource) {
    Object.assign(storageBySource, bySource);
  }
}

export function recordMemoryRecallOpportunity(input: {
  sessionId: string;
  memoryCount: number;
}): void {
  if (input.memoryCount <= 0) return;
  sessionsWithMemoryData.add(input.sessionId);
}

export function recordMemoryRecallSurfaced(input: {
  sessionId: string;
  surfacedCount: number;
}): void {
  if (input.surfacedCount <= 0) return;
  const currentCount = memoryRecallsBySession.get(input.sessionId) ?? 0;
  memoryRecallsBySession.set(input.sessionId, currentCount + input.surfacedCount);
}

export function resetMemoryRecallStats(): void {
  sessionsWithMemoryData.clear();
  memoryRecallsBySession.clear();
}

// ============================================================================
// SNAPSHOT
// ============================================================================

export function getSnapshot(): MemoryHealthSnapshot {
  const recentSearches = searchEvents.filter((e) => e.timestamp > Date.now() - 5 * 60 * 1000);
  const recentEmbeddings = embeddingEvents.filter((e) => e.timestamp > Date.now() - 5 * 60 * 1000);

  // Search metrics
  const searchLatencies = recentSearches.map((e) => e.latencyMs);
  const avgSearchLatencyMs =
    searchLatencies.length > 0
      ? searchLatencies.reduce((a, b) => a + b, 0) / searchLatencies.length
      : 0;
  const sortedLatencies = [...searchLatencies].sort((a, b) => a - b);
  const p95SearchLatencyMs = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;

  const avgResultsPerQuery =
    recentSearches.length > 0
      ? recentSearches.reduce((sum, e) => sum + e.resultsCount, 0) / recentSearches.length
      : 0;

  const avgTopScore =
    recentSearches.length > 0
      ? recentSearches.reduce((sum, e) => sum + e.topScore, 0) / recentSearches.length
      : 0;

  const avgRelevanceScore =
    recentSearches.length > 0
      ? recentSearches.reduce((sum, e) => sum + e.avgScore, 0) / recentSearches.length
      : 0;

  // Cache metrics
  const cacheHits = recentSearches.filter((e) => e.cacheHit).length;
  const cacheHitRate = recentSearches.length > 0 ? cacheHits / recentSearches.length : 0;

  // Embedding metrics
  const embeddingLatencies = recentEmbeddings.filter((e) => e.success).map((e) => e.latencyMs);
  const avgEmbeddingLatencyMs =
    embeddingLatencies.length > 0
      ? embeddingLatencies.reduce((a, b) => a + b, 0) / embeddingLatencies.length
      : 0;
  const embeddingErrors = recentEmbeddings.filter((e) => !e.success).length;
  const embeddingErrorRate =
    recentEmbeddings.length > 0 ? embeddingErrors / recentEmbeddings.length : 0;

  // Quality metrics
  const lowRelevanceSearches = recentSearches.filter((e) => e.avgScore < 0.5).length;
  const emptyResultSearches = recentSearches.filter((e) => e.resultsCount === 0).length;
  const memoryDataSessionCount = sessionsWithMemoryData.size;
  const sessionsWithRecalls = Array.from(memoryRecallsBySession.entries()).filter(
    ([sessionId, recallCount]) => sessionsWithMemoryData.has(sessionId) && recallCount > 0
  ).length;
  const memoryRecalls = Array.from(memoryRecallsBySession.entries()).reduce(
    (sum, [sessionId, recallCount]) =>
      sessionsWithMemoryData.has(sessionId) ? sum + recallCount : sum,
    0
  );
  const memoryRecallsPerSession =
    memoryDataSessionCount > 0 ? memoryRecalls / memoryDataSessionCount : 0;
  const memoryRecallRate =
    memoryDataSessionCount > 0 ? sessionsWithRecalls / memoryDataSessionCount : 0;

  return {
    avgSearchLatencyMs,
    p95SearchLatencyMs,
    avgResultsPerQuery,
    avgTopScore,
    avgRelevanceScore,
    searchesPerMinute: recentSearches.length / 5,

    cacheHitRate,
    cacheMisses: recentSearches.length - cacheHits,

    avgEmbeddingLatencyMs,
    embeddingsGenerated: recentEmbeddings.length,
    embeddingErrorRate,

    documentsStored: documentCount,
    storageBySource: { ...storageBySource },
    storeType: currentStoreType,

    lowRelevanceSearches,
    emptyResultSearches,
    sessionsWithMemoryData: memoryDataSessionCount,
    sessionsWithMemoryRecalls: sessionsWithRecalls,
    memoryRecalls,
    memoryRecallsPerSession,
    memoryRecallRate,
  };
}

// ============================================================================
// EXPORT
// ============================================================================

export const memoryMetrics = {
  recordVectorSearch,
  recordEmbedding,
  updateStorageStats,
  recordMemoryRecallOpportunity,
  recordMemoryRecallSurfaced,
  resetMemoryRecallStats,
  getSnapshot,
};
