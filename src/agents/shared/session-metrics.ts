/**
 * Session Connection Metrics
 *
 * Tracks performance metrics for session connections to identify bottlenecks
 * and measure optimization improvements.
 *
 * Metrics tracked:
 * - Total session connection time
 * - Phase breakdown (voice init, tool loading, profile loading, etc.)
 * - Rolling averages for last N sessions
 * - P95/P99 latencies
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'session-metrics' });

// ============================================================================
// TYPES
// ============================================================================

export interface SessionPhaseMetric {
  phase: string;
  durationMs: number;
  timestamp: number;
}

export interface SessionMetric {
  sessionId: string;
  totalDurationMs: number;
  phases: SessionPhaseMetric[];
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface SessionMetricsSummary {
  totalSessions: number;
  avgConnectionTimeMs: number;
  p50ConnectionTimeMs: number;
  p95ConnectionTimeMs: number;
  p99ConnectionTimeMs: number;
  minConnectionTimeMs: number;
  maxConnectionTimeMs: number;
  lastSessionTimeMs: number | null;
  phaseBreakdown: Record<string, { avg: number; count: number }>;
  successRate: number;
  lastUpdated: string;
}

// ============================================================================
// STORAGE
// ============================================================================

// Keep last 100 sessions for rolling metrics
const MAX_SESSIONS = 100;
const sessionMetrics: SessionMetric[] = [];

// Current session being tracked
const activeSessions: Map<
  string,
  {
    startTime: number;
    phases: SessionPhaseMetric[];
  }
> = new Map();

// ============================================================================
// TRACKING FUNCTIONS
// ============================================================================

/**
 * Start tracking a new session connection
 */
export function startSessionMetrics(sessionId: string): void {
  activeSessions.set(sessionId, {
    startTime: Date.now(),
    phases: [],
  });
  log.debug({ sessionId }, '📊 Session metrics: Started tracking');
}

/**
 * Record a phase completion within a session
 */
export function recordPhase(sessionId: string, phase: string, durationMs: number): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    log.warn({ sessionId, phase }, '📊 Session metrics: No active session for phase');
    return;
  }

  session.phases.push({
    phase,
    durationMs,
    timestamp: Date.now(),
  });

  log.debug({ sessionId, phase, durationMs }, '📊 Session metrics: Phase recorded');
}

/**
 * Mark a session connection as complete
 */
export function completeSessionMetrics(sessionId: string, success = true, error?: string): void {
  const session = activeSessions.get(sessionId);
  if (!session) {
    log.warn({ sessionId }, '📊 Session metrics: No active session to complete');
    return;
  }

  const totalDurationMs = Date.now() - session.startTime;

  const metric: SessionMetric = {
    sessionId,
    totalDurationMs,
    phases: session.phases,
    timestamp: Date.now(),
    success,
    error,
  };

  // Add to rolling buffer
  sessionMetrics.push(metric);
  if (sessionMetrics.length > MAX_SESSIONS) {
    sessionMetrics.shift();
  }

  // Clean up active session
  activeSessions.delete(sessionId);

  // Log the result
  const phasesSummary = session.phases.map((p) => `${p.phase}=${p.durationMs}ms`).join(', ');
  log.info(
    { sessionId, totalDurationMs, success, phases: phasesSummary },
    `📊 Session metrics: Connection ${success ? 'completed' : 'failed'} in ${totalDurationMs}ms`
  );
}

// ============================================================================
// WARMUP FUNCTION
// ============================================================================

let lastWarmupTime = 0;
const WARMUP_COOLDOWN_MS = 30000; // 30 seconds between warmups

/**
 * Warm up the worker by triggering lazy-loaded modules
 * Returns time since last warmup
 */
export async function warmupWorker(): Promise<{
  warmedUp: boolean;
  timeSinceLastWarmupMs: number;
  modulesWarmed: string[];
}> {
  const now = Date.now();
  const timeSinceLastWarmup = now - lastWarmupTime;

  // Skip if recently warmed up
  if (timeSinceLastWarmup < WARMUP_COOLDOWN_MS) {
    return {
      warmedUp: false,
      timeSinceLastWarmupMs: timeSinceLastWarmup,
      modulesWarmed: [],
    };
  }

  lastWarmupTime = now;
  const modulesWarmed: string[] = [];

  try {
    // Warm up tool orchestrator (main latency source)
    const { isOrchestratorInitialized, initializeToolOrchestrator } =
      await import('../../tools/orchestrator/index.js');
    if (!isOrchestratorInitialized()) {
      await initializeToolOrchestrator();
      modulesWarmed.push('toolOrchestrator');
    }

    // Warm up FerniAgent
    await import('../personas/ferni-agent.js');
    modulesWarmed.push('ferniAgent');

    // Warm up voice manager
    await import('../../speech/voice-manager.js');
    modulesWarmed.push('voiceManager');

    // Warm up context builders (they're lazy)
    await import('../../intelligence/context-builders/index.js');
    modulesWarmed.push('contextBuilders');

    log.info({ modulesWarmed, durationMs: Date.now() - now }, '🔥 Worker warmup complete');
  } catch (err) {
    log.warn({ error: String(err) }, '🔥 Worker warmup partial failure');
  }

  return {
    warmedUp: true,
    timeSinceLastWarmupMs: timeSinceLastWarmup,
    modulesWarmed,
  };
}

// ============================================================================
// SUMMARY FUNCTIONS
// ============================================================================

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

/**
 * Get summary of session connection metrics
 */
export function getSessionMetricsSummary(): SessionMetricsSummary {
  const successfulSessions = sessionMetrics.filter((s) => s.success);
  const connectionTimes = successfulSessions.map((s) => s.totalDurationMs).sort((a, b) => a - b);

  // Calculate phase breakdown
  const phaseBreakdown: Record<string, { total: number; count: number }> = {};
  for (const session of successfulSessions) {
    for (const phase of session.phases) {
      if (!phaseBreakdown[phase.phase]) {
        phaseBreakdown[phase.phase] = { total: 0, count: 0 };
      }
      phaseBreakdown[phase.phase].total += phase.durationMs;
      phaseBreakdown[phase.phase].count += 1;
    }
  }

  const phaseAvgs: Record<string, { avg: number; count: number }> = {};
  for (const [phase, data] of Object.entries(phaseBreakdown)) {
    phaseAvgs[phase] = {
      avg: Math.round(data.total / data.count),
      count: data.count,
    };
  }

  const lastSession = sessionMetrics[sessionMetrics.length - 1];

  return {
    totalSessions: sessionMetrics.length,
    avgConnectionTimeMs:
      connectionTimes.length > 0
        ? Math.round(connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length)
        : 0,
    p50ConnectionTimeMs: percentile(connectionTimes, 50),
    p95ConnectionTimeMs: percentile(connectionTimes, 95),
    p99ConnectionTimeMs: percentile(connectionTimes, 99),
    minConnectionTimeMs: connectionTimes.length > 0 ? connectionTimes[0] : 0,
    maxConnectionTimeMs:
      connectionTimes.length > 0 ? connectionTimes[connectionTimes.length - 1] : 0,
    lastSessionTimeMs: lastSession?.totalDurationMs ?? null,
    phaseBreakdown: phaseAvgs,
    successRate:
      sessionMetrics.length > 0
        ? Math.round((successfulSessions.length / sessionMetrics.length) * 100)
        : 100,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get raw session metrics (for detailed debugging)
 */
export function getRawSessionMetrics(limit = 10): SessionMetric[] {
  return sessionMetrics.slice(-limit);
}

/**
 * Clear all metrics (for testing)
 */
export function clearSessionMetrics(): void {
  sessionMetrics.length = 0;
  activeSessions.clear();
}
