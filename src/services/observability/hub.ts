/**
 * Observability Hub
 *
 * Aggregates all observability metrics into a unified view.
 * Provides a single entry point for dashboards and monitoring.
 */

import { llmHealthMetrics, type LLMHealthSnapshot } from './llm-health.js';
import { connectionHealthMetrics, type ConnectionHealthSnapshot } from './connection-health.js';
import { uxQualityMetrics, type UXQualitySnapshot } from './ux-quality.js';
import { memoryMetrics, type MemoryHealthSnapshot } from './memory-health.js';
import { costMetrics, type CostSnapshot } from './cost-tracking.js';
import { errorMetrics, type ErrorSnapshot } from './error-recovery.js';
import { personaMetrics, type PersonaHealthSnapshot } from './persona-health.js';
import {
  getAggregateMetrics,
  type AggregateMetrics,
} from '../../tools/semantic-router/integration/metrics.js';
import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ObservabilitySnapshot {
  timestamp: number;
  windowMinutes: number;

  // Health scores (0-100, higher is better)
  overallHealth: number;
  llmHealth: number;
  connectionHealth: number;
  uxHealth: number;
  memoryHealth: number;
  costHealth: number;
  errorHealth: number;
  personaHealth: number;
  semanticRoutingHealth: number; // NEW: Semantic routing health

  // Alerts
  alerts: Alert[];
  criticalAlerts: number;
  warningAlerts: number;

  // Detailed snapshots
  llm: LLMHealthSnapshot;
  connection: ConnectionHealthSnapshot;
  ux: UXQualitySnapshot;
  memory: MemoryHealthSnapshot;
  cost: CostSnapshot;
  errors: ErrorSnapshot;
  persona: PersonaHealthSnapshot;
  semanticRouting: AggregateMetrics; // NEW: Semantic routing metrics
}

export interface Alert {
  id: string;
  timestamp: number;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

// ============================================================================
// STATE
// ============================================================================

const alerts: Alert[] = [];
const MAX_ALERTS = 1000;

// ============================================================================
// HEALTH CALCULATIONS
// ============================================================================

function calculateLLMHealth(snapshot: LLMHealthSnapshot): number {
  let score = 100;

  // Error rate impact
  if (snapshot.errorRate >= 10) score -= 40;
  else if (snapshot.errorRate >= 5) score -= 20;

  // Latency impact
  if (snapshot.p95LatencyMs >= 5000) score -= 30;
  else if (snapshot.p95LatencyMs >= 2000) score -= 15;

  // Context utilization
  if (snapshot.maxContextUtilization >= 85) score -= 10;

  // Fallback rate
  if (snapshot.fallbackRate > 10) score -= 10;

  return Math.max(0, score);
}

function calculateConnectionHealth(snapshot: ConnectionHealthSnapshot): number {
  let score = 100;

  // Availability
  if (snapshot.availabilityPercent < 95) score -= 30;

  // Reconnections
  if (snapshot.reconnectionCount >= 5) score -= 20;

  // Packet loss
  if (snapshot.packetLossPercent >= 2) score -= 20;

  // Data channel
  if (snapshot.deliveryRate < 95) score -= 15;

  // Connection state
  if (snapshot.connectionState === 'disconnected') score -= 30;
  else if (snapshot.connectionState === 'reconnecting') score -= 15;

  return Math.max(0, score);
}

function calculateUXHealth(snapshot: UXQualitySnapshot): number {
  let score = 100;

  // Completion rate
  if (snapshot.completionRate < 70) score -= 25;

  // Interruption rate
  if (snapshot.interruptionRate > 30) score -= 15;

  // Timeout rate
  if (snapshot.timeoutRate > 10) score -= 20;

  // Error end rate
  if (snapshot.errorEndRate > 5) score -= 20;

  // Quality score
  if (snapshot.avgQualityScore < 70) score -= 15;

  return Math.max(0, score);
}

function calculateMemoryHealth(snapshot: MemoryHealthSnapshot): number {
  let score = 100;

  // Latency
  if (snapshot.avgSearchLatencyMs > 200) score -= 20;

  // Relevance
  if (snapshot.avgRelevanceScore < 0.6) score -= 25;

  // Error rate
  if (snapshot.embeddingErrorRate > 0.05) score -= 20;

  // Cache hit rate
  if (snapshot.cacheHitRate < 0.5) score -= 10;

  // Empty results
  if (snapshot.emptyResultSearches > 5) score -= 15;

  return Math.max(0, score);
}

function calculateCostHealth(snapshot: CostSnapshot): number {
  let score = 100;

  // High projected costs
  if (snapshot.projectedMonthlyCost > 1000) score -= 30;
  else if (snapshot.projectedMonthlyCost > 500) score -= 15;

  // High hourly costs
  if (snapshot.costLastHour > 10) score -= 25;

  return Math.max(0, score);
}

function calculateErrorHealth(snapshot: ErrorSnapshot): number {
  // Use the built-in health score
  return snapshot.errorHealthScore;
}

function calculatePersonaHealth(snapshot: PersonaHealthSnapshot): number {
  let score = 100;

  // Bundle load time
  if (snapshot.avgLoadTimeMs > 500) score -= 15;

  // Load failures
  if (snapshot.loadSuccessRate < 0.95) score -= 20;

  // Voice quality
  if (snapshot.voiceQualityRate < 0.8) score -= 20;

  // Knowledge query success
  if (snapshot.knowledgeQuerySuccessRate < 0.9) score -= 15;

  // Unhealthy personas
  if (snapshot.unhealthyPersonas.length > 0) score -= 15;

  return Math.max(0, score);
}

function calculateSemanticRoutingHealth(snapshot: AggregateMetrics): number {
  let score = 100;

  // No data is fine - just means routing hasn't been used yet
  if (snapshot.totalRoutes === 0) return 100;

  // Error rate impact (errors / total)
  const errorRate = snapshot.errors / snapshot.totalRoutes;
  if (errorRate > 0.1) score -= 30;
  else if (errorRate > 0.05) score -= 15;

  // Latency impact
  if (snapshot.p95LatencyMs > 200) score -= 20;
  else if (snapshot.p95LatencyMs > 100) score -= 10;

  // LLM bypass rate (higher is better - means router is working)
  const bypassRate = snapshot.bypassedLLM / snapshot.totalRoutes;
  if (bypassRate < 0.1) score -= 10; // Low bypass might indicate poor routing

  // Cache hit rate (higher is better)
  if (snapshot.cacheHitRate < 0.3) score -= 10;

  return Math.max(0, score);
}

// ============================================================================
// ALERT GENERATION
// ============================================================================

function generateAlerts(
  llm: LLMHealthSnapshot,
  connection: ConnectionHealthSnapshot,
  ux: UXQualitySnapshot,
  memory: MemoryHealthSnapshot,
  cost: CostSnapshot,
  errors: ErrorSnapshot,
  persona: PersonaHealthSnapshot
): Alert[] {
  const newAlerts: Alert[] = [];
  const now = Date.now();

  // LLM alerts
  if (llm.errorRate >= 10) {
    newAlerts.push({
      id: `alert_${now}_llm_error`,
      timestamp: now,
      severity: 'critical',
      category: 'llm',
      title: 'High LLM Error Rate',
      message: `LLM error rate is ${llm.errorRate.toFixed(1)}%`,
      metric: 'errorRate',
      value: llm.errorRate,
      threshold: 10,
    });
  }

  if (llm.rateLimitProximity > 80) {
    newAlerts.push({
      id: `alert_${now}_llm_ratelimit`,
      timestamp: now,
      severity: 'warning',
      category: 'llm',
      title: 'Approaching Rate Limit',
      message: `LLM rate limit at ${llm.rateLimitProximity.toFixed(0)}% of quota`,
      metric: 'rateLimitProximity',
      value: llm.rateLimitProximity,
      threshold: 80,
    });
  }

  // Connection alerts
  if (connection.connectionState === 'disconnected') {
    newAlerts.push({
      id: `alert_${now}_conn_disconnected`,
      timestamp: now,
      severity: 'critical',
      category: 'connection',
      title: 'Connection Lost',
      message: 'All connections are disconnected',
      metric: 'connectionState',
    });
  }

  if (connection.packetLossPercent > 2) {
    newAlerts.push({
      id: `alert_${now}_conn_packetloss`,
      timestamp: now,
      severity: 'warning',
      category: 'connection',
      title: 'High Packet Loss',
      message: `Packet loss at ${connection.packetLossPercent.toFixed(1)}%`,
      metric: 'packetLossPercent',
      value: connection.packetLossPercent,
      threshold: 2,
    });
  }

  // Cost alerts
  if (cost.projectedMonthlyCost > 1000) {
    newAlerts.push({
      id: `alert_${now}_cost_high`,
      timestamp: now,
      severity: 'warning',
      category: 'cost',
      title: 'High Projected Costs',
      message: `Projected monthly spend $${cost.projectedMonthlyCost.toFixed(2)}`,
      metric: 'projectedMonthlyCost',
      value: cost.projectedMonthlyCost,
      threshold: 1000,
    });
  }

  // Error alerts
  if (errors.errorsLast5Min > 10) {
    newAlerts.push({
      id: `alert_${now}_err_spike`,
      timestamp: now,
      severity: 'critical',
      category: 'errors',
      title: 'Error Spike Detected',
      message: `${errors.errorsLast5Min} errors in the last 5 minutes`,
      metric: 'errorsLast5Min',
      value: errors.errorsLast5Min,
      threshold: 10,
    });
  }

  // UX alerts
  if (ux.completionRate < 70) {
    newAlerts.push({
      id: `alert_${now}_ux_completion`,
      timestamp: now,
      severity: 'warning',
      category: 'ux',
      title: 'Low Completion Rate',
      message: `Only ${ux.completionRate.toFixed(0)}% of sessions completed normally`,
      metric: 'completionRate',
      value: ux.completionRate,
      threshold: 70,
    });
  }

  // Memory alerts
  if (memory.emptyResultSearches > 10) {
    newAlerts.push({
      id: `alert_${now}_mem_empty`,
      timestamp: now,
      severity: 'warning',
      category: 'memory',
      title: 'Many Empty Search Results',
      message: `${memory.emptyResultSearches} searches returned no results`,
      metric: 'emptyResultSearches',
      value: memory.emptyResultSearches,
      threshold: 10,
    });
  }

  // Persona alerts
  if (persona.loadSuccessRate < 0.95) {
    newAlerts.push({
      id: `alert_${now}_persona_load`,
      timestamp: now,
      severity: 'warning',
      category: 'persona',
      title: 'Persona Load Issues',
      message: `Persona load success rate is ${(persona.loadSuccessRate * 100).toFixed(0)}%`,
      metric: 'loadSuccessRate',
      value: persona.loadSuccessRate,
    });
  }

  if (persona.unhealthyPersonas.length > 0) {
    newAlerts.push({
      id: `alert_${now}_persona_unhealthy`,
      timestamp: now,
      severity: 'warning',
      category: 'persona',
      title: 'Unhealthy Personas',
      message: `${persona.unhealthyPersonas.length} personas are unhealthy: ${persona.unhealthyPersonas.join(', ')}`,
      metric: 'unhealthyPersonas',
      value: persona.unhealthyPersonas.length,
    });
  }

  // Store alerts
  alerts.push(...newAlerts);
  if (alerts.length > MAX_ALERTS) {
    alerts.splice(0, alerts.length - MAX_ALERTS);
  }

  return newAlerts;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

function getSnapshot(windowMinutes = 60): ObservabilitySnapshot {
  const now = Date.now();

  // Get all snapshots
  const llm = llmHealthMetrics.getSnapshot(windowMinutes);
  const connection = connectionHealthMetrics.getSnapshot(windowMinutes);
  const ux = uxQualityMetrics.getSnapshot(windowMinutes);
  const memory = memoryMetrics.getSnapshot();
  const cost = costMetrics.getSnapshot();
  const errors = errorMetrics.getSnapshot();
  const persona = personaMetrics.getSnapshot();

  // Get semantic routing metrics (since window start)
  const windowStart = new Date(now - windowMinutes * 60 * 1000);
  const semanticRouting = getAggregateMetrics(windowStart);

  // Calculate health scores
  const llmHealth = calculateLLMHealth(llm);
  const connectionHealth = calculateConnectionHealth(connection);
  const uxHealth = calculateUXHealth(ux);
  const memoryHealth = calculateMemoryHealth(memory);
  const costHealth = calculateCostHealth(cost);
  const errorHealth = calculateErrorHealth(errors);
  const personaHealth = calculatePersonaHealth(persona);
  const semanticRoutingHealth = calculateSemanticRoutingHealth(semanticRouting);

  // Overall health (weighted average) - semantic routing adds 5% weight
  const overallHealth = Math.round(
    llmHealth * 0.18 +
      connectionHealth * 0.15 +
      uxHealth * 0.15 +
      memoryHealth * 0.1 +
      costHealth * 0.1 +
      errorHealth * 0.17 +
      personaHealth * 0.1 +
      semanticRoutingHealth * 0.05
  );

  // Generate alerts
  const newAlerts = generateAlerts(llm, connection, ux, memory, cost, errors, persona);
  const criticalAlerts = newAlerts.filter((a) => a.severity === 'critical').length;
  const warningAlerts = newAlerts.filter((a) => a.severity === 'warning').length;

  return {
    timestamp: now,
    windowMinutes,
    overallHealth,
    llmHealth,
    connectionHealth,
    uxHealth,
    memoryHealth,
    costHealth,
    errorHealth,
    personaHealth,
    semanticRoutingHealth,
    alerts: newAlerts,
    criticalAlerts,
    warningAlerts,
    llm,
    connection,
    ux,
    memory,
    cost,
    errors,
    persona,
    semanticRouting,
  };
}

function getRecentAlerts(limit = 50): Alert[] {
  return alerts.slice(-limit).reverse();
}

function clearAlerts(): void {
  alerts.length = 0;
  log.info('Observability alerts cleared');
}

// ============================================================================
// EXPORT
// ============================================================================

export const observabilityHub = {
  getSnapshot,
  getRecentAlerts,
  clearAlerts,
};
