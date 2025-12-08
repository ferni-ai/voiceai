/**
 * LLM Health Metrics
 *
 * Tracks AI/LLM performance and health:
 * - Token usage per response
 * - Context window utilization
 * - Rate limit proximity
 * - Model fallback events
 * - Response quality indicators
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface LLMCall {
  id: string;
  timestamp: number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  contextWindowUsed: number;
  contextWindowMax: number;
  success: boolean;
  errorType?: string;
  isFallback: boolean;
  qualityScore?: number;
}

export interface LLMHealthSnapshot {
  // Token metrics
  avgTokensPerResponse: number;
  totalTokensUsed: number;
  tokenUsageByModel: Record<string, number>;

  // Context window
  avgContextUtilization: number;
  maxContextUtilization: number;
  contextTruncations: number;

  // Rate limits
  rateLimitProximity: number; // 0-100%
  rateLimitHits: number;
  requestsPerMinute: number;

  // Fallbacks
  fallbackCount: number;
  fallbackRate: number;
  primaryModelSuccessRate: number;

  // Quality
  avgResponseQuality: number;
  lowQualityResponses: number;

  // Latency
  avgLatencyMs: number;
  p95LatencyMs: number;
  maxLatencyMs: number;

  // Errors
  errorRate: number;
  errorsByType: Record<string, number>;

  // Time window
  windowStartTime: number;
  windowEndTime: number;
  totalCalls: number;
}

// ============================================================================
// LLM HEALTH SERVICE
// ============================================================================

class LLMHealthService {
  private calls: LLMCall[] = [];
  private readonly MAX_CALLS = 10000;
  private rateLimitQuota = 10000; // Tokens per minute default
  private currentMinuteTokens = 0;
  private minuteResetTime = Date.now();

  /**
   * Record an LLM API call
   */
  recordCall(call: Omit<LLMCall, 'id' | 'timestamp'>): void {
    const record: LLMCall = {
      ...call,
      id: `llm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
    };

    this.calls.push(record);

    // Trim old calls
    if (this.calls.length > this.MAX_CALLS) {
      this.calls = this.calls.slice(-this.MAX_CALLS);
    }

    // Update rate limit tracking
    this.updateRateLimitTracking(call.totalTokens);

    // Log if concerning
    if (call.isFallback) {
      log.warn({ model: call.model, latencyMs: call.latencyMs }, '⚠️ LLM fallback triggered');
    }
    if (call.contextWindowUsed / call.contextWindowMax > 0.9) {
      log.warn(
        { utilization: `${((call.contextWindowUsed / call.contextWindowMax) * 100).toFixed(1)}%` },
        '⚠️ High context window utilization'
      );
    }
  }

  /**
   * Record a simple completion (convenience method)
   */
  recordCompletion(
    model: string,
    promptTokens: number,
    completionTokens: number,
    latencyMs: number,
    options: {
      contextWindowUsed?: number;
      contextWindowMax?: number;
      success?: boolean;
      errorType?: string;
      isFallback?: boolean;
      qualityScore?: number;
    } = {}
  ): void {
    this.recordCall({
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      latencyMs,
      contextWindowUsed: options.contextWindowUsed ?? promptTokens,
      contextWindowMax: options.contextWindowMax ?? 128000,
      success: options.success ?? true,
      errorType: options.errorType,
      isFallback: options.isFallback ?? false,
      qualityScore: options.qualityScore,
    });
  }

  /**
   * Record an error
   */
  recordError(model: string, errorType: string, latencyMs: number): void {
    this.recordCall({
      model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs,
      contextWindowUsed: 0,
      contextWindowMax: 128000,
      success: false,
      errorType,
      isFallback: false,
    });
  }

  /**
   * Set rate limit quota
   */
  setRateLimitQuota(tokensPerMinute: number): void {
    this.rateLimitQuota = tokensPerMinute;
  }

  /**
   * Update rate limit tracking
   */
  private updateRateLimitTracking(tokens: number): void {
    const now = Date.now();

    // Reset if minute has passed
    if (now - this.minuteResetTime > 60000) {
      this.currentMinuteTokens = 0;
      this.minuteResetTime = now;
    }

    this.currentMinuteTokens += tokens;
  }

  /**
   * Get current rate limit proximity (0-100)
   */
  getRateLimitProximity(): number {
    return Math.min(100, (this.currentMinuteTokens / this.rateLimitQuota) * 100);
  }

  /**
   * Get health snapshot
   */
  getSnapshot(windowMinutes = 60): LLMHealthSnapshot {
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    const windowCalls = this.calls.filter((c) => c.timestamp >= windowStart);
    const successfulCalls = windowCalls.filter((c) => c.success);
    const fallbackCalls = windowCalls.filter((c) => c.isFallback);

    // Token metrics
    const totalTokens = windowCalls.reduce((sum, c) => sum + c.totalTokens, 0);
    const avgTokens = windowCalls.length > 0 ? totalTokens / windowCalls.length : 0;

    const tokensByModel: Record<string, number> = {};
    windowCalls.forEach((c) => {
      tokensByModel[c.model] = (tokensByModel[c.model] || 0) + c.totalTokens;
    });

    // Context utilization
    const utilizations = windowCalls
      .filter((c) => c.contextWindowMax > 0)
      .map((c) => c.contextWindowUsed / c.contextWindowMax);
    const avgUtilization =
      utilizations.length > 0 ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length : 0;
    const maxUtilization = utilizations.length > 0 ? Math.max(...utilizations) : 0;
    const truncations = windowCalls.filter(
      (c) => c.contextWindowUsed >= c.contextWindowMax * 0.95
    ).length;

    // Rate limits
    const rateLimitHits = windowCalls.filter((c) => c.errorType === 'rate_limit').length;
    const requestsPerMinute = windowMinutes > 0 ? windowCalls.length / windowMinutes : 0;

    // Fallbacks
    const fallbackRate = windowCalls.length > 0 ? fallbackCalls.length / windowCalls.length : 0;
    const primaryCalls = windowCalls.filter((c) => !c.isFallback);
    const primarySuccess = primaryCalls.filter((c) => c.success).length;
    const primarySuccessRate = primaryCalls.length > 0 ? primarySuccess / primaryCalls.length : 1;

    // Quality
    const qualityCalls = windowCalls.filter((c) => c.qualityScore !== undefined);
    const avgQuality =
      qualityCalls.length > 0
        ? qualityCalls.reduce((sum, c) => sum + (c.qualityScore ?? 0), 0) / qualityCalls.length
        : 100;
    const lowQuality = qualityCalls.filter((c) => (c.qualityScore ?? 100) < 70).length;

    // Latency
    const latencies = successfulCalls.map((c) => c.latencyMs).sort((a, b) => a - b);
    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const p95Latency =
      latencies.length > 0 ? (latencies[Math.floor(latencies.length * 0.95)] ?? 0) : 0;
    const maxLatency = latencies.length > 0 ? (latencies[latencies.length - 1] ?? 0) : 0;

    // Errors
    const errorCalls = windowCalls.filter((c) => !c.success);
    const errorRate = windowCalls.length > 0 ? errorCalls.length / windowCalls.length : 0;
    const errorsByType: Record<string, number> = {};
    errorCalls.forEach((c) => {
      const type = c.errorType || 'unknown';
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    });

    return {
      avgTokensPerResponse: avgTokens,
      totalTokensUsed: totalTokens,
      tokenUsageByModel: tokensByModel,
      avgContextUtilization: avgUtilization * 100,
      maxContextUtilization: maxUtilization * 100,
      contextTruncations: truncations,
      rateLimitProximity: this.getRateLimitProximity(),
      rateLimitHits,
      requestsPerMinute,
      fallbackCount: fallbackCalls.length,
      fallbackRate: fallbackRate * 100,
      primaryModelSuccessRate: primarySuccessRate * 100,
      avgResponseQuality: avgQuality,
      lowQualityResponses: lowQuality,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      maxLatencyMs: maxLatency,
      errorRate: errorRate * 100,
      errorsByType,
      windowStartTime: windowStart,
      windowEndTime: now,
      totalCalls: windowCalls.length,
    };
  }

  /**
   * Clear metrics
   */
  clear(): void {
    this.calls = [];
    this.currentMinuteTokens = 0;
    this.minuteResetTime = Date.now();
    log.info('LLM health metrics cleared');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const llmHealthMetrics = new LLMHealthService();
