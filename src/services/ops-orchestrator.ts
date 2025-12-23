/**
 * Ops Orchestrator - Unified Self-Healing & Alerting System
 *
 * Ties together all monitoring, alerting, and self-healing systems
 * into a single coherent operation.
 *
 * Features:
 * - Continuous health monitoring of all services
 * - Cost monitoring with budget alerts
 * - Predictive alerts (trend-based)
 * - External service status checks
 * - Latency P99 monitoring
 * - Unified alerting to Slack
 * - Auto-healing actions
 *
 * This runs inside the container alongside the watchdog.
 */

import { createLogger } from '../utils/safe-logger.js';
import { SlackNotificationService } from './slack-notifications.js';

// AbortController is a built-in global in Node.js 16+
declare const AbortController: typeof globalThis.AbortController;

const log = createLogger({ module: 'OpsOrchestrator' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface OpsConfig {
  // Health check intervals
  serviceHealthIntervalMs: number; // Check service health
  costCheckIntervalMs: number; // Check cost metrics
  latencyCheckIntervalMs: number; // Check latency metrics
  externalStatusIntervalMs: number; // Check external provider status

  // Cost thresholds (USD)
  costHourlyWarning: number; // Alert if hourly cost exceeds
  costDailyWarning: number; // Alert if daily cost exceeds
  costDailyCritical: number; // Critical if daily cost exceeds

  // Latency thresholds (ms)
  latencyP99Warning: number; // P99 latency warning
  latencyP99Critical: number; // P99 latency critical

  // Error rate thresholds
  errorRateWarning: number; // 5% = 0.05
  errorRateCritical: number; // 10% = 0.10

  // Alerting
  alertCooldownMs: number; // Cooldown between same alerts
  enableSlack: boolean;
}

const DEFAULT_CONFIG: OpsConfig = {
  serviceHealthIntervalMs: 60_000, // Every minute
  costCheckIntervalMs: 300_000, // Every 5 minutes
  latencyCheckIntervalMs: 30_000, // Every 30 seconds
  externalStatusIntervalMs: 300_000, // Every 5 minutes

  costHourlyWarning: 5, // $5/hour
  costDailyWarning: 50, // $50/day
  costDailyCritical: 100, // $100/day

  latencyP99Warning: 2000, // 2 seconds
  latencyP99Critical: 5000, // 5 seconds

  errorRateWarning: 0.05, // 5%
  errorRateCritical: 0.1, // 10%

  alertCooldownMs: 300_000, // 5 minute cooldown
  enableSlack: true,
};

// ============================================================================
// STATE
// ============================================================================

interface OpsState {
  startedAt: Date;
  isRunning: boolean;
  lastHealthCheck: Date | null;
  lastCostCheck: Date | null;
  lastLatencyCheck: Date | null;
  lastExternalCheck: Date | null;
  alerts: Map<string, Date>; // Alert key -> last sent
  metrics: OpsMetrics;
}

interface OpsMetrics {
  healthChecks: number;
  alertsSent: number;
  autoHealActions: number;
  servicesDown: string[];
  lastErrors: Array<{ service: string; error: string; timestamp: Date }>;
}

let config = { ...DEFAULT_CONFIG };
const state: OpsState = {
  startedAt: new Date(),
  isRunning: false,
  lastHealthCheck: null,
  lastCostCheck: null,
  lastLatencyCheck: null,
  lastExternalCheck: null,
  alerts: new Map(),
  metrics: {
    healthChecks: 0,
    alertsSent: 0,
    autoHealActions: 0,
    servicesDown: [],
    lastErrors: [],
  },
};

let intervals: NodeJS.Timeout[] = [];
let slackService: SlackNotificationService | null = null;

// Log sampling - only log "OK" status every Nth check to reduce noise
const LOG_SAMPLE_INTERVAL = 10;
let healthCheckCount = 0;
let latencyCheckCount = 0;
let costCheckCount = 0;

// ============================================================================
// LAZY IMPORTS (Avoid circular dependencies)
// ============================================================================

async function getHealthMonitors() {
  try {
    return await import('./self-healing/health-monitors.js');
  } catch {
    return null;
  }
}

async function getCostTracking() {
  try {
    return await import('./observability/cost-tracking.js');
  } catch {
    return null;
  }
}

async function getCircuitStats() {
  try {
    const { getAllCircuitStats } = await import('./self-healing/circuit-breaker.js');
    return getAllCircuitStats();
  } catch {
    return [];
  }
}

async function getAIDiagnostics() {
  try {
    return await import('./self-healing/ai-diagnostics.js');
  } catch {
    return null;
  }
}

// ============================================================================
// ALERTING
// ============================================================================

type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

interface Alert {
  severity: AlertSeverity;
  title: string;
  message: string;
  service?: string;
  details?: Record<string, unknown>;
  actionUrl?: string;
}

function shouldSendAlert(alertKey: string): boolean {
  const lastSent = state.alerts.get(alertKey);
  if (!lastSent) return true;
  return Date.now() - lastSent.getTime() > config.alertCooldownMs;
}

async function sendAlert(alert: Alert): Promise<void> {
  const alertKey = `${alert.severity}:${alert.title}`;

  if (!shouldSendAlert(alertKey)) {
    log.debug({ alertKey }, 'Alert rate-limited');
    return;
  }

  state.alerts.set(alertKey, new Date());
  state.metrics.alertsSent++;

  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
    emergency: '🆘',
  }[alert.severity];

  log.warn({ ...alert }, `${emoji} ${alert.title}`);

  if (config.enableSlack && slackService) {
    try {
      const severityMap: Record<AlertSeverity, 'info' | 'warning' | 'error' | 'success'> = {
        info: 'info',
        warning: 'warning',
        critical: 'error',
        emergency: 'error',
      };

      await slackService.notify({
        type:
          alert.severity === 'critical' || alert.severity === 'emergency'
            ? 'incident_opened'
            : 'health_degraded',
        title: alert.title,
        message: alert.message,
        severity: severityMap[alert.severity],
        metadata: alert.details,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to send Slack alert');
    }
  }
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

interface ServiceHealthResult {
  service: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
}

async function checkServiceHealth(): Promise<void> {
  state.lastHealthCheck = new Date();
  state.metrics.healthChecks++;

  const monitors = await getHealthMonitors();
  if (!monitors) {
    log.debug('Health monitors not available');
    return;
  }

  const services = ['livekit', 'cartesia', 'deepgram', 'gemini', 'firestore'];
  const results: ServiceHealthResult[] = [];
  const unhealthyServices: string[] = [];

  for (const service of services) {
    try {
      const result = await monitors.checkServiceHealth(service);
      if (result) {
        // Health check result has 'healthy' boolean, not 'status'
        const isHealthy =
          'healthy' in result
            ? result.healthy
            : (result as unknown as { status: string }).status === 'healthy';

        results.push({
          service,
          healthy: isHealthy,
          latencyMs: (result as unknown as { latencyMs?: number }).latencyMs,
          error: (result as unknown as { error?: string }).error,
        });

        if (!isHealthy) {
          unhealthyServices.push(service);

          // Record error
          state.metrics.lastErrors.push({
            service,
            error: result.error || 'Unknown error',
            timestamp: new Date(),
          });
          if (state.metrics.lastErrors.length > 50) {
            state.metrics.lastErrors.shift();
          }
        }
      }
    } catch (error) {
      unhealthyServices.push(service);
      results.push({
        service,
        healthy: false,
        error: String(error),
      });
    }
  }

  state.metrics.servicesDown = unhealthyServices;

  // Alert on unhealthy services
  if (unhealthyServices.length > 0) {
    const critical = unhealthyServices.filter((s) => ['livekit', 'gemini', 'cartesia'].includes(s));

    if (critical.length > 0) {
      await sendAlert({
        severity: 'critical',
        title: 'Critical Services Down',
        message: `Services failing: ${critical.join(', ')}`,
        details: { unhealthyServices, results },
      });
    } else {
      await sendAlert({
        severity: 'warning',
        title: 'Services Degraded',
        message: `Services unhealthy: ${unhealthyServices.join(', ')}`,
        details: { unhealthyServices, results },
      });
    }
  }

  // Only log healthy status every Nth check to reduce noise
  healthCheckCount++;
  if (unhealthyServices.length > 0 || healthCheckCount % LOG_SAMPLE_INTERVAL === 0) {
    log.info(
      { healthy: services.length - unhealthyServices.length, unhealthy: unhealthyServices.length },
      'Health check complete'
    );
  }
}

// ============================================================================
// COST MONITORING
// ============================================================================

interface CostAlert {
  type: 'hourly' | 'daily';
  amount: number;
  threshold: number;
  projectedDaily?: number;
}

async function checkCosts(): Promise<void> {
  state.lastCostCheck = new Date();

  const costModule = await getCostTracking();
  if (!costModule) {
    log.debug('Cost tracking not available');
    return;
  }

  const snapshot = costModule.getSnapshot();

  const alerts: CostAlert[] = [];

  // Check hourly cost
  if (snapshot.costLastHour >= config.costHourlyWarning) {
    alerts.push({
      type: 'hourly',
      amount: snapshot.costLastHour,
      threshold: config.costHourlyWarning,
      projectedDaily: snapshot.costLastHour * 24,
    });
  }

  // Check daily cost
  if (snapshot.costLast24h >= config.costDailyCritical) {
    await sendAlert({
      severity: 'critical',
      title: 'COST CRITICAL',
      message: `Daily cost $${snapshot.costLast24h.toFixed(2)} exceeds $${config.costDailyCritical}!`,
      details: {
        hourly: snapshot.costLastHour.toFixed(2),
        daily: snapshot.costLast24h.toFixed(2),
        byModel: snapshot.costByModel,
        byProvider: snapshot.costByProvider,
      },
    });
  } else if (snapshot.costLast24h >= config.costDailyWarning) {
    await sendAlert({
      severity: 'warning',
      title: 'Cost Warning',
      message: `Daily cost $${snapshot.costLast24h.toFixed(2)} approaching limit`,
      details: {
        hourly: snapshot.costLastHour.toFixed(2),
        daily: snapshot.costLast24h.toFixed(2),
        byModel: snapshot.costByModel,
      },
    });
  }

  // Only log cost status every Nth check to reduce noise
  costCheckCount++;
  if (costCheckCount % LOG_SAMPLE_INTERVAL === 0) {
    log.info(
      { hourly: snapshot.costLastHour.toFixed(2), daily: snapshot.costLast24h.toFixed(2) },
      'Cost check complete (sampled)'
    );
  }
}

// ============================================================================
// LATENCY MONITORING
// ============================================================================

interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  avg: number;
}

// Simple latency tracking
const latencyHistory: number[] = [];
const MAX_LATENCY_SAMPLES = 1000;

function recordLatencyInternal(latencyMs: number): void {
  latencyHistory.push(latencyMs);
  if (latencyHistory.length > MAX_LATENCY_SAMPLES) {
    latencyHistory.shift();
  }
}

function calculateLatencyMetrics(): LatencyMetrics | null {
  if (latencyHistory.length < 10) return null;

  const sorted = [...latencyHistory].sort((a, b) => a - b);
  const p50Index = Math.floor(sorted.length * 0.5);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p99Index = Math.floor(sorted.length * 0.99);
  const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;

  return {
    p50: sorted[p50Index],
    p95: sorted[p95Index],
    p99: sorted[p99Index],
    avg,
  };
}

async function checkLatency(): Promise<void> {
  state.lastLatencyCheck = new Date();

  const metrics = calculateLatencyMetrics();
  if (!metrics) return;

  if (metrics.p99 >= config.latencyP99Critical) {
    await sendAlert({
      severity: 'critical',
      title: 'Latency Critical',
      message: `P99 latency ${metrics.p99}ms exceeds ${config.latencyP99Critical}ms`,
      details: metrics as unknown as Record<string, unknown>,
    });
  } else if (metrics.p99 >= config.latencyP99Warning) {
    await sendAlert({
      severity: 'warning',
      title: 'Latency Warning',
      message: `P99 latency ${metrics.p99}ms is elevated`,
      details: metrics as unknown as Record<string, unknown>,
    });
  }

  // Only log latency status every Nth check to reduce noise
  latencyCheckCount++;
  if (latencyCheckCount % LOG_SAMPLE_INTERVAL === 0) {
    log.info({ ...metrics }, 'Latency check complete (sampled)');
  }
}

// ============================================================================
// CIRCUIT BREAKER MONITORING
// ============================================================================

async function checkCircuits(): Promise<void> {
  const stats = await getCircuitStats();

  const openCircuits = stats.filter((s) => s.state === 'open');
  const halfOpenCircuits = stats.filter((s) => s.state === 'half_open');

  if (openCircuits.length > 0) {
    await sendAlert({
      severity: 'critical',
      title: 'Circuit Breakers Open',
      message: `${openCircuits.length} circuit(s) open: ${openCircuits.map((c) => c.name).join(', ')}`,
      details: { openCircuits, halfOpenCircuits },
    });
  }
}

// ============================================================================
// EXTERNAL SERVICE STATUS
// ============================================================================

interface ExternalStatus {
  service: string;
  status: 'operational' | 'degraded' | 'down' | 'unknown';
  checkedAt: Date;
}

async function checkExternalStatus(): Promise<void> {
  state.lastExternalCheck = new Date();

  // Check status pages of critical providers
  const statusPages: Array<{ name: string; url: string }> = [
    { name: 'LiveKit', url: 'https://status.livekit.io/api/v2/status.json' },
    { name: 'Deepgram', url: 'https://status.deepgram.com/api/v2/status.json' },
    { name: 'OpenAI', url: 'https://status.openai.com/api/v2/status.json' },
  ];

  const results: ExternalStatus[] = [];

  for (const { name, url } of statusPages) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.ok) {
        const data = (await response.json()) as { status?: { indicator?: string } };
        const indicator = data?.status?.indicator || 'unknown';

        results.push({
          service: name,
          status:
            indicator === 'none'
              ? 'operational'
              : indicator === 'minor'
                ? 'degraded'
                : indicator === 'major' || indicator === 'critical'
                  ? 'down'
                  : 'unknown',
          checkedAt: new Date(),
        });
      }
    } catch {
      results.push({
        service: name,
        status: 'unknown',
        checkedAt: new Date(),
      });
    }
  }

  // Alert on degraded/down services
  const issues = results.filter((r) => r.status === 'degraded' || r.status === 'down');
  if (issues.length > 0) {
    await sendAlert({
      severity: issues.some((i) => i.status === 'down') ? 'critical' : 'warning',
      title: 'External Services Degraded',
      message: `Provider issues: ${issues.map((i) => `${i.service} (${i.status})`).join(', ')}`,
      details: { statuses: results },
    });
  }

  // Don't log external status unless there are issues (checked every 5 min anyway)
}

// ============================================================================
// ERROR RATE MONITORING
// ============================================================================

interface ErrorRateMetrics {
  totalRequests: number;
  totalErrors: number;
  errorRate: number;
  lastMinute: { requests: number; errors: number; rate: number };
}

const requestLog: Array<{ timestamp: number; success: boolean }> = [];
const MAX_REQUEST_LOG = 10000;

function recordRequestInternal(success: boolean): void {
  requestLog.push({ timestamp: Date.now(), success });
  if (requestLog.length > MAX_REQUEST_LOG) {
    requestLog.shift();
  }
}

function calculateErrorRate(): ErrorRateMetrics {
  const now = Date.now();
  const lastMinuteRequests = requestLog.filter((r) => r.timestamp > now - 60_000);

  const totalRequests = requestLog.length;
  const totalErrors = requestLog.filter((r) => !r.success).length;
  const lastMinuteErrors = lastMinuteRequests.filter((r) => !r.success).length;

  return {
    totalRequests,
    totalErrors,
    errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
    lastMinute: {
      requests: lastMinuteRequests.length,
      errors: lastMinuteErrors,
      rate: lastMinuteRequests.length > 0 ? lastMinuteErrors / lastMinuteRequests.length : 0,
    },
  };
}

async function checkErrorRate(): Promise<void> {
  const metrics = calculateErrorRate();

  if (metrics.lastMinute.rate >= config.errorRateCritical) {
    await sendAlert({
      severity: 'critical',
      title: 'Error Rate Critical',
      message: `Error rate ${(metrics.lastMinute.rate * 100).toFixed(1)}% exceeds ${config.errorRateCritical * 100}%`,
      details: metrics as unknown as Record<string, unknown>,
    });
  } else if (metrics.lastMinute.rate >= config.errorRateWarning) {
    await sendAlert({
      severity: 'warning',
      title: 'Error Rate Elevated',
      message: `Error rate ${(metrics.lastMinute.rate * 100).toFixed(1)}% is elevated`,
      details: metrics as unknown as Record<string, unknown>,
    });
  }
}

// ============================================================================
// DISCONNECT PATTERN MONITORING
// ============================================================================

interface DisconnectPattern {
  type: 'zombie_revisions' | 'livekit_stale' | 'startup_race' | 'network' | 'unknown';
  confidence: number;
  indicators: string[];
  suggestedFix: string;
}

async function detectDisconnectPattern(): Promise<DisconnectPattern | null> {
  // Get call quality metrics
  let callQuality;
  try {
    const cqm = await import('./analytics/call-quality-monitor.js');
    callQuality = cqm.calculateMetrics();
  } catch {
    return null;
  }

  // Get crash analytics
  let crashData;
  try {
    const { getCrashSummary } = await import('../agents/shared/crash-analytics.js');
    crashData = getCrashSummary();
  } catch {
    crashData = null;
  }

  const indicators: string[] = [];
  let patternType: DisconnectPattern['type'] = 'unknown';
  let confidence = 0;
  let suggestedFix = 'Run pnpm ops:diagnose for more details';

  // Pattern 1: Zombie revisions (high disconnect rate + "assignment timed out" in logs)
  if (callQuality.disconnectRate > 0.1) {
    indicators.push(`High disconnect rate: ${(callQuality.disconnectRate * 100).toFixed(1)}%`);

    // Check for "assignment timed out" pattern
    if (crashData && crashData.recentCrashes.some((c) => c.error.message.includes('assignment'))) {
      patternType = 'zombie_revisions';
      confidence = 0.9;
      indicators.push('Recent "assignment timed out" errors');
      suggestedFix = 'Run: pnpm ops:zombies:fix';
    }
  }

  // Pattern 2: LiveKit connection stale (connection drops after idle period)
  if (
    crashData &&
    crashData.recentCrashes.some((c) => c.error.message.includes('connection is dead'))
  ) {
    patternType = 'livekit_stale';
    confidence = 0.85;
    indicators.push('LiveKit connection death detected');
    suggestedFix = 'Worker will auto-restart. If persistent, check keepalive config.';
  }

  // Pattern 3: Startup race condition
  if (
    crashData &&
    crashData.recentCrashes.some(
      (c) =>
        c.error.message.includes('runner initialization') || c.error.message.includes('prewarm')
    )
  ) {
    patternType = 'startup_race';
    confidence = 0.8;
    indicators.push('Startup/prewarm timing issues');
    suggestedFix = 'Check prewarm logs. May need to redeploy: ferni deploy gce';
  }

  // Pattern 4: Network issues (ICE failures, transport errors)
  if (
    crashData &&
    crashData.recentCrashes.some(
      (c) => c.error.message.includes('ice_') || c.error.message.includes('transport')
    )
  ) {
    patternType = 'network';
    confidence = 0.7;
    indicators.push('WebRTC/ICE connection issues');
    suggestedFix = 'Check user network quality. May be transient.';
  }

  // Only return pattern if we have meaningful indicators
  if (indicators.length === 0) return null;

  return {
    type: patternType,
    confidence,
    indicators,
    suggestedFix,
  };
}

async function checkDisconnectPatterns(): Promise<void> {
  const pattern = await detectDisconnectPattern();
  if (!pattern) return;

  // Alert if confidence is high enough
  if (pattern.confidence >= 0.8) {
    await sendAlert({
      severity: pattern.type === 'zombie_revisions' ? 'critical' : 'warning',
      title: `Disconnect Pattern: ${pattern.type.replace('_', ' ').toUpperCase()}`,
      message: pattern.suggestedFix,
      details: {
        pattern: pattern.type,
        confidence: `${(pattern.confidence * 100).toFixed(0)}%`,
        indicators: pattern.indicators,
      },
    });
  }
}

// ============================================================================
// AUTO-HEALING ACTIONS
// ============================================================================

async function attemptAutoHeal(issue: string): Promise<boolean> {
  const diagnostics = await getAIDiagnostics();
  if (!diagnostics) return false;

  const diagnosis = diagnostics.quickDiagnose(issue);
  if (!diagnosis || !diagnosis.autoFixable) return false;

  log.info({ issue, fixType: diagnosis.fixType }, 'Attempting auto-heal');
  state.metrics.autoHealActions++;

  switch (diagnosis.fixType) {
    case 'retry':
      // Retry logic handled by circuit breaker
      return true;

    case 'circuit_break':
      // Circuit breaker will handle this
      return true;

    case 'restart':
      // Log for manual intervention
      await sendAlert({
        severity: 'warning',
        title: 'Restart Recommended',
        message: `AI suggests restart: ${diagnosis.suggestedFix}`,
        details: { diagnosis },
      });
      return false;

    default:
      return false;
  }
}

// ============================================================================
// LIFECYCLE
// ============================================================================

export function startOpsOrchestrator(userConfig?: Partial<OpsConfig>): void {
  if (state.isRunning) {
    log.warn('Ops orchestrator already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  state.startedAt = new Date();
  state.isRunning = true;

  // Initialize Slack
  if (config.enableSlack) {
    try {
      slackService = new SlackNotificationService();
    } catch (error) {
      log.warn({ error: String(error) }, 'Slack notifications disabled');
      config.enableSlack = false;
    }
  }

  log.info('🔧 Ops Orchestrator started');

  // Run initial checks
  checkServiceHealth().catch((e) => log.error({ error: String(e) }, 'Initial health check failed'));
  checkCircuits().catch((e) => log.error({ error: String(e) }, 'Initial circuit check failed'));

  // Schedule periodic checks
  intervals.push(
    setInterval(() => {
      checkServiceHealth().catch((e) => log.error({ error: String(e) }, 'Health check failed'));
      checkCircuits().catch((e) => log.error({ error: String(e) }, 'Circuit check failed'));
      checkErrorRate().catch((e) => log.error({ error: String(e) }, 'Error rate check failed'));
      checkDisconnectPatterns().catch((e) =>
        log.error({ error: String(e) }, 'Disconnect pattern check failed')
      );
    }, config.serviceHealthIntervalMs)
  );

  intervals.push(
    setInterval(() => {
      checkCosts().catch((e) => log.error({ error: String(e) }, 'Cost check failed'));
    }, config.costCheckIntervalMs)
  );

  intervals.push(
    setInterval(() => {
      checkLatency().catch((e) => log.error({ error: String(e) }, 'Latency check failed'));
    }, config.latencyCheckIntervalMs)
  );

  intervals.push(
    setInterval(() => {
      checkExternalStatus().catch((e) =>
        log.error({ error: String(e) }, 'External status check failed')
      );
    }, config.externalStatusIntervalMs)
  );
}

export function stopOpsOrchestrator(): void {
  if (!state.isRunning) return;

  log.info('Stopping ops orchestrator...');

  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals = [];
  state.isRunning = false;

  log.info('Ops orchestrator stopped');
}

export function getOpsStatus(): OpsState & { config: OpsConfig } {
  return {
    ...state,
    config,
  };
}

// ============================================================================
// EXPORTS FOR INTEGRATION
// ============================================================================

export const recordLatency = recordLatencyInternal;
export const recordRequest = recordRequestInternal;
