/**
 * Performance Monitoring API Routes
 *
 * Exposes performance metrics, memory usage, alerts, and trigger analytics.
 *
 * Routes:
 * - GET  /api/performance              - Full performance report
 * - GET  /api/performance/summary      - Quick summary
 * - GET  /api/performance/memory       - Current memory usage
 * - GET  /api/performance/alerts       - Active memory alerts
 * - POST /api/performance/alerts/:id/acknowledge - Acknowledge an alert
 * - POST /api/performance/config       - Update alert thresholds
 * - GET  /api/performance/tools        - Tool loading metrics
 * - GET  /api/performance/voice-dashboard - Combined voice agent dashboard (incl triggers)
 * - GET  /api/performance/triggers     - Dynamic trigger analytics (pattern matching)
 * - GET  /api/performance/triggers/semantic - Semantic trigger analytics (Phase 1)
 * - POST /api/performance/triggers/reset - Reset trigger analytics (pattern + semantic)
 *
 * @module PerformanceRoutes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { z } from 'zod';
import { createLogger } from '../utils/safe-logger.js';
import { rateLimit, requireAuth } from './auth-middleware.js';
import { handleCorsPreflightIfNeeded, parseBody, sendError, sendJSON } from './helpers.js';
import { perfInstrumentation } from '../services/performance/performance-instrumentation.js';
import { getLoadedDomains, isDomainLoaded } from '../tools/index.js';

// Voice agent performance metrics (via services layer to avoid architecture violation)
import {
  getGlobalPerformanceSummary,
  PERFORMANCE_THRESHOLDS,
  getToolCacheMetrics,
  getSpeculativeTTSMetrics,
  getReliabilityDashboard,
} from '../services/performance/performance-metrics.js';
import {
  getTriggerAnalytics,
  resetTriggerAnalytics,
} from '../intelligence/context-builders/dynamic-trigger-utils.js';
import {
  getSemanticAnalytics,
  resetSemanticAnalytics,
  getTriggerEmbeddingService,
  getTriggerEmbeddingCache,
} from '../intelligence/triggers/index.js';

const log = createLogger({ module: 'PerformanceRoutes' });

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const PerformanceConfigSchema = z.object({
  warningThresholdMB: z.number().optional(),
  criticalThresholdMB: z.number().optional(),
  checkIntervalMs: z.number().optional(),
  enableAutoCheck: z.boolean().optional(),
});

// Base path for these routes
const BASE_PATH = '/api/performance';

// ============================================================================
// UTILITIES
// ============================================================================

// parseBody imported from './helpers.js'

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all performance monitoring routes
 * @returns true if the request was handled
 */
export async function handlePerformanceRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/performance routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting
  if (rateLimit(req, res, { maxRequests: 60, windowMs: 60000 })) {
    return true;
  }

  // All performance routes require auth (allow dev mode)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // FULL PERFORMANCE REPORT
    // ========================================================================
    if ((subPath === '/' || subPath === '/report') && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        ...report,
        toolDomains: {
          loaded: getLoadedDomains(),
          count: getLoadedDomains().length,
        },
      });
      return true;
    }

    // ========================================================================
    // QUICK SUMMARY
    // ========================================================================
    if (subPath === '/summary' && method === 'GET') {
      const summary = perfInstrumentation.getSummary();
      sendJSON(res, {
        ...summary,
        loadedDomains: getLoadedDomains(),
      });
      return true;
    }

    // ========================================================================
    // CURRENT MEMORY
    // ========================================================================
    if (subPath === '/memory' && method === 'GET') {
      const memory = perfInstrumentation.getCurrentMemory();
      const config = perfInstrumentation.getAlertConfig();
      sendJSON(res, {
        current: memory,
        thresholds: {
          warningMB: config.warningThresholdMB,
          criticalMB: config.criticalThresholdMB,
        },
        status:
          memory.heapUsedMB >= config.criticalThresholdMB
            ? 'critical'
            : memory.heapUsedMB >= config.warningThresholdMB
              ? 'warning'
              : 'healthy',
      });
      return true;
    }

    // ========================================================================
    // MEMORY ALERTS
    // ========================================================================
    if (subPath === '/alerts' && method === 'GET') {
      const alerts = perfInstrumentation.getAlerts();
      const activeAlerts = perfInstrumentation.getActiveAlerts();
      sendJSON(res, {
        alerts,
        activeCount: activeAlerts.length,
        totalCount: alerts.length,
      });
      return true;
    }

    // ========================================================================
    // ACKNOWLEDGE ALERT
    // ========================================================================
    if (subPath.startsWith('/alerts/') && subPath.endsWith('/acknowledge') && method === 'POST') {
      const alertId = subPath.replace('/alerts/', '').replace('/acknowledge', '');
      const success = perfInstrumentation.acknowledgeAlert(alertId);

      if (success) {
        sendJSON(res, { acknowledged: true, alertId });
      } else {
        sendError(res, 'Alert not found', 404);
      }
      return true;
    }

    // ========================================================================
    // UPDATE ALERT CONFIG
    // ========================================================================
    if (subPath === '/config' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const result = PerformanceConfigSchema.safeParse(body);
      if (!result.success) {
        sendError(res, result.error.issues[0]?.message || 'Invalid config', 400);
        return true;
      }

      const { warningThresholdMB, criticalThresholdMB, checkIntervalMs, enableAutoCheck } =
        result.data;

      const config: Record<string, unknown> = {};
      if (warningThresholdMB !== undefined) config.warningThresholdMB = warningThresholdMB;
      if (criticalThresholdMB !== undefined) config.criticalThresholdMB = criticalThresholdMB;
      if (checkIntervalMs !== undefined) config.checkIntervalMs = checkIntervalMs;
      if (enableAutoCheck !== undefined) {
        config.enableAutoCheck = enableAutoCheck;
        // Start/stop auto monitoring based on setting
        if (enableAutoCheck) {
          perfInstrumentation.startAutoMonitoring();
        } else {
          perfInstrumentation.stopAutoMonitoring();
        }
      }

      perfInstrumentation.configureAlerts(config);

      sendJSON(res, {
        updated: true,
        config: perfInstrumentation.getAlertConfig(),
      });
      return true;
    }

    // ========================================================================
    // TOOL LOADING METRICS
    // ========================================================================
    if (subPath === '/tools' && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        ...report.toolLoading,
        loadedDomains: getLoadedDomains(),
      });
      return true;
    }

    // ========================================================================
    // CHECK DOMAIN STATUS
    // ========================================================================
    if (subPath.startsWith('/tools/domain/') && method === 'GET') {
      const domain = subPath.replace('/tools/domain/', '');
      sendJSON(res, {
        domain,
        loaded: isDomainLoaded(domain as never),
      });
      return true;
    }

    // ========================================================================
    // PHASES (timing data)
    // ========================================================================
    if (subPath === '/phases' && method === 'GET') {
      const report = perfInstrumentation.getReport();
      sendJSON(res, {
        phases: report.phases,
        criticalPath: report.summary.criticalPath,
        slowestPhases: report.summary.slowestPhases,
      });
      return true;
    }

    // ========================================================================
    // SNAPSHOT MEMORY (trigger a new snapshot)
    // ========================================================================
    if (subPath === '/snapshot' && method === 'POST') {
      const body = await parseBody<Record<string, unknown>>(req);
      const label = (body.label as string) || `api-snapshot-${Date.now()}`;
      const snapshot = perfInstrumentation.snapshotMemory(label);
      sendJSON(res, { snapshot });
      return true;
    }

    // ========================================================================
    // VOICE AGENT TURN PROFILING METRICS
    // ========================================================================
    if (subPath === '/turns' && method === 'GET') {
      const turnMetrics = getGlobalPerformanceSummary();
      sendJSON(res, {
        ...turnMetrics,
        thresholds: PERFORMANCE_THRESHOLDS,
      });
      return true;
    }

    // ========================================================================
    // TOOL RESPONSE CACHE METRICS
    // ========================================================================
    if (subPath === '/tool-cache' && method === 'GET') {
      const cacheMetrics = getToolCacheMetrics();
      const hitRate =
        cacheMetrics.hits + cacheMetrics.misses > 0
          ? ((cacheMetrics.hits / (cacheMetrics.hits + cacheMetrics.misses)) * 100).toFixed(1)
          : '0.0';
      sendJSON(res, {
        ...cacheMetrics,
        hitRatePercent: parseFloat(hitRate),
        estimatedTimeSavedMs: cacheMetrics.totalSavedMs,
      });
      return true;
    }

    // ========================================================================
    // SPECULATIVE TTS METRICS
    // ========================================================================
    if (subPath === '/tts' && method === 'GET') {
      const ttsMetrics = getSpeculativeTTSMetrics();
      const cacheHitRate =
        ttsMetrics.totalRequests > 0
          ? (
              ((ttsMetrics.cacheHits + ttsMetrics.speculativeHits) / ttsMetrics.totalRequests) *
              100
            ).toFixed(1)
          : '0.0';
      sendJSON(res, {
        ...ttsMetrics,
        cacheHitRatePercent: parseFloat(cacheHitRate),
        estimatedLatencySavedMs: ttsMetrics.savedLatencyMs,
      });
      return true;
    }

    // ========================================================================
    // COMBINED VOICE AGENT DASHBOARD
    // ========================================================================
    if (subPath === '/voice-dashboard' && method === 'GET') {
      const turnMetrics = getGlobalPerformanceSummary();
      const toolCache = getToolCacheMetrics();
      const tts = getSpeculativeTTSMetrics();
      const reliability = getReliabilityDashboard();
      const triggers = getTriggerAnalytics();
      const semanticTriggers = getSemanticAnalytics();

      sendJSON(res, {
        summary: {
          avgTurnMs: turnMetrics.avgTurnMs,
          slowTurnPercentage: turnMetrics.slowTurnPercentage,
          toolCacheHitRate:
            toolCache.hits + toolCache.misses > 0
              ? `${((toolCache.hits / (toolCache.hits + toolCache.misses)) * 100).toFixed(1)}%`
              : 'N/A',
          ttsCacheHitRate:
            tts.totalRequests > 0
              ? `${(((tts.cacheHits + tts.speculativeHits) / tts.totalRequests) * 100).toFixed(1)}%`
              : 'N/A',
          totalEstimatedSavingsMs: toolCache.totalSavedMs + tts.savedLatencyMs,
          toolSuccessRate: reliability.summary.overallSuccessRate,
          openCircuits: reliability.summary.openCircuits,
          // Trigger metrics (pattern matching)
          triggersChecked: triggers.summary.totalChecked,
          triggersMatched: triggers.summary.totalMatched,
          triggersFired: triggers.summary.totalFired,
          triggerMatchRate: `${(triggers.summary.matchRate * 100).toFixed(1)}%`,
          triggerFireRate: `${(triggers.summary.fireRate * 100).toFixed(1)}%`,
          // Semantic trigger metrics (Phase 1)
          semanticHybridMatches: semanticTriggers.totalHybridMatches,
          semanticAvgScore: semanticTriggers.averageSemanticScore.toFixed(3),
          semanticAvgProcessingMs: semanticTriggers.averageProcessingMs.toFixed(2),
        },
        turns: turnMetrics,
        toolCache,
        speculativeTts: tts,
        reliability: reliability.summary,
        triggers: {
          summary: triggers.summary,
          topTriggers: triggers.byTrigger.slice(0, 5),
          topBuilders: triggers.byBuilder.slice(0, 5),
          // Semantic matching summary
          semantic: {
            hybridMatches: semanticTriggers.totalHybridMatches,
            semanticOnly: semanticTriggers.totalSemanticOnly,
            patternOnly: semanticTriggers.totalPatternOnly,
            avgSemanticScore: semanticTriggers.averageSemanticScore.toFixed(3),
            avgPatternScore: semanticTriggers.averagePatternScore.toFixed(3),
            avgProcessingMs: semanticTriggers.averageProcessingMs.toFixed(2),
          },
        },
        thresholds: PERFORMANCE_THRESHOLDS,
      });
      return true;
    }

    // ========================================================================
    // TOOL RELIABILITY METRICS (retry, circuit breaker)
    // ========================================================================
    if (subPath === '/reliability' && method === 'GET') {
      const reliability = getReliabilityDashboard();
      sendJSON(res, reliability);
      return true;
    }

    // ========================================================================
    // DYNAMIC TRIGGER METRICS
    // ========================================================================
    if (subPath === '/triggers' && method === 'GET') {
      const triggers = getTriggerAnalytics();

      // Serialize timestamps for JSON
      const serializedRecentActivations = triggers.recentActivations.map((a) => ({
        ...a,
        timestamp: a.timestamp.toISOString(),
      }));

      sendJSON(res, {
        summary: triggers.summary,
        byTrigger: triggers.byTrigger,
        byBuilder: triggers.byBuilder,
        recentActivations: serializedRecentActivations,
      });
      return true;
    }

    // ========================================================================
    // RESET TRIGGER METRICS (admin only)
    // ========================================================================
    if (subPath === '/triggers/reset' && method === 'POST') {
      resetTriggerAnalytics();
      resetSemanticAnalytics();
      sendJSON(res, { success: true, message: 'Trigger analytics reset (pattern + semantic)' });
      log.info({}, 'Trigger analytics reset via performance API');
      return true;
    }

    // ========================================================================
    // SEMANTIC TRIGGER METRICS (Phase 1: Semantic Core)
    // ========================================================================
    if (subPath === '/triggers/semantic' && method === 'GET') {
      const semanticStats = getSemanticAnalytics();
      const embeddingService = getTriggerEmbeddingService();
      const embeddingCache = getTriggerEmbeddingCache();

      const serviceStats = embeddingService.getStats();
      const cacheStats = embeddingCache.getStats();

      sendJSON(res, {
        matching: {
          totalHybridMatches: semanticStats.totalHybridMatches,
          totalSemanticOnly: semanticStats.totalSemanticOnly,
          totalPatternOnly: semanticStats.totalPatternOnly,
          averageSemanticScore: semanticStats.averageSemanticScore.toFixed(3),
          averagePatternScore: semanticStats.averagePatternScore.toFixed(3),
          averageProcessingMs: semanticStats.averageProcessingMs.toFixed(2),
        },
        byCategory: semanticStats.byCategoryArray,
        embeddings: {
          totalTriggers: serviceStats.totalTriggers,
          byPersona: serviceStats.byPersona,
          byCategory: serviceStats.byCategory,
          model: serviceStats.model,
          dimensions: serviceStats.embeddingDimensions,
        },
        cache: {
          memorySize: cacheStats.memorySize,
          maxSize: cacheStats.maxSize,
          hitRate: `${(cacheStats.hitRate * 100).toFixed(1)}%`,
          memoryHits: cacheStats.memoryHits,
          memoryMisses: cacheStats.memoryMisses,
          firestoreHits: cacheStats.firestoreHits,
          firestoreMisses: cacheStats.firestoreMisses,
          firestoreEnabled: cacheStats.firestoreEnabled,
        },
      });
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Performance API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handlePerformanceRoutes };
