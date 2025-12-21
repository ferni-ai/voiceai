/**
 * Call Quality Monitor - User Experience Tracking
 *
 * Tracks real user experience metrics for voice calls:
 * - Connection success/failure rates
 * - Time to first response
 * - Call duration and completion
 * - Audio quality indicators
 * - Disconnection patterns
 *
 * "Better than human" means we know when users are having a bad experience
 * before they tell us.
 */

import { createLogger } from '../../utils/safe-logger.js';
import { SlackNotificationService } from '../slack-notifications.js';
import { recordMetricValue } from '../predictive-alerting.js';

const log = createLogger({ module: 'CallQualityMonitor' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface CallQualityConfig {
  // Thresholds
  connectionSuccessRateWarning: number; // 0.95 = 95%
  connectionSuccessRateCritical: number;
  firstResponseTimeWarningMs: number;
  firstResponseTimeCriticalMs: number;
  disconnectRateWarning: number;
  disconnectRateCritical: number;

  // Check intervals
  qualityCheckIntervalMs: number;

  // Alert cooldown
  alertCooldownMs: number;

  enableSlack: boolean;
}

const DEFAULT_CONFIG: CallQualityConfig = {
  connectionSuccessRateWarning: 0.95, // 95%
  connectionSuccessRateCritical: 0.9, // 90%
  firstResponseTimeWarningMs: 3000, // 3 seconds
  firstResponseTimeCriticalMs: 5000, // 5 seconds
  disconnectRateWarning: 0.05, // 5%
  disconnectRateCritical: 0.1, // 10%

  qualityCheckIntervalMs: 60_000, // Every minute
  alertCooldownMs: 300_000, // 5 minute cooldown

  enableSlack: true,
};

// ============================================================================
// TYPES
// ============================================================================

export interface CallEvent {
  callId: string;
  userId?: string;
  personaId?: string;
  timestamp: number;
  type:
    | 'connection_attempt'
    | 'connection_success'
    | 'connection_failed'
    | 'first_response'
    | 'user_speech'
    | 'agent_speech'
    | 'interruption'
    | 'silence_detected'
    | 'handoff_attempt'
    | 'handoff_success'
    | 'handoff_failed'
    | 'call_end_natural'
    | 'call_end_disconnect'
    | 'call_end_error';
  metadata?: Record<string, unknown>;
}

export interface CallSession {
  callId: string;
  userId?: string;
  personaId?: string;
  startTime: number;
  endTime?: number;
  connectionTimeMs?: number;
  firstResponseTimeMs?: number;
  totalDurationMs?: number;
  userSpeechCount: number;
  agentSpeechCount: number;
  interruptionCount: number;
  silenceCount: number;
  handoffAttempts: number;
  handoffSuccesses: number;
  endReason?: 'natural' | 'disconnect' | 'error';
  events: CallEvent[];
}

export interface CallQualityMetrics {
  // Window stats (last hour)
  totalCalls: number;
  activeCalls: number;

  // Connection metrics
  connectionAttempts: number;
  connectionSuccesses: number;
  connectionSuccessRate: number;
  avgConnectionTimeMs: number;

  // Response metrics
  avgFirstResponseTimeMs: number;
  p95FirstResponseTimeMs: number;

  // Duration metrics
  avgCallDurationMs: number;
  medianCallDurationMs: number;

  // Completion metrics
  naturalEndCount: number;
  disconnectCount: number;
  errorCount: number;
  disconnectRate: number;
  completionRate: number;

  // Interaction metrics
  avgInterruptionsPerCall: number;
  avgSilencePerCall: number;

  // Handoff metrics
  handoffAttempts: number;
  handoffSuccesses: number;
  handoffSuccessRate: number;

  // Quality score (0-100)
  qualityScore: number;
}

// ============================================================================
// STATE
// ============================================================================

let config = { ...DEFAULT_CONFIG };
const sessions = new Map<string, CallSession>();
const completedSessions: CallSession[] = [];
const MAX_COMPLETED_SESSIONS = 10000;
const lastAlerts = new Map<string, number>();
let qualityCheckInterval: NodeJS.Timeout | null = null;
let slackService: SlackNotificationService | null = null;
let isRunning = false;

// ============================================================================
// EVENT RECORDING
// ============================================================================

/**
 * Record a call event
 */
export function recordCallEvent(event: CallEvent): void {
  let session = sessions.get(event.callId);

  // Create session if needed
  if (!session) {
    session = {
      callId: event.callId,
      userId: event.userId,
      personaId: event.personaId,
      startTime: event.timestamp,
      userSpeechCount: 0,
      agentSpeechCount: 0,
      interruptionCount: 0,
      silenceCount: 0,
      handoffAttempts: 0,
      handoffSuccesses: 0,
      events: [],
    };
    sessions.set(event.callId, session);
  }

  // Add event
  session.events.push(event);

  // Process event
  switch (event.type) {
    case 'connection_success':
      session.connectionTimeMs = event.timestamp - session.startTime;
      break;

    case 'first_response':
      session.firstResponseTimeMs = event.timestamp - session.startTime;
      // Feed to predictive alerting
      recordMetricValue('first_response_time', session.firstResponseTimeMs);
      break;

    case 'user_speech':
      session.userSpeechCount++;
      break;

    case 'agent_speech':
      session.agentSpeechCount++;
      break;

    case 'interruption':
      session.interruptionCount++;
      break;

    case 'silence_detected':
      session.silenceCount++;
      break;

    case 'handoff_attempt':
      session.handoffAttempts++;
      break;

    case 'handoff_success':
      session.handoffSuccesses++;
      break;

    case 'call_end_natural':
    case 'call_end_disconnect':
    case 'call_end_error':
      session.endTime = event.timestamp;
      session.totalDurationMs = session.endTime - session.startTime;
      session.endReason =
        event.type === 'call_end_natural'
          ? 'natural'
          : event.type === 'call_end_disconnect'
            ? 'disconnect'
            : 'error';

      // Move to completed
      completedSessions.push(session);
      sessions.delete(event.callId);

      // Trim old sessions
      if (completedSessions.length > MAX_COMPLETED_SESSIONS) {
        completedSessions.splice(0, completedSessions.length - MAX_COMPLETED_SESSIONS);
      }

      log.debug(
        {
          callId: session.callId,
          duration: session.totalDurationMs,
          endReason: session.endReason,
        },
        'Call completed'
      );
      break;
  }
}

/**
 * Convenience function to start a call
 */
export function startCall(callId: string, userId?: string, personaId?: string): void {
  recordCallEvent({
    callId,
    userId,
    personaId,
    timestamp: Date.now(),
    type: 'connection_attempt',
  });
}

/**
 * Convenience function to end a call
 */
export function endCall(
  callId: string,
  reason: 'natural' | 'disconnect' | 'error' = 'natural'
): void {
  const type =
    reason === 'natural'
      ? 'call_end_natural'
      : reason === 'disconnect'
        ? 'call_end_disconnect'
        : 'call_end_error';

  recordCallEvent({
    callId,
    timestamp: Date.now(),
    type,
  });
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

export function calculateMetrics(windowMs: number = 60 * 60 * 1000): CallQualityMetrics {
  const now = Date.now();
  const windowStart = now - windowMs;

  // Get sessions in window
  const windowSessions = completedSessions.filter((s) => s.startTime >= windowStart);
  const activeSessions = Array.from(sessions.values());

  // Connection metrics
  const connectionAttempts = windowSessions.length + activeSessions.length;
  const connectionSuccesses = windowSessions.filter((s) => s.connectionTimeMs !== undefined).length;
  const connectionSuccessRate =
    connectionAttempts > 0 ? connectionSuccesses / connectionAttempts : 1;
  const connectionTimes = windowSessions
    .filter((s) => s.connectionTimeMs !== undefined)
    .map((s) => s.connectionTimeMs!);
  const avgConnectionTimeMs =
    connectionTimes.length > 0
      ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
      : 0;

  // Response metrics
  const firstResponseTimes = windowSessions
    .filter((s) => s.firstResponseTimeMs !== undefined)
    .map((s) => s.firstResponseTimeMs!);
  const avgFirstResponseTimeMs =
    firstResponseTimes.length > 0
      ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
      : 0;
  const p95FirstResponseTimeMs = percentile(firstResponseTimes, 95);

  // Duration metrics
  const durations = windowSessions
    .filter((s) => s.totalDurationMs !== undefined)
    .map((s) => s.totalDurationMs!);
  const avgCallDurationMs =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const medianCallDurationMs = percentile(durations, 50);

  // Completion metrics
  const naturalEndCount = windowSessions.filter((s) => s.endReason === 'natural').length;
  const disconnectCount = windowSessions.filter((s) => s.endReason === 'disconnect').length;
  const errorCount = windowSessions.filter((s) => s.endReason === 'error').length;
  const totalEnded = naturalEndCount + disconnectCount + errorCount;
  const disconnectRate = totalEnded > 0 ? disconnectCount / totalEnded : 0;
  const completionRate = totalEnded > 0 ? naturalEndCount / totalEnded : 1;

  // Interaction metrics
  const avgInterruptionsPerCall =
    windowSessions.length > 0
      ? windowSessions.reduce((a, b) => a + b.interruptionCount, 0) / windowSessions.length
      : 0;
  const avgSilencePerCall =
    windowSessions.length > 0
      ? windowSessions.reduce((a, b) => a + b.silenceCount, 0) / windowSessions.length
      : 0;

  // Handoff metrics
  const handoffAttempts = windowSessions.reduce((a, b) => a + b.handoffAttempts, 0);
  const handoffSuccesses = windowSessions.reduce((a, b) => a + b.handoffSuccesses, 0);
  const handoffSuccessRate = handoffAttempts > 0 ? handoffSuccesses / handoffAttempts : 1;

  // Calculate quality score (0-100)
  const qualityScore = calculateQualityScore({
    connectionSuccessRate,
    avgFirstResponseTimeMs,
    disconnectRate,
    completionRate,
    handoffSuccessRate,
  });

  return {
    totalCalls: windowSessions.length,
    activeCalls: activeSessions.length,
    connectionAttempts,
    connectionSuccesses,
    connectionSuccessRate,
    avgConnectionTimeMs,
    avgFirstResponseTimeMs,
    p95FirstResponseTimeMs,
    avgCallDurationMs,
    medianCallDurationMs,
    naturalEndCount,
    disconnectCount,
    errorCount,
    disconnectRate,
    completionRate,
    avgInterruptionsPerCall,
    avgSilencePerCall,
    handoffAttempts,
    handoffSuccesses,
    handoffSuccessRate,
    qualityScore,
  };
}

function calculateQualityScore(factors: {
  connectionSuccessRate: number;
  avgFirstResponseTimeMs: number;
  disconnectRate: number;
  completionRate: number;
  handoffSuccessRate: number;
}): number {
  // Weights for each factor
  const weights = {
    connectionSuccessRate: 25,
    firstResponseTime: 25,
    disconnectRate: 20,
    completionRate: 20,
    handoffSuccessRate: 10,
  };

  // Normalize each factor to 0-100
  const connectionScore = factors.connectionSuccessRate * 100;

  // First response time: 0ms = 100, 5000ms = 0
  const firstResponseScore = Math.max(0, 100 - (factors.avgFirstResponseTimeMs / 5000) * 100);

  // Disconnect rate: 0% = 100, 20% = 0
  const disconnectScore = Math.max(0, 100 - factors.disconnectRate * 500);

  const completionScore = factors.completionRate * 100;
  const handoffScore = factors.handoffSuccessRate * 100;

  // Weighted average
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const score =
    (connectionScore * weights.connectionSuccessRate +
      firstResponseScore * weights.firstResponseTime +
      disconnectScore * weights.disconnectRate +
      completionScore * weights.completionRate +
      handoffScore * weights.handoffSuccessRate) /
    totalWeight;

  return Math.round(score);
}

// ============================================================================
// ALERTING
// ============================================================================

function shouldSendAlert(alertType: string): boolean {
  const lastAlert = lastAlerts.get(alertType);
  if (!lastAlert) return true;
  return Date.now() - lastAlert > config.alertCooldownMs;
}

async function sendQualityAlert(
  severity: 'warning' | 'critical',
  title: string,
  message: string,
  metrics: Partial<CallQualityMetrics>
): Promise<void> {
  const alertKey = `${severity}:${title}`;

  if (!shouldSendAlert(alertKey)) {
    log.debug({ alertKey }, 'Quality alert rate-limited');
    return;
  }

  lastAlerts.set(alertKey, Date.now());

  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  log.warn({ severity, title, metrics }, `${emoji} ${title}`);

  if (config.enableSlack && slackService) {
    try {
      await slackService.notify({
        type: severity === 'critical' ? 'incident_opened' : 'health_degraded',
        title: `📞 ${title}`,
        message,
        severity: severity === 'critical' ? 'error' : 'warning',
        metadata: metrics as unknown as Record<string, unknown>,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to send Slack alert');
    }
  }
}

async function checkQualityAlerts(): Promise<void> {
  const metrics = calculateMetrics();

  // Feed to predictive alerting
  recordMetricValue('connection_success_rate', metrics.connectionSuccessRate * 100);
  recordMetricValue('disconnect_rate', metrics.disconnectRate * 100);

  // Connection success rate
  if (metrics.connectionSuccessRate < config.connectionSuccessRateCritical) {
    await sendQualityAlert(
      'critical',
      'Connection Success Rate Critical',
      `Only ${(metrics.connectionSuccessRate * 100).toFixed(1)}% of calls connecting successfully`,
      {
        connectionSuccessRate: metrics.connectionSuccessRate,
        connectionAttempts: metrics.connectionAttempts,
      }
    );
  } else if (metrics.connectionSuccessRate < config.connectionSuccessRateWarning) {
    await sendQualityAlert(
      'warning',
      'Connection Success Rate Degraded',
      `${(metrics.connectionSuccessRate * 100).toFixed(1)}% connection rate is below normal`,
      { connectionSuccessRate: metrics.connectionSuccessRate }
    );
  }

  // First response time
  if (metrics.avgFirstResponseTimeMs > config.firstResponseTimeCriticalMs) {
    await sendQualityAlert(
      'critical',
      'Response Time Critical',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s exceeds ${config.firstResponseTimeCriticalMs / 1000}s threshold`,
      {
        avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs,
        p95FirstResponseTimeMs: metrics.p95FirstResponseTimeMs,
      }
    );
  } else if (metrics.avgFirstResponseTimeMs > config.firstResponseTimeWarningMs) {
    await sendQualityAlert(
      'warning',
      'Response Time Elevated',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s is slow`,
      { avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs }
    );
  }

  // Disconnect rate
  if (metrics.disconnectRate > config.disconnectRateCritical) {
    await sendQualityAlert(
      'critical',
      'Disconnect Rate Critical',
      `${(metrics.disconnectRate * 100).toFixed(1)}% of calls ending in disconnection`,
      { disconnectRate: metrics.disconnectRate, disconnectCount: metrics.disconnectCount }
    );
  } else if (metrics.disconnectRate > config.disconnectRateWarning) {
    await sendQualityAlert(
      'warning',
      'Disconnect Rate Elevated',
      `${(metrics.disconnectRate * 100).toFixed(1)}% disconnect rate is above normal`,
      { disconnectRate: metrics.disconnectRate }
    );
  }

  // Quality score alert
  if (metrics.qualityScore < 70) {
    await sendQualityAlert(
      'critical',
      'Call Quality Score Low',
      `Overall quality score is ${metrics.qualityScore}/100`,
      metrics
    );
  } else if (metrics.qualityScore < 85) {
    await sendQualityAlert(
      'warning',
      'Call Quality Score Degraded',
      `Quality score ${metrics.qualityScore}/100 is below optimal`,
      { qualityScore: metrics.qualityScore }
    );
  }

  log.debug(
    {
      qualityScore: metrics.qualityScore,
      totalCalls: metrics.totalCalls,
      connectionRate: (metrics.connectionSuccessRate * 100).toFixed(1),
      disconnectRate: (metrics.disconnectRate * 100).toFixed(1),
    },
    'Quality check complete'
  );
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export function startCallQualityMonitor(userConfig?: Partial<CallQualityConfig>): void {
  if (isRunning) {
    log.warn('Call quality monitor already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  isRunning = true;

  // Initialize Slack
  if (config.enableSlack) {
    try {
      slackService = new SlackNotificationService();
    } catch (error) {
      log.warn({ error: String(error) }, 'Slack notifications disabled');
      config.enableSlack = false;
    }
  }

  // Start quality check loop
  qualityCheckInterval = setInterval(() => {
    checkQualityAlerts().catch((e) => log.error({ error: String(e) }, 'Quality check failed'));
  }, config.qualityCheckIntervalMs);

  log.info('📞 Call quality monitor started');
}

export function stopCallQualityMonitor(): void {
  if (!isRunning) return;

  if (qualityCheckInterval) {
    clearInterval(qualityCheckInterval);
    qualityCheckInterval = null;
  }

  isRunning = false;
  log.info('Call quality monitor stopped');
}

// ============================================================================
// API
// ============================================================================

export function getMetrics(): CallQualityMetrics {
  return calculateMetrics();
}

export function getActiveCalls(): CallSession[] {
  return Array.from(sessions.values());
}

export function getRecentCalls(limit = 100): CallSession[] {
  return completedSessions.slice(-limit);
}

/**
 * Get call quality monitor interface (for compatibility with other services)
 */
export function getCallQualityMonitor(): {
  getStats: () => {
    qualityScore: number;
    successRate: number;
    totalCalls: number;
    activeCalls: number;
    avgDurationMs: number;
    avgTimeToFirstResponseMs: number;
  };
  getRecentCalls: (limit?: number) => CallSession[];
} {
  return {
    getStats: () => {
      const metrics = calculateMetrics();
      return {
        qualityScore: metrics.qualityScore,
        successRate: metrics.connectionSuccessRate,
        totalCalls: completedSessions.length,
        activeCalls: sessions.size,
        avgDurationMs: metrics.avgCallDurationMs,
        avgTimeToFirstResponseMs: metrics.avgFirstResponseTimeMs,
      };
    },
    getRecentCalls,
  };
}
