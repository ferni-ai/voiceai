/**
 * Intelligent Routing Observability
 *
 * Comprehensive metrics and monitoring for the intelligent routing system:
 * - Strategy-level latency tracking
 * - Accuracy metrics per strategy
 * - Bandit convergence visualization
 * - Error rates and fallback frequency
 * - Real-time dashboard data
 *
 * @module semantic-router/advanced/intelligent/observability
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import type { RoutingDecision, RoutingStrategy } from './orchestrator.js';

const log = createLogger({ module: 'intelligent-observability' });

// ============================================================================
// TYPES
// ============================================================================

export interface RoutingMetricEvent {
  timestamp: Date;
  eventType: 'route' | 'outcome' | 'error' | 'fallback';
  userId: string;
  sessionId: string;
  personaId: string;
  input: string;
  strategy: RoutingStrategy;
  toolId: string | null;
  confidence: number;
  latencyMs: number;
  success?: boolean;
  error?: string;
}

export interface StrategyMetrics {
  strategy: RoutingStrategy;
  totalCalls: number;
  successfulRoutes: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgConfidence: number;
  errorRate: number;
  fallbackRate: number;
}

export interface DashboardData {
  summary: {
    totalRoutes: number;
    avgLatencyMs: number;
    overallAccuracy: number;
    activeStrategies: RoutingStrategy[];
  };
  strategyBreakdown: StrategyMetrics[];
  topTools: Array<{ toolId: string; count: number; avgConfidence: number }>;
  recentErrors: Array<{ timestamp: Date; error: string; input: string }>;
  hourlyTrends: Array<{ hour: number; routes: number; avgLatencyMs: number }>;
  banditConvergence: Array<{ toolId: string; avgReward: number; selections: number }>;
}

export interface AlertRule {
  id: string;
  name: string;
  condition: (metrics: StrategyMetrics) => boolean;
  severity: 'warning' | 'error' | 'critical';
  message: string;
}

// ============================================================================
// METRICS STORAGE
// ============================================================================

class MetricsStore {
  private events: RoutingMetricEvent[] = [];
  private maxEvents = 10000;
  private latencyByStrategy = new Map<RoutingStrategy, number[]>();
  private toolCounts = new Map<string, number>();
  private toolConfidences = new Map<string, number[]>();
  private errorCount = 0;
  private fallbackCount = 0;

  record(event: RoutingMetricEvent): void {
    // Add to events
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Update latency tracking
    const latencies = this.latencyByStrategy.get(event.strategy) || [];
    latencies.push(event.latencyMs);
    if (latencies.length > 1000) latencies.shift();
    this.latencyByStrategy.set(event.strategy, latencies);

    // Update tool counts
    if (event.toolId) {
      this.toolCounts.set(event.toolId, (this.toolCounts.get(event.toolId) || 0) + 1);
      const confidences = this.toolConfidences.get(event.toolId) || [];
      confidences.push(event.confidence);
      if (confidences.length > 100) confidences.shift();
      this.toolConfidences.set(event.toolId, confidences);
    }

    // Update error/fallback counts
    if (event.eventType === 'error') this.errorCount++;
    if (event.eventType === 'fallback') this.fallbackCount++;
  }

  getStrategyMetrics(strategy: RoutingStrategy): StrategyMetrics {
    const strategyEvents = this.events.filter(
      (e) => e.strategy === strategy && e.eventType === 'route'
    );
    const latencies = this.latencyByStrategy.get(strategy) || [];
    const sortedLatencies = [...latencies].sort((a, b) => a - b);

    const successfulRoutes = strategyEvents.filter((e) => e.toolId !== null).length;
    const errorEvents = this.events.filter(
      (e) => e.strategy === strategy && e.eventType === 'error'
    );

    return {
      strategy,
      totalCalls: strategyEvents.length,
      successfulRoutes,
      avgLatencyMs:
        latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
      p50LatencyMs: this.percentile(sortedLatencies, 50),
      p95LatencyMs: this.percentile(sortedLatencies, 95),
      p99LatencyMs: this.percentile(sortedLatencies, 99),
      avgConfidence:
        strategyEvents.length > 0
          ? strategyEvents.reduce((sum, e) => sum + e.confidence, 0) / strategyEvents.length
          : 0,
      errorRate: strategyEvents.length > 0 ? errorEvents.length / strategyEvents.length : 0,
      fallbackRate: 0, // Calculated separately
    };
  }

  getAllStrategyMetrics(): StrategyMetrics[] {
    const strategies: RoutingStrategy[] = [
      'intent-classifier',
      'semantic-router',
      'bandit-optimizer',
      'llm-fallback',
      'react-reasoning',
      'goal-planner',
    ];
    return strategies.map((s) => this.getStrategyMetrics(s));
  }

  getTopTools(limit = 10): Array<{ toolId: string; count: number; avgConfidence: number }> {
    const tools = Array.from(this.toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([toolId, count]) => {
        const confidences = this.toolConfidences.get(toolId) || [];
        const avgConfidence =
          confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;
        return { toolId, count, avgConfidence };
      });
    return tools;
  }

  getRecentErrors(limit = 10): Array<{ timestamp: Date; error: string; input: string }> {
    return this.events
      .filter((e) => e.eventType === 'error')
      .slice(-limit)
      .map((e) => ({
        timestamp: e.timestamp,
        error: e.error || 'Unknown error',
        input: e.input,
      }));
  }

  getHourlyTrends(): Array<{ hour: number; routes: number; avgLatencyMs: number }> {
    const now = new Date();
    const last24Hours = this.events.filter(
      (e) => e.timestamp.getTime() > now.getTime() - 24 * 60 * 60 * 1000
    );

    const byHour = new Map<number, RoutingMetricEvent[]>();
    for (const event of last24Hours) {
      const hour = event.timestamp.getHours();
      const existing = byHour.get(hour) || [];
      existing.push(event);
      byHour.set(hour, existing);
    }

    const trends: Array<{ hour: number; routes: number; avgLatencyMs: number }> = [];
    for (let h = 0; h < 24; h++) {
      const hourEvents = byHour.get(h) || [];
      const avgLatency =
        hourEvents.length > 0
          ? hourEvents.reduce((sum, e) => sum + e.latencyMs, 0) / hourEvents.length
          : 0;
      trends.push({ hour: h, routes: hourEvents.length, avgLatencyMs: avgLatency });
    }
    return trends;
  }

  getSummary() {
    const routeEvents = this.events.filter((e) => e.eventType === 'route');
    const totalRoutes = routeEvents.length;
    const allLatencies = routeEvents.map((e) => e.latencyMs);
    const successfulRoutes = routeEvents.filter((e) => e.toolId !== null);

    const activeStrategies = Array.from(new Set(routeEvents.slice(-100).map((e) => e.strategy)));

    return {
      totalRoutes,
      avgLatencyMs:
        allLatencies.length > 0 ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : 0,
      overallAccuracy: totalRoutes > 0 ? successfulRoutes.length / totalRoutes : 0,
      activeStrategies,
    };
  }

  clear(): void {
    this.events = [];
    this.latencyByStrategy.clear();
    this.toolCounts.clear();
    this.toolConfidences.clear();
    this.errorCount = 0;
    this.fallbackCount = 0;
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let metricsStore: MetricsStore | null = null;

function getMetricsStore(): MetricsStore {
  if (!metricsStore) {
    metricsStore = new MetricsStore();
  }
  return metricsStore;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Record a routing decision for observability
 */
export function recordRoutingDecision(
  decision: RoutingDecision,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    input: string;
  }
): void {
  const store = getMetricsStore();

  store.record({
    timestamp: new Date(),
    eventType: 'route',
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    input: context.input,
    strategy: decision.decidedBy,
    toolId: decision.toolId,
    confidence: decision.confidence,
    latencyMs: decision.timing.total,
  });

  log.debug(
    {
      strategy: decision.decidedBy,
      toolId: decision.toolId,
      latencyMs: decision.timing.total,
    },
    'Recorded routing decision'
  );
}

/**
 * Record a routing outcome (success/failure)
 */
export function recordRoutingOutcome(
  decision: RoutingDecision,
  outcome: {
    success: boolean;
    error?: string;
  },
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    input: string;
  }
): void {
  const store = getMetricsStore();

  store.record({
    timestamp: new Date(),
    eventType: outcome.success ? 'outcome' : 'error',
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    input: context.input,
    strategy: decision.decidedBy,
    toolId: decision.toolId,
    confidence: decision.confidence,
    latencyMs: 0,
    success: outcome.success,
    error: outcome.error,
  });
}

/**
 * Record a fallback event
 */
export function recordFallback(
  fromStrategy: RoutingStrategy,
  toStrategy: RoutingStrategy,
  reason: string,
  context: {
    userId: string;
    sessionId: string;
    personaId: string;
    input: string;
  }
): void {
  const store = getMetricsStore();

  store.record({
    timestamp: new Date(),
    eventType: 'fallback',
    userId: context.userId,
    sessionId: context.sessionId,
    personaId: context.personaId,
    input: context.input,
    strategy: fromStrategy,
    toolId: null,
    confidence: 0,
    latencyMs: 0,
    error: `Fallback from ${fromStrategy} to ${toStrategy}: ${reason}`,
  });

  log.info({ fromStrategy, toStrategy, reason }, 'Routing fallback recorded');
}

/**
 * Get dashboard data for UI
 */
export function getDashboardData(): DashboardData {
  const store = getMetricsStore();

  return {
    summary: store.getSummary(),
    strategyBreakdown: store.getAllStrategyMetrics(),
    topTools: store.getTopTools(10),
    recentErrors: store.getRecentErrors(10),
    hourlyTrends: store.getHourlyTrends(),
    banditConvergence: [], // Populated from bandit optimizer
  };
}

/**
 * Get metrics for a specific strategy
 */
export function getStrategyMetrics(strategy: RoutingStrategy): StrategyMetrics {
  return getMetricsStore().getStrategyMetrics(strategy);
}

/**
 * Clear all metrics
 */
export function clearMetrics(): void {
  getMetricsStore().clear();
  log.info('Metrics cleared');
}

// ============================================================================
// ALERTING
// ============================================================================

const alertRules: AlertRule[] = [
  {
    id: 'high-error-rate',
    name: 'High Error Rate',
    condition: (m) => m.errorRate > 0.1,
    severity: 'error',
    message: 'Error rate exceeds 10%',
  },
  {
    id: 'slow-latency',
    name: 'Slow Latency',
    condition: (m) => m.p95LatencyMs > 500,
    severity: 'warning',
    message: 'P95 latency exceeds 500ms',
  },
  {
    id: 'very-slow-latency',
    name: 'Very Slow Latency',
    condition: (m) => m.p99LatencyMs > 2000,
    severity: 'critical',
    message: 'P99 latency exceeds 2000ms',
  },
  {
    id: 'low-confidence',
    name: 'Low Confidence',
    condition: (m) => m.avgConfidence < 0.5 && m.totalCalls > 100,
    severity: 'warning',
    message: 'Average confidence below 50%',
  },
];

export interface Alert {
  ruleId: string;
  ruleName: string;
  strategy: RoutingStrategy;
  severity: 'warning' | 'error' | 'critical';
  message: string;
  timestamp: Date;
}

/**
 * Check for alerts across all strategies
 */
export function checkAlerts(): Alert[] {
  const alerts: Alert[] = [];
  const store = getMetricsStore();

  const strategies: RoutingStrategy[] = [
    'intent-classifier',
    'semantic-router',
    'bandit-optimizer',
    'llm-fallback',
  ];

  for (const strategy of strategies) {
    const metrics = store.getStrategyMetrics(strategy);
    if (metrics.totalCalls < 10) continue; // Not enough data

    for (const rule of alertRules) {
      if (rule.condition(metrics)) {
        alerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          strategy,
          severity: rule.severity,
          message: rule.message,
          timestamp: new Date(),
        });
      }
    }
  }

  if (alerts.length > 0) {
    log.warn({ alertCount: alerts.length }, 'Routing alerts triggered');
  }

  return alerts;
}

// ============================================================================
// EXPORTS
// ============================================================================

export { MetricsStore };
