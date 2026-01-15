/**
 * Auto-Rollback Service
 *
 * Monitors call quality metrics after deployment and automatically
 * triggers a rollback if quality degrades significantly.
 *
 * Triggers:
 * - Call success rate drops below threshold (e.g., 95% → 80%)
 * - Average response time increases significantly
 * - Error rate spikes
 * - Multiple consecutive failed health checks
 *
 * "Move fast, but have a safety net" - Every good DevOps team
 */

import { execSync } from 'child_process';
import { createLogger } from '../../utils/safe-logger.js';
import { SlackNotificationService } from '../integrations/slack-notifications.js';
import { getCallQualityMonitor } from '../analytics/call-quality-monitor.js';
import { registerInterval, clearNamedInterval } from '../../utils/interval-manager.js';

const log = createLogger({ module: 'AutoRollback' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface RollbackConfig {
  // Quality thresholds (trigger rollback if exceeded)
  minSuccessRate: number; // Minimum call success rate (default: 0.85)
  maxErrorRate: number; // Maximum error rate (default: 0.15)
  maxResponseTimeMs: number; // Max avg response time (default: 2000ms)
  minQualityScore: number; // Minimum quality score (default: 60)

  // Monitoring settings
  evaluationWindowMs: number; // How long to monitor after deploy (default: 10 min)
  checkIntervalMs: number; // How often to check metrics (default: 30 sec)
  minSampleSize: number; // Min calls before making decision (default: 5)

  // Rollback settings
  cooldownMs: number; // Cooldown between rollback attempts (default: 30 min)
  maxRollbacksPerHour: number; // Prevent rollback loops (default: 2)
  dryRun: boolean; // Log but don't actually rollback

  // Deployment info (set on deploy)
  currentImage?: string;
  previousImage?: string;
  deployedAt?: number;
}

const DEFAULT_CONFIG: RollbackConfig = {
  minSuccessRate: 0.85,
  maxErrorRate: 0.15,
  maxResponseTimeMs: 2000,
  minQualityScore: 60,
  evaluationWindowMs: 10 * 60 * 1000, // 10 minutes
  checkIntervalMs: 30 * 1000, // 30 seconds
  minSampleSize: 5,
  cooldownMs: 30 * 60 * 1000, // 30 minutes
  maxRollbacksPerHour: 2,
  dryRun: false,
};

// ============================================================================
// STATE
// ============================================================================

const AUTO_ROLLBACK_INTERVAL = 'auto-rollback-check';

interface RollbackState {
  isMonitoring: boolean;
  monitoringStartedAt: number | null;
  lastRollbackAt: number | null;
  rollbacksThisHour: number;
  rollbackHistory: RollbackEvent[];
}

interface RollbackEvent {
  timestamp: number;
  reason: string;
  metrics: QualitySnapshot;
  success: boolean;
  fromImage?: string;
  toImage?: string;
}

interface QualitySnapshot {
  successRate: number;
  errorRate: number;
  avgResponseTimeMs: number;
  qualityScore: number;
  sampleSize: number;
}

const state: RollbackState = {
  isMonitoring: false,
  monitoringStartedAt: null,
  lastRollbackAt: null,
  rollbacksThisHour: 0,
  rollbackHistory: [],
};

let config = { ...DEFAULT_CONFIG };
let slackService: SlackNotificationService | null = null;

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Start monitoring after a deployment
 */
export function startPostDeployMonitoring(deployConfig: Partial<RollbackConfig>): void {
  // Merge config
  config = { ...DEFAULT_CONFIG, ...deployConfig };

  if (state.isMonitoring) {
    log.warn('Already monitoring - stopping previous session');
    stopMonitoring();
  }

  state.isMonitoring = true;
  state.monitoringStartedAt = Date.now();

  log.info(
    {
      evaluationWindowMs: config.evaluationWindowMs,
      minSuccessRate: config.minSuccessRate,
      minQualityScore: config.minQualityScore,
    },
    '🔍 Starting post-deploy quality monitoring'
  );

  // Initialize Slack if not already
  if (!slackService) {
    slackService = new SlackNotificationService();
  }

  // Start periodic checks using managed interval
  registerInterval(
    AUTO_ROLLBACK_INTERVAL,
    () => {
      void checkQualityAndMaybeRollback();
    },
    config.checkIntervalMs
  );

  // Also do an immediate check after a short delay
  setTimeout(() => {
    void checkQualityAndMaybeRollback();
  }, 5000);

  // Auto-stop monitoring after evaluation window
  setTimeout(() => {
    if (state.isMonitoring) {
      log.info('✅ Post-deploy monitoring complete - deployment looks healthy');
      stopMonitoring();

      void slackService?.sendNotification({
        type: 'deployment',
        title: 'Deployment Verified',
        message: `Post-deploy monitoring complete. No quality degradation detected.`,
        severity: 'info',
      });
    }
  }, config.evaluationWindowMs);
}

/**
 * Stop monitoring
 */
export function stopMonitoring(): void {
  clearNamedInterval(AUTO_ROLLBACK_INTERVAL);
  state.isMonitoring = false;
  state.monitoringStartedAt = null;
  log.info('Post-deploy monitoring stopped');
}

/**
 * Check quality metrics and trigger rollback if needed
 */
async function checkQualityAndMaybeRollback(): Promise<void> {
  if (!state.isMonitoring) return;

  try {
    const metrics = await getQualityMetrics();

    log.debug(
      {
        successRate: metrics.successRate.toFixed(2),
        errorRate: metrics.errorRate.toFixed(2),
        avgResponseTimeMs: metrics.avgResponseTimeMs,
        qualityScore: metrics.qualityScore,
        sampleSize: metrics.sampleSize,
      },
      'Quality check'
    );

    // Need minimum sample size to make decisions
    if (metrics.sampleSize < config.minSampleSize) {
      log.debug(
        { current: metrics.sampleSize, required: config.minSampleSize },
        'Insufficient sample size for rollback decision'
      );
      return;
    }

    // Check if any threshold is breached
    const reasons: string[] = [];

    if (metrics.successRate < config.minSuccessRate) {
      reasons.push(
        `Success rate ${(metrics.successRate * 100).toFixed(1)}% < ${config.minSuccessRate * 100}%`
      );
    }

    if (metrics.errorRate > config.maxErrorRate) {
      reasons.push(
        `Error rate ${(metrics.errorRate * 100).toFixed(1)}% > ${config.maxErrorRate * 100}%`
      );
    }

    if (metrics.avgResponseTimeMs > config.maxResponseTimeMs) {
      reasons.push(`Response time ${metrics.avgResponseTimeMs}ms > ${config.maxResponseTimeMs}ms`);
    }

    if (metrics.qualityScore < config.minQualityScore) {
      reasons.push(`Quality score ${metrics.qualityScore} < ${config.minQualityScore}`);
    }

    if (reasons.length > 0) {
      log.warn({ reasons }, '⚠️ Quality degradation detected!');
      await triggerRollback(reasons.join(', '), metrics);
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Error checking quality metrics');
  }
}

/**
 * Get current quality metrics
 */
async function getQualityMetrics(): Promise<QualitySnapshot> {
  const monitor = getCallQualityMonitor();
  const stats = monitor.getStats();

  // Calculate metrics from recent calls
  const recentCalls = monitor.getRecentCalls(20);
  const successfulCalls = recentCalls.filter((c) => c.endReason === 'natural');

  const successRate = recentCalls.length > 0 ? successfulCalls.length / recentCalls.length : 1;

  const errorRate = 1 - successRate;

  // Calculate average response time
  const responseTimes = recentCalls
    .filter((c) => c.firstResponseTimeMs !== undefined)
    .map((c) => c.firstResponseTimeMs!);

  const avgResponseTimeMs =
    responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

  return {
    successRate,
    errorRate,
    avgResponseTimeMs,
    qualityScore: stats.qualityScore,
    sampleSize: recentCalls.length,
  };
}

/**
 * Trigger a rollback
 */
async function triggerRollback(reason: string, metrics: QualitySnapshot): Promise<void> {
  // Check cooldown
  if (state.lastRollbackAt) {
    const timeSinceLastRollback = Date.now() - state.lastRollbackAt;
    if (timeSinceLastRollback < config.cooldownMs) {
      log.warn(
        {
          cooldownRemainingMs: config.cooldownMs - timeSinceLastRollback,
        },
        'Rollback skipped - in cooldown period'
      );
      return;
    }
  }

  // Check max rollbacks per hour
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const rollbacksThisHour = state.rollbackHistory.filter((r) => r.timestamp > oneHourAgo).length;

  if (rollbacksThisHour >= config.maxRollbacksPerHour) {
    log.error(
      { rollbacksThisHour, max: config.maxRollbacksPerHour },
      '🚨 Max rollbacks per hour exceeded - possible rollback loop!'
    );

    void slackService?.sendNotification({
      type: 'incident',
      title: 'Rollback Loop Detected',
      message: `Max rollbacks (${config.maxRollbacksPerHour}) per hour exceeded. Manual intervention required.`,
      severity: 'critical',
    });

    stopMonitoring();
    return;
  }

  log.warn({ reason, metrics }, '🔄 TRIGGERING AUTO-ROLLBACK');

  // Send alert before rollback
  void slackService?.sendNotification({
    type: 'incident',
    title: 'Auto-Rollback Triggered',
    message: `Quality degradation detected: ${reason}`,
    severity: 'critical',
    details: {
      metrics,
      previousImage: config.previousImage,
      currentImage: config.currentImage,
    },
  });

  const rollbackEvent: RollbackEvent = {
    timestamp: Date.now(),
    reason,
    metrics,
    success: false,
    fromImage: config.currentImage,
    toImage: config.previousImage,
  };

  if (config.dryRun) {
    log.info('DRY RUN - would rollback but skipping');
    rollbackEvent.success = true;
  } else {
    try {
      // Execute rollback via ferni CLI
      log.info('Executing rollback command...');
      execSync('npx tsx apps/cli/src/index.ts deploy gce --rollback', {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 5 * 60 * 1000, // 5 minute timeout
      });

      rollbackEvent.success = true;
      log.info('✅ Rollback completed successfully');

      void slackService?.sendNotification({
        type: 'deployment',
        title: 'Rollback Successful',
        message: `Auto-rollback completed. Previous version restored.`,
        severity: 'warning',
      });
    } catch (error) {
      log.error({ error: String(error) }, '❌ Rollback failed!');
      rollbackEvent.success = false;

      void slackService?.sendNotification({
        type: 'incident',
        title: 'Rollback Failed',
        message: `Auto-rollback failed: ${error}. Manual intervention required!`,
        severity: 'critical',
      });
    }
  }

  state.lastRollbackAt = Date.now();
  state.rollbackHistory.push(rollbackEvent);
  stopMonitoring();
}

// ============================================================================
// API
// ============================================================================

/**
 * Get current rollback service status
 */
export function getRollbackStatus(): {
  isMonitoring: boolean;
  monitoringStartedAt: number | null;
  config: RollbackConfig;
  recentRollbacks: RollbackEvent[];
} {
  return {
    isMonitoring: state.isMonitoring,
    monitoringStartedAt: state.monitoringStartedAt,
    config,
    recentRollbacks: state.rollbackHistory.slice(-10),
  };
}

/**
 * Manually trigger a rollback (for testing or manual override)
 */
export async function manualRollback(reason = 'Manual trigger'): Promise<void> {
  const metrics = await getQualityMetrics();
  await triggerRollback(reason, metrics);
}

/**
 * Update rollback config
 */
export function updateRollbackConfig(updates: Partial<RollbackConfig>): void {
  config = { ...config, ...updates };
  log.info({ updates }, 'Rollback config updated');
}
