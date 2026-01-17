/**
 * Handoff Metrics Service
 *
 * Tracks all handoff attempts, successes, failures, and timing.
 * Provides analytics for diagnosing handoff issues.
 *
 * Usage:
 *   import { handoffMetrics } from './handoff-metrics.js';
 *
 *   // Record a handoff attempt
 *   const traceId = handoffMetrics.startHandoff('ferni', 'peter-john', 'ui_click');
 *
 *   // Record success/failure
 *   handoffMetrics.completeHandoff(traceId, true);
 *   // or
 *   handoffMetrics.failHandoff(traceId, 'tool_not_found', 'handoffToPeter not in registry');
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type HandoffSource =
  | 'ui_click' // User clicked persona in UI
  | 'voice_request' // Voice command to switch
  | 'tool_call' // LLM called handoff tool
  | 'auto_routing' // System auto-routed based on topic
  | 'return_to_coach'; // Returning to coordinator

export type HandoffFailureReason =
  | 'tool_not_found' // Handoff tool not in registry
  | 'persona_not_found' // Persona not registered
  | 'no_listeners' // No voiceSwitch listeners registered
  | 'rate_limited' // Too many handoffs too quickly
  | 'already_with_agent' // Already talking to target agent
  | 'connection_lost' // Room disconnected during handoff
  | 'voice_switch_failed' // TTS voice switch failed
  | 'timeout' // Handoff took too long
  | 'validation_failed' // Post-handoff validation failed
  | 'team_locked' // Team member not yet unlocked for user
  | 'unknown'; // Unknown error

export type HandoffPhase =
  | 'initiated' // Handoff request received
  | 'validated' // Target validated, about to execute
  | 'event_emitted' // voiceSwitch event emitted
  | 'handler_started' // Handler received event
  | 'voice_switched' // Voice successfully switched
  | 'frontend_notified' // Frontend received handoff_complete
  | 'completed' // Fully complete
  | 'failed'; // Failed at some phase

export interface HandoffTrace {
  id: string;
  sessionId: string;
  fromAgent: string;
  toAgent: string;
  source: HandoffSource;

  // Timing
  startTime: number;
  endTime?: number;
  durationMs?: number;

  // Phase tracking
  currentPhase: HandoffPhase;
  phaseTimings: Record<HandoffPhase, number>;

  // Result
  success?: boolean;
  failureReason?: HandoffFailureReason;
  errorMessage?: string;
  errorStack?: string;

  // Context
  listenerCount?: number;
  toolName?: string;
  availableTools?: string[];
}

export interface HandoffMetricsSummary {
  // Totals
  totalAttempts: number;
  totalSuccesses: number;
  totalFailures: number;
  successRate: number;

  // By agent
  byFromAgent: Record<string, { attempts: number; successes: number; failures: number }>;
  byToAgent: Record<string, { attempts: number; successes: number; failures: number }>;

  // By failure reason
  byFailureReason: Record<HandoffFailureReason, number>;

  // Timing
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  maxDurationMs: number;

  // Recent errors
  recentFailures: HandoffTrace[];

  // Time window
  windowStartTime: number;
  windowEndTime: number;
}

// ============================================================================
// METRICS SERVICE
// ============================================================================

class HandoffMetricsService {
  private traces = new Map<string, HandoffTrace>();
  private completedTraces: HandoffTrace[] = [];
  private readonly MAX_COMPLETED_TRACES = 1000;
  private readonly MAX_RECENT_FAILURES = 50;

  private logger = getLogger();

  /**
   * Start tracking a new handoff attempt.
   * Returns a trace ID for subsequent updates.
   */
  startHandoff(
    fromAgent: string,
    toAgent: string,
    source: HandoffSource,
    sessionId = 'unknown'
  ): string {
    const traceId = `hoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();

    const trace: HandoffTrace = {
      id: traceId,
      sessionId,
      fromAgent,
      toAgent,
      source,
      startTime: now,
      currentPhase: 'initiated',
      phaseTimings: {
        initiated: now,
        validated: 0,
        event_emitted: 0,
        handler_started: 0,
        voice_switched: 0,
        frontend_notified: 0,
        completed: 0,
        failed: 0,
      },
    };

    this.traces.set(traceId, trace);

    this.logger.info(
      {
        traceId,
        fromAgent,
        toAgent,
        source,
        sessionId,
      },
      '📊 [HandoffMetrics] Handoff initiated'
    );

    return traceId;
  }

  /**
   * Update the current phase of a handoff.
   */
  updatePhase(traceId: string, phase: HandoffPhase, context?: Record<string, unknown>): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn({ traceId, phase }, '📊 [HandoffMetrics] Trace not found for phase update');
      return;
    }

    const now = Date.now();
    trace.currentPhase = phase;
    trace.phaseTimings[phase] = now;

    // Add context if provided
    if (context) {
      if (context.listenerCount !== undefined) {
        trace.listenerCount = context.listenerCount as number;
      }
      if (context.toolName !== undefined) {
        trace.toolName = context.toolName as string;
      }
      if (context.availableTools !== undefined) {
        trace.availableTools = context.availableTools as string[];
      }
    }

    this.logger.debug(
      {
        traceId,
        phase,
        elapsed: now - trace.startTime,
        ...context,
      },
      `📊 [HandoffMetrics] Phase: ${phase}`
    );
  }

  /**
   * Mark a handoff as successfully completed.
   */
  completeHandoff(traceId: string): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn({ traceId }, '📊 [HandoffMetrics] Trace not found for completion');
      return;
    }

    const now = Date.now();
    trace.endTime = now;
    trace.durationMs = now - trace.startTime;
    trace.currentPhase = 'completed';
    trace.phaseTimings.completed = now;
    trace.success = true;

    this.archiveTrace(trace);
    this.traces.delete(traceId);

    this.logger.info(
      {
        traceId,
        fromAgent: trace.fromAgent,
        toAgent: trace.toAgent,
        durationMs: trace.durationMs,
        phases: this.getPhaseBreakdown(trace),
      },
      '📊 [HandoffMetrics] ✅ Handoff completed successfully'
    );
  }

  /**
   * Mark a handoff as failed.
   */
  failHandoff(
    traceId: string,
    reason: HandoffFailureReason,
    errorMessage?: string,
    errorStack?: string
  ): void {
    const trace = this.traces.get(traceId);
    if (!trace) {
      this.logger.warn({ traceId, reason }, '📊 [HandoffMetrics] Trace not found for failure');
      return;
    }

    const now = Date.now();
    trace.endTime = now;
    trace.durationMs = now - trace.startTime;
    trace.currentPhase = 'failed';
    trace.phaseTimings.failed = now;
    trace.success = false;
    trace.failureReason = reason;
    trace.errorMessage = errorMessage;
    trace.errorStack = errorStack;

    this.archiveTrace(trace);
    this.traces.delete(traceId);

    this.logger.error(
      {
        traceId,
        fromAgent: trace.fromAgent,
        toAgent: trace.toAgent,
        reason,
        errorMessage,
        durationMs: trace.durationMs,
        failedAtPhase: this.getLastSuccessfulPhase(trace),
        listenerCount: trace.listenerCount,
        toolName: trace.toolName,
        availableTools: trace.availableTools?.slice(0, 10),
      },
      '📊 [HandoffMetrics] ❌ Handoff FAILED'
    );
  }

  /**
   * Get the current summary of handoff metrics.
   */
  getSummary(windowMinutes = 60): HandoffMetricsSummary {
    const now = Date.now();
    const windowStart = now - windowMinutes * 60 * 1000;

    // Filter traces within window
    const windowTraces = this.completedTraces.filter((t) => t.startTime >= windowStart);

    // Calculate totals
    const successes = windowTraces.filter((t) => t.success);
    const failures = windowTraces.filter((t) => !t.success);

    // By agent stats
    const byFromAgent: Record<string, { attempts: number; successes: number; failures: number }> =
      {};
    const byToAgent: Record<string, { attempts: number; successes: number; failures: number }> = {};
    const byFailureReason: Record<HandoffFailureReason, number> = {} as Record<
      HandoffFailureReason,
      number
    >;

    for (const trace of windowTraces) {
      // From agent
      if (!byFromAgent[trace.fromAgent]) {
        byFromAgent[trace.fromAgent] = { attempts: 0, successes: 0, failures: 0 };
      }
      byFromAgent[trace.fromAgent].attempts++;
      if (trace.success) {
        byFromAgent[trace.fromAgent].successes++;
      } else {
        byFromAgent[trace.fromAgent].failures++;
      }

      // To agent
      if (!byToAgent[trace.toAgent]) {
        byToAgent[trace.toAgent] = { attempts: 0, successes: 0, failures: 0 };
      }
      byToAgent[trace.toAgent].attempts++;
      if (trace.success) {
        byToAgent[trace.toAgent].successes++;
      } else {
        byToAgent[trace.toAgent].failures++;
      }

      // Failure reasons
      if (!trace.success && trace.failureReason) {
        byFailureReason[trace.failureReason] = (byFailureReason[trace.failureReason] || 0) + 1;
      }
    }

    // Calculate timing stats
    const durations = successes
      .map((t) => t.durationMs)
      .filter((d): d is number => d !== undefined)
      .sort((a, b) => a - b);

    const avgDurationMs =
      durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
    const p50DurationMs =
      durations.length > 0 ? (durations[Math.floor(durations.length * 0.5)] ?? 0) : 0;
    const p95DurationMs =
      durations.length > 0 ? (durations[Math.floor(durations.length * 0.95)] ?? 0) : 0;
    const maxDurationMs = durations.length > 0 ? (durations[durations.length - 1] ?? 0) : 0;

    // Recent failures (most recent first)
    const recentFailures = failures
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, this.MAX_RECENT_FAILURES);

    return {
      totalAttempts: windowTraces.length,
      totalSuccesses: successes.length,
      totalFailures: failures.length,
      successRate: windowTraces.length > 0 ? successes.length / windowTraces.length : 1,
      byFromAgent,
      byToAgent,
      byFailureReason,
      avgDurationMs,
      p50DurationMs,
      p95DurationMs,
      maxDurationMs,
      recentFailures,
      windowStartTime: windowStart,
      windowEndTime: now,
    };
  }

  /**
   * Get all in-progress handoffs.
   */
  getInProgressHandoffs(): HandoffTrace[] {
    return Array.from(this.traces.values());
  }

  /**
   * Get a specific trace by ID.
   */
  getTrace(traceId: string): HandoffTrace | undefined {
    return this.traces.get(traceId) || this.completedTraces.find((t) => t.id === traceId);
  }

  /**
   * Clear all metrics (for testing).
   */
  clear(): void {
    this.traces.clear();
    this.completedTraces = [];
    this.logger.info('📊 [HandoffMetrics] Metrics cleared');
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private archiveTrace(trace: HandoffTrace): void {
    this.completedTraces.push(trace);

    // Trim if over max
    if (this.completedTraces.length > this.MAX_COMPLETED_TRACES) {
      this.completedTraces = this.completedTraces.slice(-this.MAX_COMPLETED_TRACES);
    }

    // Bridge to Admin Diagnostics API for real-time dashboard visibility
    // This populates the /api/v1/admin/diagnostics/handoff/* endpoints
    this.sendToAdminDashboard(trace);
  }

  /**
   * Send handoff event to Admin Diagnostics API
   * This bridges the detailed metrics service with the admin dashboard
   */
  private sendToAdminDashboard(trace: HandoffTrace): void {
    try {
      // Lazy import to avoid circular dependencies
      import('../api/v1/admin/diagnostics.js')
        .then(({ recordHandoffEvent }) => {
          recordHandoffEvent({
            from: trace.fromAgent,
            to: trace.toAgent,
            trigger: trace.source,
            duration: trace.durationMs ?? 0,
            status: trace.success ? 'success' : 'failed',
            userId: trace.sessionId !== 'unknown' ? trace.sessionId : undefined,
          });
        })
        .catch((err) => {
          // Non-critical - diagnostics may not be available in all environments
          this.logger.debug({ error: String(err) }, 'Could not send to admin diagnostics');
        });
    } catch {
      // Ignore - diagnostics API may not be loaded
    }
  }

  private getPhaseBreakdown(trace: HandoffTrace): Record<string, number> {
    const breakdown: Record<string, number> = {};
    const phases: HandoffPhase[] = [
      'initiated',
      'validated',
      'event_emitted',
      'handler_started',
      'voice_switched',
      'frontend_notified',
      'completed',
    ];

    for (let i = 1; i < phases.length; i++) {
      const prevPhase = phases[i - 1];
      const currPhase = phases[i];
      const prevTime = trace.phaseTimings[prevPhase];
      const currTime = trace.phaseTimings[currPhase];

      if (prevTime && currTime) {
        breakdown[`${prevPhase}_to_${currPhase}`] = currTime - prevTime;
      }
    }

    return breakdown;
  }

  private getLastSuccessfulPhase(trace: HandoffTrace): HandoffPhase {
    const phases: HandoffPhase[] = [
      'initiated',
      'validated',
      'event_emitted',
      'handler_started',
      'voice_switched',
      'frontend_notified',
      'completed',
    ];

    let lastPhase: HandoffPhase = 'initiated';
    for (const phase of phases) {
      if (trace.phaseTimings[phase] > 0) {
        lastPhase = phase;
      }
    }

    return lastPhase;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const handoffMetrics = new HandoffMetricsService();

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Start tracking a handoff from the executor.
 * Convenience wrapper with common defaults.
 */
export function trackHandoffStart(
  fromAgent: string,
  toAgent: string,
  source: HandoffSource = 'tool_call',
  sessionId?: string
): string {
  return handoffMetrics.startHandoff(fromAgent, toAgent, source, sessionId);
}

/**
 * Record a phase update.
 */
export function trackHandoffPhase(
  traceId: string,
  phase: HandoffPhase,
  context?: Record<string, unknown>
): void {
  handoffMetrics.updatePhase(traceId, phase, context);
}

/**
 * Record handoff success.
 */
export function trackHandoffSuccess(traceId: string): void {
  handoffMetrics.completeHandoff(traceId);
}

/**
 * Record handoff failure.
 */
export function trackHandoffFailure(
  traceId: string,
  reason: HandoffFailureReason,
  errorMessage?: string,
  errorStack?: string
): void {
  handoffMetrics.failHandoff(traceId, reason, errorMessage, errorStack);
}

// ============================================================================
// SIMPLIFIED METRICS API (for HandoffCoordinator)
// ============================================================================

/**
 * Handoff metrics data for simplified recording.
 */
export interface HandoffMetricsData {
  traceId: string;
  from: string;
  to: string;
  success: boolean;
  durationMs: number;
  source: string;
  error?: string;
}

/**
 * Record handoff metrics with a single call.
 * This is the simplified API used by HandoffCoordinator.
 */
export function recordHandoffMetrics(data: HandoffMetricsData): void {
  const { traceId, from, to, success, durationMs, source, error } = data;

  // Start tracking if not already started
  const trace = handoffMetrics.getTrace(traceId);
  if (!trace) {
    // Create a completed trace directly
    handoffMetrics.startHandoff(from, to, source as HandoffSource, 'unknown');
    // The trace ID might be different, so we'll just log it
  }

  // Record completion or failure
  if (success) {
    // Mark phases as complete
    handoffMetrics.updatePhase(traceId, 'validated');
    handoffMetrics.updatePhase(traceId, 'event_emitted');
    handoffMetrics.updatePhase(traceId, 'handler_started');
    handoffMetrics.updatePhase(traceId, 'voice_switched');
    handoffMetrics.updatePhase(traceId, 'frontend_notified');
    handoffMetrics.completeHandoff(traceId);
  } else {
    const reason: HandoffFailureReason = error?.includes('timeout')
      ? 'timeout'
      : error?.includes('validation')
        ? 'validation_failed'
        : error?.includes('voice')
          ? 'voice_switch_failed'
          : 'unknown';
    handoffMetrics.failHandoff(traceId, reason, error);
  }
}
