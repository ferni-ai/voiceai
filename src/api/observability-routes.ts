/**
 * Observability API Routes
 *
 * Exposes all observability metrics via HTTP endpoints.
 *
 * Endpoints:
 * - GET /api/observability - Full observability snapshot
 * - GET /api/observability/llm - LLM health metrics
 * - GET /api/observability/connection - Connection health metrics
 * - GET /api/observability/ux - User experience metrics
 * - GET /api/observability/memory - Memory/RAG metrics
 * - GET /api/observability/dynamic-memory - Dynamic memory system (L1/L2/L3) metrics
 * - GET /api/observability/memory-intelligence - Memory Intelligence surfacing/timing/learning metrics
 * - GET /api/observability/cost - Cost tracking metrics
 * - GET /api/observability/errors - Error & recovery metrics
 * - GET /api/observability/personas - Persona health metrics
 * - GET /api/observability/alerts - Recent alerts
 * - GET /api/observability/self-healing - Self-healing dashboard (circuits, anomalies, restarts)
 * - GET /api/observability/intelligence - Collective learning & intelligence metrics
 * - GET /api/observability/resilience - Resilience metrics (workers, cleanup, queues, circuits)
 * - GET /api/observability/redis - Redis cache stats, pub/sub status, circuit breakers
 * - GET /api/observability/ftis - FTIS (Tool Intelligence) metrics (transitions, outcomes, patterns)
 * - GET /api/observability/superhuman - Superhuman capability activation metrics
 * - GET /api/observability/bth - Better Than Human EQ telemetry (micro-expressions, memory, growth)
 * - GET /api/observability/tts-gateway - TTS Gateway metrics (cache hits, synthesis latency, errors)
 * - GET /api/observability/injections - BTH Injection effectiveness metrics (Phase 1 Communication System Overhaul)
 * - GET /api/observability/native-bindings - ONNX/Transformers health (circuit breakers, crashes, latency)
 * - POST /api/observability/native-bindings/reset - Reset native binding circuit breakers (admin only)
 * - POST /api/observability/clear - Clear all metrics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getCollectiveLearningSchedulerStatus,
  getCommunityInsights,
} from '../intelligence/index.js';
// Function calling health metrics (Jan 2026)
import {
  getFunctionCallHealthDashboard,
  getGeminiHealthMetrics,
} from '../agents/shared/function-call-telemetry.js';
import {
  connectionHealthMetrics,
  costMetrics,
  errorMetrics,
  getInjectionMetrics,
  llmHealthMetrics,
  memoryMetrics,
  observabilityHub,
  personaMetrics,
  resilienceMetrics,
  uxQualityMetrics,
} from '../services/observability/index.js';
// Superhuman activation metrics (moved to services layer for architecture compliance)
import {
  getSuperhumanActivationEvents,
  getSuperhumanActivationStats,
} from '../services/observability/superhuman-events.js';
// Re-export for backward compatibility with existing importers
export {
  emitSuperhumanActivation,
  type SuperhumanActivationEvent,
} from '../services/observability/superhuman-events.js';
import {
  getAggregateMetrics,
  getDashboardData as getSemanticDashboardData,
  getRecentMetrics,
} from '../tools/semantic-router/integration/metrics.js';
import { getProactiveStats } from '../tools/semantic-router/advanced/proactive-suggestions.js';
import { getDefenseStats } from '../tools/semantic-router/defense/index.js';
import { getOnlineLearningStats } from '../tools/semantic-router/learning/online-learning-loop.js';
import { getAggregateRoutingStats } from '../tools/semantic-router/integration/routing-observability.js';
import { getAgentEvolution } from '../intelligence/agent-evolution.js';
import {
  getAllCircuitStats,
  getAllClientStats,
  getAnomalyHistory,
  getRestartHistory,
  getUnhealthyClients,
} from '../services/self-healing/index.js';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAdmin, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parsePositiveInt, sendError, sendJSON } from './helpers.js';

const log = createLogger({ module: 'ObservabilityAPI' });

// ============================================================================
// TOOL INTELLIGENCE OBSERVABILITY
// Buffer for tool selection events (for dashboard and debugging)
// ============================================================================

interface ToolIntelligenceEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

const toolIntelligenceEvents: ToolIntelligenceEvent[] = [];
const MAX_TOOL_INTELLIGENCE_EVENTS = 100;

/**
 * Emit a tool intelligence event for monitoring/debugging
 * Used by tool-orchestrator.ts and other tool intelligence components
 *
 * @param type Event type (e.g., 'tool_selection', 'ftis_routing', 'outcome_tracked')
 * @param data Event payload
 */
export function emitToolIntelligenceEvent(type: string, data: Record<string, unknown>): void {
  const event: ToolIntelligenceEvent = {
    type,
    data,
    timestamp: new Date().toISOString(),
  };

  // Add to buffer (ring buffer behavior - oldest removed when full)
  toolIntelligenceEvents.push(event);
  if (toolIntelligenceEvents.length > MAX_TOOL_INTELLIGENCE_EVENTS) {
    toolIntelligenceEvents.shift();
  }

  // Log at debug level for immediate observability
  log.debug({ type, ...data }, `🧠 Tool intelligence: ${type}`);
}

/**
 * Get recent tool intelligence events
 * @param limit Max number of events to return (default: 50)
 */
export function getToolIntelligenceEvents(limit = 50): ToolIntelligenceEvent[] {
  return toolIntelligenceEvents.slice(-limit);
}

/**
 * Parse window minutes from query string
 */
function getWindowMinutes(url: URL): number {
  return parsePositiveInt(url.searchParams.get('window'), 60, 1440);
}

/**
 * Aggregate self-healing dashboard data from all sources
 */
async function getSelfHealingDashboardData() {
  // Get circuit breaker data
  const httpClients = getAllClientStats();
  const circuitStats = getAllCircuitStats();
  const unhealthyClients = getUnhealthyClients();

  // Get anomaly history (last hour)
  const anomalyHistory = getAnomalyHistory(60);

  // Get restart history
  const restartHistory = getRestartHistory();

  // Calculate overall health
  const openCircuits = httpClients.filter((c) => c.state === 'open').length;
  const halfOpenCircuits = httpClients.filter((c) => c.state === 'half_open').length;
  const unhealthyCount = unhealthyClients.length;

  let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
  if (openCircuits > 2 || unhealthyCount > 2) {
    overallHealth = 'critical';
  } else if (openCircuits > 0 || halfOpenCircuits > 0 || unhealthyCount > 0) {
    overallHealth = 'degraded';
  }

  // Calculate anomalies in last 5 minutes
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  const anomaliesLast5Min = anomalyHistory.filter(
    (a) => a.timestamp && new Date(a.timestamp).getTime() > fiveMinutesAgo && a.isAnomaly
  ).length;

  // Get successful auto-heals today (restarts that succeeded)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const autoHealsToday = restartHistory.filter(
    (r) => r.success && new Date(r.timestamp).getTime() > todayStart.getTime()
  ).length;

  // Calculate uptime based on circuit health over time
  const totalCircuits = httpClients.length || 1;
  const healthyCircuits = httpClients.filter((c) => c.state === 'closed').length;
  const uptimePercent = healthyCircuits / totalCircuits;

  // Transform circuit data for dashboard
  const circuits = httpClients.map((client) => {
    const total = client.totalRequests || 1;
    const successRate = ((client.totalSuccesses || 0) / total) * 100;
    return {
      name: client.name,
      state: client.state,
      successRate: `${successRate.toFixed(1)}%`,
      totalRequests: client.totalRequests || 0,
      failures: client.failures || 0,
      lastStateChange: client.lastStateChange,
    };
  });

  // Health monitors (derived from circuit breakers - maps to services)
  const healthMonitors = httpClients.map((client) => ({
    name: client.name,
    displayName: formatServiceName(client.name),
    healthy: client.state === 'closed',
    latencyMs: undefined, // Not tracked in circuit stats
    lastCheck: client.lastStateChange ? new Date(client.lastStateChange).toISOString() : undefined,
  }));

  return {
    overallHealth,
    circuits,
    healthMonitors,
    anomalyHistory: anomalyHistory.slice(0, 60), // Last 60 data points
    restartHistory: restartHistory.slice(0, 10), // Last 10 restarts
    stats: {
      anomaliesLast5Min,
      autoHealsToday,
      uptimePercent,
      totalCircuits,
      healthyCircuits,
      openCircuits,
      halfOpenCircuits,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get semantic routing metrics for the admin dashboard
 */
function getSemanticRoutingMetrics() {
  // Get aggregate metrics from semantic router
  const aggregate = getAggregateMetrics();
  const { hourly } = getSemanticDashboardData();

  // Learning metrics (corrections, etc.)
  // Note: This is a simplified version - could be expanded with Firestore data
  const learning = {
    totalCorrections: 0,
    correctionRate: 0,
    recentCorrections: [] as Array<{
      query: string;
      predicted: string;
      actual: string;
      timestamp: string;
    }>,
  };

  // A/B test status from agent evolution
  const evolution = getAgentEvolution();
  const evolutionStates = evolution.exportState();
  const allExperiments: Array<{
    id: string;
    name: string;
    status: string;
    variants: number;
  }> = [];

  for (const state of evolutionStates.values()) {
    for (const exp of state.experiments) {
      allExperiments.push({
        id: exp.id,
        name: exp.name,
        status: exp.status,
        variants: 2, // control + treatment
      });
    }
  }

  const abTests = {
    active: allExperiments.filter((e) => e.status === 'running').length,
    experiments: allExperiments.slice(0, 10),
  };

  // Proactive suggestions
  const proactiveStats = getProactiveStats();
  const proactive = {
    suggestionsToday: proactiveStats.totalSuggestions,
    acceptanceRate: proactiveStats.acceptanceRate,
  };

  // Community patterns (from intelligence layer)
  const communityInsights = getCommunityInsights();
  const insightsStats = communityInsights.getStats();
  const community = {
    totalPatterns: insightsStats.totalPatterns,
    avgConfidence: insightsStats.avgPatternConfidence,
    lastAggregation: null as string | null,
  };

  // ================================================================
  // 📊 ROUTING PATH BREAKDOWN (semantic vs JSON workaround vs native)
  // This shows which tool calling path handles each request
  // ================================================================
  const routingPathStats = getAggregateRoutingStats();
  const routingPaths = {
    totalToolCalls: routingPathStats.totalToolCalls,
    semanticAutoExecute: routingPathStats.totalSemanticAutoExecute,
    jsonWorkaround: routingPathStats.totalJsonFallback,
    // Native function calling = total - (semantic + json workaround)
    // This is the "blind spot" that can cause issues with SSML tools
    nativeFunctionCalling:
      routingPathStats.totalToolCalls -
      routingPathStats.totalSemanticAutoExecute -
      routingPathStats.totalJsonFallback,
    efficiency: `${routingPathStats.avgEfficiency.toFixed(1)}%`,
    activeSessions: routingPathStats.totalSessions,
    note: 'Native function calling may fail for SSML tools (news, weather)',
  };

  return {
    aggregate,
    routingPaths,
    learning,
    abTests,
    proactive,
    community,
    hourly,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get Redis metrics for cross-instance caching and messaging
 */
async function getRedisMetrics() {
  const metrics: {
    connected: boolean;
    caches: Array<{ name: string; stats: Record<string, unknown> }>;
    pubsub: { enabled: boolean; channels: string[] };
    circuitBreakers: Array<{ name: string; state: string; failures: number }>;
    timestamp: string;
  } = {
    connected: false,
    caches: [],
    pubsub: { enabled: false, channels: [] },
    circuitBreakers: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // Check Redis connection
    const { getRedisCache } = await import('../memory/redis-cache.js');
    const redisCache = getRedisCache();
    metrics.connected = redisCache.isConnected();

    // Get cache stats from ManagedCache registry
    const { getAllCacheStats } = await import('../services/data-layer/memory-cache-manager.js');
    const cacheStats = getAllCacheStats();
    metrics.caches = Object.entries(cacheStats).map(([name, s]) => ({
      name,
      stats: {
        entries: s.entries,
        hits: s.hits,
        misses: s.misses,
        hitRate:
          s.hits + s.misses > 0 ? `${((s.hits / (s.hits + s.misses)) * 100).toFixed(1)}%` : 'N/A',
        evictions: s.evictions,
        estimatedSizeBytes: s.estimatedSizeBytes,
      },
    }));

    // Get Pub/Sub status
    try {
      const { getRedisPubSub, CHANNELS } = await import('../services/redis-pubsub.js');
      const pubsub = getRedisPubSub();
      metrics.pubsub = {
        enabled: pubsub.isAvailable(),
        channels: Object.values(CHANNELS),
      };
    } catch {
      // Pub/Sub not available
    }

    // Get Redis circuit breaker stats
    try {
      const { getAllRedisCircuitStats } =
        await import('../services/self-healing/redis-circuit-breaker.js');
      const circuitStats = getAllRedisCircuitStats();
      metrics.circuitBreakers = circuitStats.map((s) => ({
        name: s.name,
        state: s.state,
        failures: s.failures,
      }));
    } catch {
      // Redis circuit breakers not available
    }

    // Get persona insights cache stats
    try {
      const { getInsightsCacheStats } =
        await import('../intelligence/context-builders/persona-insights-cache.js');
      const insightsStats = getInsightsCacheStats();
      metrics.caches.push({
        name: 'persona-insights',
        stats: {
          totalSessions: insightsStats.totalSessions,
          totalEntries: insightsStats.totalEntries,
          pendingRefreshes: insightsStats.pendingRefreshes,
          redisL2Enabled: insightsStats.redisL2Enabled,
        },
      });
    } catch {
      // Persona insights cache not available
    }

    // Get semantic router cache stats
    try {
      const { getSemanticRouterCache } =
        await import('../tools/semantic-router/integration/redis-cache.js');
      const routerCache = getSemanticRouterCache();
      const routerStats = routerCache.getStats();
      metrics.caches.push({
        name: 'semantic-router',
        stats: { ...routerStats }, // Spread to convert to plain object
      });
    } catch {
      // Semantic router cache not available
    }
  } catch (error) {
    log.debug({ error: String(error) }, 'Error getting Redis metrics');
  }

  return metrics;
}

/**
 * Get collective learning & intelligence metrics
 */
function getIntelligenceMetrics() {
  // Get community insights metrics
  const communityInsights = getCommunityInsights();
  const insightsStats = communityInsights.getStats();
  const insightsData = communityInsights.exportInsights();

  // Get scheduler status
  const schedulerStatus = getCollectiveLearningSchedulerStatus();

  // Calculate derived metrics - top breakthrough questions
  const topQuestions = insightsData.effectiveQuestions
    .sort((a, b) => b.avgBreakthroughRate - a.avgBreakthroughRate)
    .slice(0, 5)
    .map((q) => ({
      pattern: q.questionPattern.slice(0, 100),
      personaId: q.personaId,
      topic: q.topic,
      breakthroughRate: `${(q.avgBreakthroughRate * 100).toFixed(1)}%`,
      sampleSize: q.sampleSize,
    }));

  // Top resonating stories
  const topStories = insightsData.storyResonance
    .sort((a, b) => b.overallEffectiveness - a.overallEffectiveness)
    .slice(0, 5)
    .map((s) => ({
      storyId: s.storyId,
      personaId: s.personaId,
      effectiveness: `${(s.overallEffectiveness * 100).toFixed(1)}%`,
      sampleSize: s.sampleSize,
      reactions: s.userReactions,
    }));

  // Response pattern insights - extract strategy effectiveness
  const topPatterns = insightsData.patterns.slice(0, 5).map((p) => ({
    id: p.id,
    context: p.context,
    topStrategy: p.strategies[0]
      ? {
          type: p.strategies[0].type,
          avgEngagement: p.strategies[0].avgEngagement.toFixed(2),
          sampleSize: p.strategies[0].sampleSize,
        }
      : null,
  }));

  return {
    scheduler: {
      isRunning: schedulerStatus.isRunning,
      uptimeMs: schedulerStatus.uptimeMs,
    },
    communityInsights: {
      totalPatterns: insightsStats.totalPatterns,
      totalEffectiveQuestions: insightsStats.totalEffectiveQuestions,
      totalStoryResonance: insightsStats.totalStoryResonance,
      avgPatternConfidence: insightsStats.avgPatternConfidence,
    },
    topBreakthroughQuestions: topQuestions,
    topResonatingStories: topStories,
    topResponsePatterns: topPatterns,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Format service name for display
 */
function formatServiceName(name: string): string {
  // Convert snake_case or kebab-case to Title Case
  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Handle observability API routes
 */
export async function handleObservabilityRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/observability routes
  if (!pathname.startsWith('/api/observability')) {
    return false;
  }

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // Write operations (clear) require admin access
  if (req.method === 'POST') {
    const auth = await requireAdmin(req, res);
    if (!auth) return true;
  } else {
    // Read operations require basic auth
    const auth = await requireAuth(req, res, { allowDevMode: true });
    if (!auth) return true;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const windowMinutes = getWindowMinutes(url);

  try {
    // GET /api/observability - Full snapshot
    if (pathname === '/api/observability' && req.method === 'GET') {
      const snapshot = observabilityHub.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/llm - LLM health
    if (pathname === '/api/observability/llm' && req.method === 'GET') {
      const snapshot = llmHealthMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/connection - Connection health
    if (pathname === '/api/observability/connection' && req.method === 'GET') {
      const snapshot = connectionHealthMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/ux - UX quality
    if (pathname === '/api/observability/ux' && req.method === 'GET') {
      const snapshot = uxQualityMetrics.getSnapshot(windowMinutes);
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/memory - Memory/RAG health
    if (pathname === '/api/observability/memory' && req.method === 'GET') {
      const snapshot = memoryMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/dynamic-memory - Dynamic memory system metrics
    // MEMORY FIX (Jan 2026): Enhanced with health status, knowledge graph, and human signal metrics
    if (pathname === '/api/observability/dynamic-memory' && req.method === 'GET') {
      try {
        const {
          getDynamicMemoryMetrics,
          getSTMStats,
          getMemoryHealthStatus,
          getKnowledgeGraphMetrics,
          getHumanSignalMetrics,
          getAttributionMetrics,
        } = await import('../memory/dynamic/index.js');
        const { getSyncStats } = await import('../memory/dynamic/firestore-spanner-sync.js');
        const { getDeepExtractionWorker } =
          await import('../memory/dynamic/deep-extraction-worker.js');
        const { isKnowledgeCaptureReady, isEntityStorePersistenceReady } =
          await import('../memory/knowledge-graph/index.js');

        const dynamicMetrics = getDynamicMemoryMetrics();
        const stmStats = getSTMStats();
        const syncStats = getSyncStats();
        const worker = getDeepExtractionWorker();
        const workerStats = worker?.getStats() ?? null;
        const workerHealth = worker?.getHealthStatus() ?? null;
        const healthStatus = getMemoryHealthStatus();
        const knowledgeGraphMetrics = getKnowledgeGraphMetrics();
        const humanSignalMetrics = getHumanSignalMetrics();
        const attributionMetrics = getAttributionMetrics();

        sendJSON(res, {
          // Overall health status (new Jan 2026)
          health: healthStatus,

          // Core dynamic memory metrics
          dynamicMemory: dynamicMetrics,
          stmBuffer: stmStats,
          syncService: syncStats,

          // Deep extraction worker
          deepExtractionWorker: {
            stats: workerStats,
            health: workerHealth,
          },

          // Knowledge graph (new Jan 2026)
          knowledgeGraph: {
            isReady: isKnowledgeCaptureReady(),
            entityStoreReady: isEntityStorePersistenceReady(),
            metrics: knowledgeGraphMetrics,
          },

          // Human signal extraction (new Jan 2026)
          humanSignals: humanSignalMetrics,

          // Memory attribution
          attribution: attributionMetrics,

          collectedAt: new Date().toISOString(),
        });
      } catch (error) {
        log.error(
          { error: String(error) },
          '🧠 [MEMORY-AUDIT] Dynamic memory metrics endpoint error'
        );
        sendJSON(res, {
          error: 'Dynamic memory metrics not available',
          message: String(error),
          // Provide partial health info even on error
          health: {
            overall: 'unhealthy',
            issues: [`Failed to collect metrics: ${String(error)}`],
          },
        });
      }
      return true;
    }

    // GET /api/observability/memory-intelligence - Memory Intelligence surfacing metrics
    if (pathname === '/api/observability/memory-intelligence' && req.method === 'GET') {
      try {
        const { getMemoryIntelligenceMetrics } =
          await import('../intelligence/memory-intelligence/index.js');
        const metrics = getMemoryIntelligenceMetrics();
        sendJSON(res, {
          success: true,
          timestamp: new Date().toISOString(),
          metrics,
        });
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to get memory intelligence metrics');
        sendJSON(res, {
          success: false,
          error: 'Failed to get memory intelligence metrics',
          timestamp: new Date().toISOString(),
        });
      }
      return true;
    }

    // GET /api/observability/cost - Cost tracking
    if (pathname === '/api/observability/cost' && req.method === 'GET') {
      const snapshot = costMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/errors - Error & recovery
    if (pathname === '/api/observability/errors' && req.method === 'GET') {
      const snapshot = errorMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/personas - Persona health
    if (pathname === '/api/observability/personas' && req.method === 'GET') {
      const snapshot = personaMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/alerts - Recent alerts
    if (pathname === '/api/observability/alerts' && req.method === 'GET') {
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const alerts = observabilityHub.getRecentAlerts(limit);
      sendJSON(res, { alerts, count: alerts.length });
      return true;
    }

    // GET /api/observability/self-healing - Self-healing dashboard data
    if (pathname === '/api/observability/self-healing' && req.method === 'GET') {
      const selfHealingData = await getSelfHealingDashboardData();
      sendJSON(res, selfHealingData);
      return true;
    }

    // GET /api/observability/intelligence - Collective learning & intelligence metrics
    if (pathname === '/api/observability/intelligence' && req.method === 'GET') {
      const intelligenceData = getIntelligenceMetrics();
      sendJSON(res, intelligenceData);
      return true;
    }

    // GET /api/observability/resilience - Resilience metrics (workers, cleanup, queues, circuit breakers)
    if (pathname === '/api/observability/resilience' && req.method === 'GET') {
      const snapshot = resilienceMetrics.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/observability/redis - Redis cache, pub/sub, and circuit breaker metrics
    if (pathname === '/api/observability/redis' && req.method === 'GET') {
      const redisData = await getRedisMetrics();
      sendJSON(res, redisData);
      return true;
    }

    // GET /api/observability/ftis - FTIS (Tool Intelligence) metrics
    // DEPRECATED: FTIS has been removed. Tool routing now uses LLM native function calling.
    if (pathname === '/api/observability/ftis' && req.method === 'GET') {
      sendJSON(res, {
        deprecated: true,
        message:
          'FTIS has been removed. Tool routing now uses LLM native function calling + semantic router.',
        replacement: '/api/observability/semantic-routing',
        collectedAt: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/observability/semantic-routing - Semantic router metrics
    if (pathname === '/api/observability/semantic-routing' && req.method === 'GET') {
      const semanticData = getSemanticRoutingMetrics();
      sendJSON(res, semanticData);
      return true;
    }

    // GET /api/observability/routing-dashboard - Comprehensive routing dashboard data
    // Phase 6: Production Polish - supports the admin routing dashboard UI
    if (pathname === '/api/observability/routing-dashboard' && req.method === 'GET') {
      try {
        // Get routing metrics
        const aggregate = getAggregateMetrics();
        const { hourly } = getSemanticDashboardData();
        const routingStats = getAggregateRoutingStats();

        // Get recent routing decisions for the table
        const recentRoutes = getRecentMetrics(20);

        // Get defense statistics
        const defense = getDefenseStats();

        // Get learning loop stats
        const learning = getOnlineLearningStats();

        // Calculate summary metrics
        const directExecutionRate =
          aggregate.totalRoutes > 0 ? aggregate.bypassedLLM / aggregate.totalRoutes : 0;
        const avgConfidence =
          recentRoutes.length > 0
            ? recentRoutes.reduce((sum, r) => sum + r.confidence, 0) / recentRoutes.length
            : 0;

        // Build confidence distribution histogram (10 buckets)
        const confidenceBuckets = Array(10).fill(0);
        for (const route of recentRoutes) {
          const bucket = Math.min(9, Math.floor(route.confidence * 10));
          confidenceBuckets[bucket]++;
        }

        // Get top routed tools
        const toolCounts = Object.entries(aggregate.toolBreakdown)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([toolId, count]) => ({
            toolId,
            count,
            percentage: aggregate.totalRoutes > 0 ? (count / aggregate.totalRoutes) * 100 : 0,
          }));

        // Build corrections list (learning opportunities)
        const corrections: Array<{
          query: string;
          predicted: string;
          actual: string;
          timestamp: string;
        }> = [];
        // Note: Corrections would come from a dedicated corrections store
        // For now, this is a placeholder - corrections are tracked in the learning loop

        sendJSON(res, {
          // Summary cards
          summary: {
            directExecutionRate: `${(directExecutionRate * 100).toFixed(1)}%`,
            avgConfidence: `${(avgConfidence * 100).toFixed(1)}%`,
            avgLatencyMs: aggregate.avgLatencyMs,
            p95LatencyMs: aggregate.p95LatencyMs,
            cacheHitRate: `${(aggregate.cacheHitRate * 100).toFixed(1)}%`,
            correctionRate:
              learning.pendingExamples > 0
                ? `${((learning.pendingExamples / Math.max(1, aggregate.totalRoutes)) * 100).toFixed(1)}%`
                : '0%',
            threatsBlocked: defense.inputsBlocked,
          },

          // Aggregate metrics
          aggregate: {
            totalRoutes: aggregate.totalRoutes,
            successfulRoutes: aggregate.successfulRoutes,
            bypassedLLM: aggregate.bypassedLLM,
            hints: aggregate.hints,
            conversations: aggregate.conversations,
            errors: aggregate.errors,
            matchPathBreakdown: aggregate.matchPathBreakdown,
          },

          // Routing paths breakdown
          routingPaths: {
            semanticAutoExecute: routingStats.totalSemanticAutoExecute,
            jsonWorkaround: routingStats.totalJsonFallback,
            nativeFunction:
              routingStats.totalToolCalls -
              routingStats.totalSemanticAutoExecute -
              routingStats.totalJsonFallback,
            efficiency: `${routingStats.avgEfficiency.toFixed(1)}%`,
          },

          // Confidence distribution for histogram
          confidenceDistribution: confidenceBuckets.map((count, i) => ({
            range: `${i * 10}-${(i + 1) * 10}%`,
            count,
          })),

          // Top routed tools
          topTools: toolCounts,

          // Top corrections (learning opportunities)
          topCorrections: corrections,

          // Defense system status
          defense: {
            totalInputs: defense.totalInputs,
            threatsDetected: defense.threatsDetected,
            inputsBlocked: defense.inputsBlocked,
            blockRate: `${(defense.blockRate * 100).toFixed(2)}%`,
            avgRiskScore: defense.avgRiskScore.toFixed(3),
            threatsByType: defense.threatsByType,
            threatsBySeverity: defense.threatsBySeverity,
          },

          // Learning loop status
          learning: {
            isActive: learning.isActive,
            pendingExamples: learning.pendingExamples,
            adjustedTools: learning.adjustedTools,
            lastRetrainTime: learning.lastRetrainTime
              ? new Date(learning.lastRetrainTime).toISOString()
              : null,
            recentRetrains: learning.recentStats.slice(-3),
          },

          // Hourly breakdown (for trends chart)
          hourly,

          // Recent routing decisions (for table)
          recentRoutes: recentRoutes.map((r) => ({
            timestamp: r.timestamp.toISOString(),
            userInput: r.userInput.slice(0, 50),
            toolId: r.toolId,
            confidence: r.confidence,
            matchPath: r.matchPath,
            action: r.action,
            latencyMs: r.latencyMs,
            cacheHit: r.cacheHit,
          })),

          collectedAt: new Date().toISOString(),
        });
      } catch (error) {
        log.error({ error: String(error) }, 'Failed to collect routing dashboard data');
        sendJSON(res, {
          error: 'Failed to collect routing dashboard data',
          message: String(error),
          collectedAt: new Date().toISOString(),
        });
      }
      return true;
    }

    // GET /api/observability/superhuman - Superhuman capability activation metrics
    if (pathname === '/api/observability/superhuman' && req.method === 'GET') {
      const limitParam = url.searchParams.get('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 50;
      const events = getSuperhumanActivationEvents(limit);
      const stats = getSuperhumanActivationStats();

      sendJSON(res, {
        stats,
        recentEvents: events,
        count: events.length,
        collectedAt: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/observability/bth - Better Than Human EQ telemetry
    if (pathname === '/api/observability/bth' && req.method === 'GET') {
      try {
        const { getBetterThanHumanTelemetry } =
          await import('../services/analytics/better-than-human-telemetry.js');
        const telemetry = getBetterThanHumanTelemetry();

        const daysParam = url.searchParams.get('days');
        const days = daysParam ? parseInt(daysParam, 10) : 7;
        const summary = telemetry.getSummary(days);

        sendJSON(res, {
          period: {
            days,
            start: summary.period.start.toISOString(),
            end: summary.period.end.toISOString(),
          },
          eq: {
            microExpressions: summary.eq.microExpressions,
            activeListening: summary.eq.activeListening,
            breathSync: summary.eq.breathSync,
            concernDetections: summary.eq.concernDetections,
            anticipations: summary.eq.anticipations,
            total:
              summary.eq.microExpressions +
              summary.eq.activeListening +
              summary.eq.breathSync +
              summary.eq.concernDetections +
              summary.eq.anticipations,
          },
          memory: {
            proactiveMemoriesSurfaced: summary.memory.proactiveMemoriesSurfaced,
            crossSessionReflections: summary.memory.crossSessionReflections,
            quotedMemoriesRecalled: summary.memory.quotedMemoriesRecalled,
          },
          celebration: summary.celebration,
          growth: {
            insightsDetected: summary.growth.insightsDetected,
            insightsSurfaced: summary.growth.insightsSurfaced,
            resonanceRate: `${(summary.growth.resonanceRate * 100).toFixed(1)}%`,
          },
          patterns: {
            patternsDetected: summary.patterns.patternsDetected,
            patternsSurfaced: summary.patterns.patternsSurfaced,
            resonanceRate: `${(summary.patterns.resonanceRate * 100).toFixed(1)}%`,
          },
          outreach: {
            ...summary.outreach,
            responseRate: `${(summary.outreach.responseRate * 100).toFixed(1)}%`,
          },
          userReactions: {
            ...summary.userReactions,
            positiveRate: `${(summary.userReactions.positiveRate * 100).toFixed(1)}%`,
          },
          collectedAt: new Date().toISOString(),
        });
      } catch (error) {
        log.warn({ error: String(error) }, 'BTH telemetry not available');
        sendJSON(res, {
          error: 'BTH telemetry not available',
          reason: String(error),
        });
      }
      return true;
    }

    // GET /api/observability/function-call-health - Function calling reliability metrics (Jan 2026)
    if (pathname === '/api/observability/function-call-health' && req.method === 'GET') {
      const dashboard = getFunctionCallHealthDashboard();
      const geminiHealth = getGeminiHealthMetrics();

      sendJSON(res, {
        health: dashboard.health,
        recommendations: dashboard.recommendations,
        trends: dashboard.trends,
        gemini: {
          isGemini: geminiHealth.isGemini,
          status: geminiHealth.status,
          activeSessions: geminiHealth.activeSessions,
          aggregate: geminiHealth.aggregate,
          recentLeakages: geminiHealth.recentLeakages,
          thresholds: geminiHealth.thresholds,
          recommendation: geminiHealth.recommendation,
        },
        collectedAt: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/observability/tts-gateway - TTS Gateway metrics
    if (pathname === '/api/observability/tts-gateway' && req.method === 'GET') {
      try {
        const { getGatewayTTSMetrics, isTTSGatewayEnabled } =
          await import('../speech/tts-gateway/index.js');
        const { getTTSCache } = await import('../services/tts/index.js');

        const gatewayMetrics = getGatewayTTSMetrics();
        const cache = getTTSCache();
        const cacheStats = cache?.getStats() ?? null;

        sendJSON(res, {
          enabled: isTTSGatewayEnabled(),
          gateway: gatewayMetrics,
          cache: cacheStats,
          summary: {
            cacheHitRate:
              gatewayMetrics.totalRequests > 0
                ? `${((gatewayMetrics.cacheHits / gatewayMetrics.totalRequests) * 100).toFixed(1)}%`
                : 'N/A',
            avgLatencyMs: {
              cacheHit: gatewayMetrics.avgCacheHitLatencyMs.toFixed(0),
              synthesis: gatewayMetrics.avgSynthesisLatencyMs.toFixed(0),
            },
            totalSavedLatencyMs: gatewayMetrics.totalSavedLatencyMs,
            errorRate:
              gatewayMetrics.totalRequests > 0
                ? `${((gatewayMetrics.errors / gatewayMetrics.totalRequests) * 100).toFixed(1)}%`
                : 'N/A',
          },
          collectedAt: new Date().toISOString(),
        });
      } catch (error) {
        sendJSON(res, {
          error: 'TTS Gateway metrics not available',
          message: String(error),
        });
      }
      return true;
    }

    // GET /api/observability/injections - BTH Injection effectiveness metrics (Phase 1 Communication System Overhaul)
    if (pathname === '/api/observability/injections' && req.method === 'GET') {
      const injectionData = getInjectionMetrics();
      sendJSON(res, {
        ...injectionData,
        collectedAt: new Date().toISOString(),
      });
      return true;
    }

    // GET /api/observability/native-bindings - ONNX/Transformers health (circuit breakers, crashes)
    if (pathname === '/api/observability/native-bindings' && req.method === 'GET') {
      const { getNativeBindingHealth } = await import('../utils/transformers-loader.js');
      const { getAllNativeBindingStats } = await import('../utils/native-binding-guard.js');

      sendJSON(res, {
        health: getNativeBindingHealth(),
        allGuards: getAllNativeBindingStats(),
        collectedAt: new Date().toISOString(),
      });
      return true;
    }

    // POST /api/observability/native-bindings/reset - Reset circuit breakers (admin only)
    if (pathname === '/api/observability/native-bindings/reset' && req.method === 'POST') {
      // Require admin for this operation
      const auth = await requireAdmin(req, res);
      if (!auth) return true;

      const { resetCircuitBreakers } = await import('../utils/transformers-loader.js');
      resetCircuitBreakers();

      sendJSON(res, {
        message: 'Native binding circuit breakers reset',
        timestamp: new Date().toISOString(),
      });
      log.warn({ admin: auth.userId }, 'Native binding circuit breakers reset via API');
      return true;
    }

    // POST /api/observability/clear - Clear all metrics
    if (pathname === '/api/observability/clear' && req.method === 'POST') {
      observabilityHub.clearAlerts();
      sendJSON(res, { message: 'All observability metrics cleared' });
      log.info('All observability metrics cleared via API');
      return true;
    }

    // Unknown observability route
    sendError(res, 'Unknown observability endpoint', 404);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    log.error({ error: err }, 'Observability API error');
    sendError(res, message, 500);
    return true;
  }
}
