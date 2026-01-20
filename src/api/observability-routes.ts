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
import {
  getAggregateMetrics,
  getDashboardData as getSemanticDashboardData,
} from '../tools/semantic-router/integration/metrics.js';
import { getProactiveStats } from '../tools/semantic-router/advanced/proactive-suggestions.js';
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

// ============================================================================
// SUPERHUMAN ACTIVATION OBSERVABILITY
// Tracks when superhuman capabilities are activated during conversations
// ============================================================================

export interface SuperhumanActivationEvent {
  userId: string;
  persona: string;
  capabilities: string[];
  cacheHit: boolean;
  durationMs: number;
  timestamp: string;
}

const superhumanActivationEvents: SuperhumanActivationEvent[] = [];
const MAX_SUPERHUMAN_EVENTS = 100;

/**
 * Emit a superhuman activation event for monitoring/debugging
 * Used by superhuman-integration.ts when capabilities are loaded
 *
 * @param event Event data including which capabilities were activated
 */
export function emitSuperhumanActivation(
  event: Omit<SuperhumanActivationEvent, 'timestamp'>
): void {
  const fullEvent: SuperhumanActivationEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Add to buffer (ring buffer behavior)
  superhumanActivationEvents.push(fullEvent);
  if (superhumanActivationEvents.length > MAX_SUPERHUMAN_EVENTS) {
    superhumanActivationEvents.shift();
  }

  // Log at debug level for immediate observability
  log.debug(
    { persona: event.persona, capabilities: event.capabilities.length, cacheHit: event.cacheHit },
    `🦸 Superhuman activated: ${event.capabilities.length} capabilities for ${event.persona}`
  );
}

/**
 * Get recent superhuman activation events
 * @param limit Max number of events to return (default: 50)
 */
export function getSuperhumanActivationEvents(limit = 50): SuperhumanActivationEvent[] {
  return superhumanActivationEvents.slice(-limit);
}

/**
 * Get superhuman activation statistics
 */
export function getSuperhumanActivationStats(): {
  totalActivations: number;
  cacheHitRate: number;
  avgDurationMs: number;
  byPersona: Record<string, number>;
  topCapabilities: Array<{ capability: string; count: number }>;
} {
  if (superhumanActivationEvents.length === 0) {
    return {
      totalActivations: 0,
      cacheHitRate: 0,
      avgDurationMs: 0,
      byPersona: {},
      topCapabilities: [],
    };
  }

  const totalActivations = superhumanActivationEvents.length;
  const cacheHits = superhumanActivationEvents.filter((e) => e.cacheHit).length;
  const totalDuration = superhumanActivationEvents.reduce((sum, e) => sum + e.durationMs, 0);

  // Count by persona
  const byPersona: Record<string, number> = {};
  for (const event of superhumanActivationEvents) {
    byPersona[event.persona] = (byPersona[event.persona] || 0) + 1;
  }

  // Count capabilities
  const capabilityCounts: Record<string, number> = {};
  for (const event of superhumanActivationEvents) {
    for (const cap of event.capabilities) {
      capabilityCounts[cap] = (capabilityCounts[cap] || 0) + 1;
    }
  }

  // Sort capabilities by count
  const topCapabilities = Object.entries(capabilityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([capability, count]) => ({ capability, count }));

  return {
    totalActivations,
    cacheHitRate: Math.round((cacheHits / totalActivations) * 100) / 100,
    avgDurationMs: Math.round(totalDuration / totalActivations),
    byPersona,
    topCapabilities,
  };
}

/**
 * Emit a tool intelligence event for monitoring/debugging
 * Used by unified-tool-orchestrator.ts and other tool intelligence components
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
    if (pathname === '/api/observability/dynamic-memory' && req.method === 'GET') {
      try {
        const { getDynamicMemoryMetrics, getSTMStats } = await import('../memory/dynamic/index.js');
        const { getSyncStats } = await import('../memory/dynamic/firestore-spanner-sync.js');
        const { getDeepExtractionWorker } =
          await import('../memory/dynamic/deep-extraction-worker.js');

        const dynamicMetrics = getDynamicMemoryMetrics();
        const stmStats = getSTMStats();
        const syncStats = getSyncStats();
        const worker = getDeepExtractionWorker();
        const workerStats = worker?.getStats() ?? null;

        sendJSON(res, {
          dynamicMemory: dynamicMetrics,
          stmBuffer: stmStats,
          syncService: syncStats,
          deepExtractionWorker: workerStats,
          collectedAt: new Date().toISOString(),
        });
      } catch (error) {
        sendJSON(res, {
          error: 'Dynamic memory metrics not available',
          message: String(error),
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
    if (pathname === '/api/observability/ftis' && req.method === 'GET') {
      try {
        const { getFTISIntegration } = await import('../tools/intelligence/ftis-integration.js');
        const { getFTISHealth, getFTISV2Metrics } =
          await import('../services/observability/ftis-metrics.js');
        const { isFTISV2OnlyMode } = await import('../agents/processors/ftis-v2-integration.js');

        const ftis = getFTISIntegration();
        const metrics = ftis.getMetrics();
        const patterns = ftis.getToolPatterns();
        const health = getFTISHealth();
        const ftisV2Active = isFTISV2OnlyMode();

        const response: Record<string, unknown> = {
          transitionMatrix: metrics.transitionMatrix,
          planner: metrics.planner,
          learner: metrics.learner,
          topPatterns: patterns.slice(0, 10),
          health: {
            status: health.status,
            mode: health.mode,
            accuracy: health.metrics.accuracy,
          },
          collectedAt: new Date().toISOString(),
        };

        // Add FTIS V2 specific metrics when enabled
        if (ftisV2Active) {
          const v2Metrics = getFTISV2Metrics();
          response.ftisV2 = {
            enabled: true,
            directExecutionCount: v2Metrics.directExecutionCount,
            directExecutionRate: `${(v2Metrics.directExecutionRate * 100).toFixed(1)}%`,
            avgLatencyMs: v2Metrics.avgDirectLatencyMs,
            p95LatencyMs: v2Metrics.p95DirectLatencyMs,
            jsonWorkaroundBypassCount: v2Metrics.jsonWorkaroundBypassCount,
            fallbackRate: `${(v2Metrics.fallbackRate * 100).toFixed(1)}%`,
            successRate: `${(v2Metrics.successRate * 100).toFixed(1)}%`,
            executionsByCategory: v2Metrics.executionsByCategory,
          };
        } else {
          response.ftisV2 = { enabled: false };
        }

        sendJSON(res, response);
      } catch (error) {
        sendJSON(res, {
          error: 'FTIS metrics not available',
          message: String(error),
        });
      }
      return true;
    }

    // GET /api/observability/semantic-routing - Semantic router metrics
    if (pathname === '/api/observability/semantic-routing' && req.method === 'GET') {
      const semanticData = getSemanticRoutingMetrics();
      sendJSON(res, semanticData);
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
