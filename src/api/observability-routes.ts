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
 * - GET /api/observability/cost - Cost tracking metrics
 * - GET /api/observability/errors - Error & recovery metrics
 * - GET /api/observability/personas - Persona health metrics
 * - GET /api/observability/alerts - Recent alerts
 * - GET /api/observability/self-healing - Self-healing dashboard (circuits, anomalies, restarts)
 * - GET /api/observability/intelligence - Collective learning & intelligence metrics
 * - GET /api/observability/resilience - Resilience metrics (workers, cleanup, queues, circuits)
 * - POST /api/observability/clear - Clear all metrics
 */

import type { IncomingMessage, ServerResponse } from 'http';
import {
  getCollectiveLearningSchedulerStatus,
  getCommunityInsights,
} from '../intelligence/index.js';
import {
  connectionHealthMetrics,
  costMetrics,
  errorMetrics,
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

    // GET /api/observability/semantic-routing - Semantic router metrics
    if (pathname === '/api/observability/semantic-routing' && req.method === 'GET') {
      const semanticData = getSemanticRoutingMetrics();
      sendJSON(res, semanticData);
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
