/**
 * Tool Usage Analytics
 *
 * Tracks tool usage for monitoring, debugging, and optimization.
 * Designed to be lightweight and non-blocking.
 *
 * USAGE:
 *   import { trackToolUsage, getToolMetrics } from '../shared/analytics.js';
 *
 *   execute: async (params, { ctx: toolCtx }) => {
 *     const tracker = trackToolUsage('logExercise', 'health');
 *     try {
 *       // ... tool logic
 *       tracker.success();
 *     } catch (error) {
 *       tracker.error(error);
 *       throw error;
 *     }
 *   }
 */

import { getLogger } from '../../../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ToolUsageEvent {
  toolId: string;
  domain: string;
  success: boolean;
  durationMs: number;
  timestamp: Date;
  userId?: string;
  agentId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolMetrics {
  toolId: string;
  domain: string;
  totalCalls: number;
  successCount: number;
  errorCount: number;
  avgDurationMs: number;
  lastCalled: Date | null;
  errorRate: number;
}

export interface DomainMetrics {
  domain: string;
  totalCalls: number;
  toolBreakdown: Record<string, number>;
  avgDurationMs: number;
  errorRate: number;
}

// ============================================================================
// IN-MEMORY STORE (Replace with persistent store in production)
// ============================================================================

const usageStore: ToolUsageEvent[] = [];
const MAX_STORE_SIZE = 10000; // Limit memory usage

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Start tracking a tool execution
 * Returns a tracker object with success/error methods
 */
export function trackToolUsage(
  toolId: string,
  domain: string,
  options?: {
    userId?: string;
    agentId?: string;
    metadata?: Record<string, unknown>;
  }
): {
  success: (metadata?: Record<string, unknown>) => void;
  error: (error: Error | string, metadata?: Record<string, unknown>) => void;
} {
  const startTime = Date.now();

  const recordEvent = (success: boolean, errorMsg?: string, metadata?: Record<string, unknown>) => {
    const event: ToolUsageEvent = {
      toolId,
      domain,
      success,
      durationMs: Date.now() - startTime,
      timestamp: new Date(),
      userId: options?.userId,
      agentId: options?.agentId,
      error: errorMsg,
      metadata: { ...options?.metadata, ...metadata },
    };

    // Store event
    usageStore.push(event);

    // Trim if too large
    if (usageStore.length > MAX_STORE_SIZE) {
      usageStore.splice(0, usageStore.length - MAX_STORE_SIZE);
    }

    // Log for observability
    if (success) {
      getLogger().debug(
        { toolId, domain, durationMs: event.durationMs },
        'Tool executed successfully'
      );
    } else {
      getLogger().warn(
        { toolId, domain, durationMs: event.durationMs, error: errorMsg },
        'Tool execution failed'
      );
    }

    // In production, send to analytics service
    // sendToAnalyticsService(event);
  };

  return {
    success: (metadata?: Record<string, unknown>) => {
      recordEvent(true, undefined, metadata);
    },
    error: (error: Error | string, metadata?: Record<string, unknown>) => {
      const errorMsg = error instanceof Error ? error.message : error;
      recordEvent(false, errorMsg, metadata);
    },
  };
}

/**
 * Simple one-line tracking for successful executions
 */
export function trackToolSuccess(
  toolId: string,
  domain: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const event: ToolUsageEvent = {
    toolId,
    domain,
    success: true,
    durationMs,
    timestamp: new Date(),
    metadata,
  };
  usageStore.push(event);
}

/**
 * Simple one-line tracking for failed executions
 */
export function trackToolError(
  toolId: string,
  domain: string,
  error: string,
  durationMs: number,
  metadata?: Record<string, unknown>
): void {
  const event: ToolUsageEvent = {
    toolId,
    domain,
    success: false,
    durationMs,
    timestamp: new Date(),
    error,
    metadata,
  };
  usageStore.push(event);

  getLogger().warn({ toolId, domain, error }, 'Tool error tracked');
}

// ============================================================================
// METRICS FUNCTIONS
// ============================================================================

/**
 * Get metrics for a specific tool
 */
export function getToolMetrics(toolId: string): ToolMetrics | null {
  const events = usageStore.filter((e) => e.toolId === toolId);

  if (events.length === 0) return null;

  const successEvents = events.filter((e) => e.success);
  const errorEvents = events.filter((e) => !e.success);
  const totalDuration = events.reduce((sum, e) => sum + e.durationMs, 0);

  return {
    toolId,
    domain: events[0].domain,
    totalCalls: events.length,
    successCount: successEvents.length,
    errorCount: errorEvents.length,
    avgDurationMs: Math.round(totalDuration / events.length),
    lastCalled: events.length > 0 ? events[events.length - 1].timestamp : null,
    errorRate: events.length > 0 ? errorEvents.length / events.length : 0,
  };
}

/**
 * Get metrics for a domain
 */
export function getDomainMetrics(domain: string): DomainMetrics | null {
  const events = usageStore.filter((e) => e.domain === domain);

  if (events.length === 0) return null;

  const toolBreakdown: Record<string, number> = {};
  events.forEach((e) => {
    toolBreakdown[e.toolId] = (toolBreakdown[e.toolId] || 0) + 1;
  });

  const totalDuration = events.reduce((sum, e) => sum + e.durationMs, 0);
  const errorCount = events.filter((e) => !e.success).length;

  return {
    domain,
    totalCalls: events.length,
    toolBreakdown,
    avgDurationMs: Math.round(totalDuration / events.length),
    errorRate: events.length > 0 ? errorCount / events.length : 0,
  };
}

/**
 * Get all domain metrics
 */
export function getAllDomainMetrics(): DomainMetrics[] {
  const domains = [...new Set(usageStore.map((e) => e.domain))];
  return domains.map((d) => getDomainMetrics(d)).filter((m): m is DomainMetrics => m !== null);
}

/**
 * Get most used tools
 */
export function getMostUsedTools(limit = 10): ToolMetrics[] {
  const toolIds = [...new Set(usageStore.map((e) => e.toolId))];
  return toolIds
    .map((id) => getToolMetrics(id))
    .filter((m): m is ToolMetrics => m !== null)
    .sort((a, b) => b.totalCalls - a.totalCalls)
    .slice(0, limit);
}

/**
 * Get tools with highest error rates
 */
export function getProblematicTools(minCalls = 5): ToolMetrics[] {
  const toolIds = [...new Set(usageStore.map((e) => e.toolId))];
  return toolIds
    .map((id) => getToolMetrics(id))
    .filter((m): m is ToolMetrics => m !== null && m.totalCalls >= minCalls)
    .sort((a, b) => b.errorRate - a.errorRate)
    .filter((m) => m.errorRate > 0);
}

/**
 * Get recent errors for debugging
 */
export function getRecentErrors(limit = 20): ToolUsageEvent[] {
  return usageStore
    .filter((e) => !e.success)
    .slice(-limit)
    .reverse();
}

// ============================================================================
// ALERTS
// ============================================================================

/**
 * Check if a tool has concerning error rate
 */
export function hasHighErrorRate(toolId: string, threshold = 0.1): boolean {
  const metrics = getToolMetrics(toolId);
  if (!metrics || metrics.totalCalls < 5) return false;
  return metrics.errorRate > threshold;
}

/**
 * Check if any crisis tools have errors (critical alert)
 */
export function hasCrisisToolErrors(): boolean {
  const crisisEvents = usageStore.filter((e) => e.domain === 'crisis' && !e.success);
  return crisisEvents.length > 0;
}

/**
 * Get crisis tool health status
 */
export function getCrisisToolHealth(): {
  healthy: boolean;
  errorCount: number;
  lastError: ToolUsageEvent | null;
} {
  const crisisErrors = usageStore.filter((e) => e.domain === 'crisis' && !e.success);
  return {
    healthy: crisisErrors.length === 0,
    errorCount: crisisErrors.length,
    lastError: crisisErrors.length > 0 ? crisisErrors[crisisErrors.length - 1] : null,
  };
}

// ============================================================================
// MAINTENANCE
// ============================================================================

/**
 * Clear all stored events (for testing)
 */
export function clearAnalytics(): void {
  usageStore.length = 0;
}

/**
 * Get raw event count
 */
export function getEventCount(): number {
  return usageStore.length;
}

/**
 * Export events for external analysis
 */
export function exportEvents(since?: Date): ToolUsageEvent[] {
  if (!since) return [...usageStore];
  return usageStore.filter((e) => e.timestamp >= since);
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  trackToolUsage,
  trackToolSuccess,
  trackToolError,
  getToolMetrics,
  getDomainMetrics,
  getAllDomainMetrics,
  getMostUsedTools,
  getProblematicTools,
  getRecentErrors,
  hasHighErrorRate,
  hasCrisisToolErrors,
  getCrisisToolHealth,
  clearAnalytics,
  getEventCount,
  exportEvents,
};
