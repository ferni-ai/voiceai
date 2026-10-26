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
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';
import { SlackNotificationService } from '../slack-notifications.js';
import { recordMetricValue } from '../predictive-alerting.js';
import { logCallStartStages } from './call-start-stages.js';
import { emitCallEnd, type CallSummary } from './bq-call-events.js';
import { gateSmallSamples } from './call-quality-sample.js';
import * as firstResponse from './call-first-response.js';
import { AlertIncidents, deliverAlert } from './call-quality-incidents.js';

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
  minCallsForRateAlerts: number; // rate and score alerts wait for this many calls

  qualityCheckIntervalMs: number; // how often quality is checked

  // Least time between two sends of one alert; one per incident (call-quality-incidents.ts)
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
  minCallsForRateAlerts: 5,

  qualityCheckIntervalMs: 60_000, // Every minute
  alertCooldownMs: 300_000, // 5 minutes

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
  outbound?: boolean; // Ferni placed it: first response is timed from pickup
  stages?: Record<string, number>;
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
  pendingBargeInDetectAtMs?: number;
  bargeInRecoverLatenciesMs: number[];
  endReason?: 'natural' | 'disconnect' | 'error';
  events: CallEvent[];
}

export interface CallStageTimings {
  sessionStartMs?: number;
  firstAudioMs?: number;
  jobToFirstAudioMs?: number;
  stages?: Record<string, number>;
  [stage: string]: number | Record<string, number> | undefined;
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
  firstResponseSamples: number; // calls in the response average (call-first-response.ts)
  lastSessionStages?: CallStageTimings;

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
  bargeInRecoverSamples: number;
  bargeInRecoverP95Ms: number;

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
const incidents = new AlertIncidents();
let slackService: SlackNotificationService | null = null;
let isRunning = false;

/**
 * A per-call child process sends its call events to the worker, whose monitor
 * sees every call and owns the alerts (docs/plans/2026-10-10-process-per-job.md).
 */
export type CallQualityOp =
  | 'recordCallEvent'
  | 'startCall'
  | 'markCallStage'
  | 'recordBargeInDetected'
  | 'recordBargeInAgentStopped'
  | 'endCall';
let forward: ((op: CallQualityOp, args: unknown[]) => void) | null = null;
export function setCallQualityForwarder(fn: typeof forward): void {
  forward = fn;
}

// --- Event recording ---

/** Record a call event */
export function recordCallEvent(event: CallEvent): void {
  if (forward) return forward('recordCallEvent', [event]);
  let session = sessions.get(event.callId);

  if (!session) {
    session = {
      callId: event.callId,
      userId: event.userId,
      personaId: event.personaId,
      startTime: event.timestamp,
      stages: { session_start: 0 },
      userSpeechCount: 0,
      agentSpeechCount: 0,
      interruptionCount: 0,
      silenceCount: 0,
      handoffAttempts: 0,
      handoffSuccesses: 0,
      bargeInRecoverLatenciesMs: [],
      events: [],
    };
    sessions.set(event.callId, session);
  }

  session.events.push(event);

  switch (event.type) {
    case 'connection_success':
      session.connectionTimeMs = event.timestamp - session.startTime;
      break;

    case 'first_response':
      if (session.firstResponseTimeMs === undefined) {
        session.firstResponseTimeMs = getElapsedStageMs(session, event.timestamp);
        session.stages = {
          ...session.stages,
          session_start: session.stages?.session_start ?? 0,
          first_audio: session.firstResponseTimeMs,
        };
        const sampleMs = firstResponse.sampleMs(session); // a placed call: from pickup
        if (sampleMs !== undefined) recordMetricValue('first_response_time', sampleMs);
        logCallStartStages(session);
      }
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
      logCallStartStages(session); // a call that never spoke still gets its line
      session.endTime = event.timestamp;
      session.totalDurationMs = session.endTime - session.startTime;
      session.endReason =
        event.type === 'call_end_natural'
          ? 'natural'
          : event.type === 'call_end_disconnect'
            ? 'disconnect'
            : 'error';

      completedSessions.push(session);
      sessions.delete(event.callId);

      // Trim old sessions
      if (completedSessions.length > MAX_COMPLETED_SESSIONS) {
        completedSessions.splice(0, completedSessions.length - MAX_COMPLETED_SESSIONS);
      }

      log.debug({ callId: session.callId, endReason: session.endReason }, 'Call completed');
      emitCallEnd(session, event.metadata?.summary as CallSummary | undefined);
      break;
  }
}

/** Start a call; `type` (job metadata.type) marks one Ferni placed (call-first-response.ts). */
export function startCall(callId: string, userId?: string, persona?: string, type?: string): void {
  if (forward) return forward('startCall', [callId, userId, persona, ...(type ? [type] : [])]);
  const startTime = Date.now();
  recordCallEvent({
    callId,
    userId,
    personaId: persona,
    timestamp: startTime,
    type: 'connection_attempt',
  });
  const session = sessions.get(callId);
  if (session) {
    session.stages = { session_start: 0 };
    session.outbound = firstResponse.isPlacedCallType(type);
  }
}

/** Record an elapsed timestamp for a named stage in an active call. */
export function markCallStage(callId: string, stage: string, atMs: number = Date.now()): void {
  if (forward) return forward('markCallStage', [callId, stage, atMs]);
  const session = sessions.get(callId);
  if (!session) return;

  session.stages = {
    ...session.stages,
    session_start: session.stages?.session_start ?? 0,
    [stage]: getElapsedStageMs(session, atMs),
  };
  if (stage === 'tts_first_frame') logCallStartStages(session);
}

/** Record the moment a user barge-in is detected while the agent is speaking. */
export function recordBargeInDetected(callId: string, atMs: number = Date.now()): void {
  if (forward) return forward('recordBargeInDetected', [callId, atMs]);
  recordCallEvent({
    callId,
    timestamp: atMs,
    type: 'interruption',
    metadata: { source: 'barge_in_detected' },
  });

  const session = sessions.get(callId);
  if (session) {
    session.pendingBargeInDetectAtMs = atMs;
  }
}

/** Record when agent speech actually stops after a barge-in. */
export function recordBargeInAgentStopped(callId: string, atMs: number = Date.now()): void {
  if (forward) return forward('recordBargeInAgentStopped', [callId, atMs]);
  const session = sessions.get(callId);
  if (!session || session.pendingBargeInDetectAtMs === undefined) return;

  const latencyMs = Math.max(0, atMs - session.pendingBargeInDetectAtMs);
  session.bargeInRecoverLatenciesMs.push(latencyMs);
  session.pendingBargeInDetectAtMs = undefined;
  recordMetricValue('barge_in_recover_latency', latencyMs);
}

/** Convenience function to end a call */
export function endCall(
  callId: string,
  reason: 'natural' | 'disconnect' | 'error' = 'natural',
  summary?: CallSummary
): void {
  if (forward) return forward('endCall', summary ? [callId, reason, summary] : [callId, reason]);
  const type =
    reason === 'natural'
      ? 'call_end_natural'
      : reason === 'disconnect'
        ? 'call_end_disconnect'
        : 'call_end_error';
  recordCallEvent({ callId, timestamp: Date.now(), type, metadata: summary && { summary } });
}

// --- Metrics calculation ---

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function getElapsedStageMs(session: CallSession, atMs: number): number {
  return Math.max(0, atMs - session.startTime);
}

function getLastSessionStages(
  windowSessions: readonly CallSession[],
  activeSessions: readonly CallSession[]
): CallStageTimings | undefined {
  const latestSession = [...windowSessions, ...activeSessions].reduce<CallSession | undefined>(
    (latest, session) => (!latest || session.startTime >= latest.startTime ? session : latest),
    undefined
  );
  if (!latestSession) return undefined;

  const stages = { ...(latestSession.stages ?? {}) };
  const timings: CallStageTimings = {
    ...stages,
    sessionStartMs: latestSession.startTime,
    stages,
  };

  if (latestSession.firstResponseTimeMs !== undefined) {
    timings.firstAudioMs = latestSession.startTime + latestSession.firstResponseTimeMs;
    timings.jobToFirstAudioMs = latestSession.firstResponseTimeMs;
  }

  return timings;
}

export function calculateMetrics(windowMs: number = 60 * 60 * 1000): CallQualityMetrics {
  const now = Date.now();
  const windowStart = now - windowMs;

  const windowSessions = completedSessions.filter((s) => s.startTime >= windowStart);
  const activeSessions = Array.from(sessions.values());

  // Connection metrics (include active sessions that already connected)
  const connectionAttempts = windowSessions.length + activeSessions.length;
  const connectedCompleted = windowSessions.filter((s) => s.connectionTimeMs !== undefined);
  const connectedActive = activeSessions.filter((s) => s.connectionTimeMs !== undefined);
  const connectionSuccesses = connectedCompleted.length + connectedActive.length;
  const connectionSuccessRate =
    connectionAttempts > 0 ? connectionSuccesses / connectionAttempts : 1;
  const connectionTimes = [
    ...connectedCompleted.map((s) => s.connectionTimeMs!),
    ...connectedActive.map((s) => s.connectionTimeMs!),
  ];
  const avgConnectionTimeMs =
    connectionTimes.length > 0
      ? connectionTimes.reduce((a, b) => a + b, 0) / connectionTimes.length
      : 0;

  // Response metrics (include active — first audio often arrives before call ends)
  const firstResponseTimes = firstResponse.samples([...windowSessions, ...activeSessions]);
  const avgFirstResponseTimeMs =
    firstResponseTimes.length > 0
      ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
      : 0;
  const p95FirstResponseTimeMs = percentile(firstResponseTimes, 95);
  const lastSessionStages = getLastSessionStages(windowSessions, activeSessions);

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
  const bargeInRecoverLatencies = [
    ...windowSessions.flatMap((s) => s.bargeInRecoverLatenciesMs),
    ...activeSessions.flatMap((s) => s.bargeInRecoverLatenciesMs),
  ];
  const bargeInRecoverSamples = bargeInRecoverLatencies.length;
  const bargeInRecoverP95Ms = percentile(bargeInRecoverLatencies, 95);

  // Handoff metrics
  const handoffAttempts = windowSessions.reduce((a, b) => a + b.handoffAttempts, 0);
  const handoffSuccesses = windowSessions.reduce((a, b) => a + b.handoffSuccesses, 0);
  const handoffSuccessRate = handoffAttempts > 0 ? handoffSuccesses / handoffAttempts : 1;

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
    firstResponseSamples: firstResponseTimes.length,
    lastSessionStages,
    avgCallDurationMs,
    medianCallDurationMs,
    naturalEndCount,
    disconnectCount,
    errorCount,
    disconnectRate,
    completionRate,
    avgInterruptionsPerCall,
    avgSilencePerCall,
    bargeInRecoverSamples,
    bargeInRecoverP95Ms,
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

async function sendQualityAlert(
  severity: 'warning' | 'critical',
  title: string,
  message: string,
  metrics: Partial<CallQualityMetrics>
): Promise<void> {
  const alertKey = `${severity}:${title}`;
  if (!incidents.shouldSend(alertKey, Date.now(), config.alertCooldownMs)) return; // sent, or backing off

  const emoji = severity === 'critical' ? '🚨' : '⚠️';
  log.warn({ severity, title, metrics }, `${emoji} ${title}`);

  const result = await deliverAlert(config.enableSlack ? slackService : null, {
    type: severity === 'critical' ? 'incident_opened' : 'health_degraded',
    title: `📞 ${title}`,
    message,
    severity: severity === 'critical' ? 'error' : 'warning',
    metadata: metrics as unknown as Record<string, unknown>,
    alertKey, // its own opsAlert key: two critical alerts at once both reach the operator
  });
  incidents.record(alertKey, Date.now(), result, log);
}

export async function checkQualityAlerts(): Promise<void> {
  const metrics = calculateMetrics();
  const gated = gateSmallSamples(metrics, config.minCallsForRateAlerts);
  incidents.beginCheck();

  // Feed to predictive alerting
  recordMetricValue('connection_success_rate', metrics.connectionSuccessRate * 100);
  recordMetricValue('disconnect_rate', metrics.disconnectRate * 100);

  // Connection success rate
  if (gated.connectionSuccessRate < config.connectionSuccessRateCritical) {
    await sendQualityAlert(
      'critical',
      'Connection Success Rate Critical',
      `Only ${(metrics.connectionSuccessRate * 100).toFixed(1)}% of calls connecting successfully`,
      {
        connectionSuccessRate: metrics.connectionSuccessRate,
        connectionAttempts: metrics.connectionAttempts,
      }
    );
  } else if (gated.connectionSuccessRate < config.connectionSuccessRateWarning) {
    await sendQualityAlert(
      'warning',
      'Connection Success Rate Degraded',
      `${(metrics.connectionSuccessRate * 100).toFixed(1)}% connection rate is below normal`,
      { connectionSuccessRate: metrics.connectionSuccessRate }
    );
  }

  // First response time
  if (gated.avgFirstResponseTimeMs > config.firstResponseTimeCriticalMs) {
    await sendQualityAlert(
      'critical',
      'Response Time Critical',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s exceeds ${config.firstResponseTimeCriticalMs / 1000}s threshold`,
      {
        avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs,
        p95FirstResponseTimeMs: metrics.p95FirstResponseTimeMs,
      }
    );
  } else if (gated.avgFirstResponseTimeMs > config.firstResponseTimeWarningMs) {
    await sendQualityAlert(
      'warning',
      'Response Time Elevated',
      `Average first response ${(metrics.avgFirstResponseTimeMs / 1000).toFixed(1)}s is slow`,
      { avgFirstResponseTimeMs: metrics.avgFirstResponseTimeMs }
    );
  }

  // Disconnect rate
  if (gated.disconnectRate > config.disconnectRateCritical) {
    await sendQualityAlert(
      'critical',
      'Disconnect Rate Critical',
      `${(metrics.disconnectRate * 100).toFixed(1)}% of calls ending in disconnection`,
      { disconnectRate: metrics.disconnectRate, disconnectCount: metrics.disconnectCount }
    );
  } else if (gated.disconnectRate > config.disconnectRateWarning) {
    await sendQualityAlert(
      'warning',
      'Disconnect Rate Elevated',
      `${(metrics.disconnectRate * 100).toFixed(1)}% disconnect rate is above normal`,
      { disconnectRate: metrics.disconnectRate }
    );
  }

  // Quality score alert
  if (gated.qualityScore < 70) {
    await sendQualityAlert(
      'critical',
      'Call Quality Score Low',
      `Overall quality score is ${metrics.qualityScore}/100`,
      metrics
    );
  } else if (gated.qualityScore < 85) {
    await sendQualityAlert(
      'warning',
      'Call Quality Score Degraded',
      `Quality score ${metrics.qualityScore}/100 is below optimal`,
      { qualityScore: metrics.qualityScore }
    );
  }

  incidents.endCheck();
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

  // Start quality check loop using managed interval
  registerInterval(
    'call-quality-monitor',
    () => {
      checkQualityAlerts().catch((e) => log.error({ error: String(e) }, 'Quality check failed'));
    },
    config.qualityCheckIntervalMs
  );

  log.info('📞 Call quality monitor started');
}

export function stopCallQualityMonitor(): void {
  if (!isRunning) return;

  clearNamedInterval('call-quality-monitor');

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

/** Clear in-memory call quality state so tests remain isolated. */
export function resetCallQualityStateForTests(): void {
  stopCallQualityMonitor();
  sessions.clear();
  completedSessions.length = 0;
  incidents.reset();
  config = { ...DEFAULT_CONFIG };
  slackService = null;
}

/** Get call quality monitor interface (for compatibility with other services) */
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
