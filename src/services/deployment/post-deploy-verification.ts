/**
 * Post-Deploy Verification - Automatic Smoke Tests
 *
 * Automatically runs verification tests after deployment:
 * - Health endpoint checks
 * - API endpoint verification
 * - Service connectivity tests
 * - Response time validation
 * - Rollback if critical checks fail
 *
 * "Trust, but verify" - Ronald Reagan (and also good DevOps)
 */

import { createLogger } from '../../utils/safe-logger.js';
import { SlackNotificationService } from '../slack-notifications.js';

// AbortController is a built-in global in Node.js 16+
declare const AbortController: typeof globalThis.AbortController;

const log = createLogger({ module: 'PostDeployVerification' });

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface VerificationConfig {
  // Timeouts
  checkTimeoutMs: number;
  totalTimeoutMs: number;

  // Retries
  maxRetries: number;
  retryDelayMs: number;

  // Thresholds
  maxResponseTimeMs: number;
  requiredSuccessRate: number; // 0-1

  // Rollback
  enableAutoRollback: boolean;
  rollbackOnCriticalFail: boolean;

  enableSlack: boolean;
}

const DEFAULT_CONFIG: VerificationConfig = {
  checkTimeoutMs: 10_000, // 10 seconds per check
  totalTimeoutMs: 300_000, // 5 minutes total
  maxRetries: 3,
  retryDelayMs: 2_000,
  maxResponseTimeMs: 5_000, // 5 second max response
  requiredSuccessRate: 0.9, // 90% of checks must pass
  enableAutoRollback: true,
  rollbackOnCriticalFail: true,
  enableSlack: true,
};

// ============================================================================
// TYPES
// ============================================================================

export type CheckType = 'health' | 'api' | 'connectivity' | 'performance' | 'custom';
export type CheckSeverity = 'critical' | 'major' | 'minor';
export type CheckStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface VerificationCheck {
  name: string;
  type: CheckType;
  severity: CheckSeverity;
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  expectedStatus?: number;
  expectedBody?: RegExp | string;
  validator?: (response: VerificationResponse) => boolean;
  description?: string;
}

export interface VerificationResponse {
  status: number;
  body: string;
  responseTimeMs: number;
  headers: Record<string, string>;
}

export interface CheckResult {
  check: VerificationCheck;
  status: CheckStatus;
  responseTimeMs?: number;
  error?: string;
  attempts: number;
  startedAt: number;
  completedAt?: number;
}

export interface VerificationResult {
  deploymentId: string;
  service: string;
  environment: string;
  version?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  passed: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  skippedChecks: number;
  successRate: number;
  criticalFailures: string[];
  checkResults: CheckResult[];
  rollbackTriggered: boolean;
  rollbackReason?: string;
}

// ============================================================================
// DEFAULT CHECKS
// ============================================================================

export const DEFAULT_CHECKS: VerificationCheck[] = [
  // Health checks (Critical)
  {
    name: 'Health endpoint',
    type: 'health',
    severity: 'critical',
    endpoint: '/health',
    expectedStatus: 200,
    description: 'Basic server liveness check',
  },
  {
    name: 'Ready endpoint',
    type: 'health',
    severity: 'critical',
    endpoint: '/health/ready',
    expectedStatus: 200,
    description: 'Worker readiness check',
  },

  // API checks (Major)
  {
    name: 'Agents API',
    type: 'api',
    severity: 'major',
    endpoint: '/api/agents',
    expectedStatus: 200,
    expectedBody: 'agents',
    description: 'Agent registry accessibility',
  },

  // Connectivity checks (Major)
  {
    name: 'Watchdog status',
    type: 'connectivity',
    severity: 'major',
    endpoint: '/api/watchdog',
    expectedStatus: 200,
    description: 'Container watchdog operational',
  },

  // Performance checks (Minor)
  {
    name: 'Response time check',
    type: 'performance',
    severity: 'minor',
    endpoint: '/health',
    validator: (response) => response.responseTimeMs < 1000,
    description: 'Health endpoint responds under 1s',
  },
];

// ============================================================================
// VERIFICATION RUNNER
// ============================================================================

let config = { ...DEFAULT_CONFIG };
let slackService: SlackNotificationService | null = null;

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function makeRequest(
  baseUrl: string,
  check: VerificationCheck
): Promise<VerificationResponse> {
  const url = `${baseUrl}${check.endpoint || ''}`;
  const startTime = Date.now();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.checkTimeoutMs);

  try {
    const response = await fetch(url, {
      method: check.method || 'GET',
      body: check.body ? JSON.stringify(check.body) : undefined,
      headers: check.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: controller.signal,
    });

    const body = await response.text();
    const responseTimeMs = Date.now() - startTime;

    // Extract headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      body,
      responseTimeMs,
      headers,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runCheck(baseUrl: string, check: VerificationCheck): Promise<CheckResult> {
  const result: CheckResult = {
    check,
    status: 'running',
    attempts: 0,
    startedAt: Date.now(),
  };

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    result.attempts = attempt;

    try {
      if (!check.endpoint && !check.validator) {
        result.status = 'skipped';
        result.error = 'No endpoint or validator defined';
        break;
      }

      if (check.endpoint) {
        const response = await makeRequest(baseUrl, check);
        result.responseTimeMs = response.responseTimeMs;

        // Check status code
        if (check.expectedStatus && response.status !== check.expectedStatus) {
          throw new Error(`Expected status ${check.expectedStatus}, got ${response.status}`);
        }

        // Check body
        if (check.expectedBody) {
          const bodyMatches =
            check.expectedBody instanceof RegExp
              ? check.expectedBody.test(response.body)
              : response.body.includes(check.expectedBody);

          if (!bodyMatches) {
            throw new Error(`Response body did not match expected pattern`);
          }
        }

        // Check response time
        if (response.responseTimeMs > config.maxResponseTimeMs) {
          throw new Error(
            `Response time ${response.responseTimeMs}ms exceeded ${config.maxResponseTimeMs}ms`
          );
        }

        // Custom validator
        if (check.validator && !check.validator(response)) {
          throw new Error('Custom validator failed');
        }
      }

      // Check passed
      result.status = 'passed';
      break;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      result.error = errorMsg;

      if (attempt < config.maxRetries) {
        log.debug({ check: check.name, attempt, error: errorMsg }, 'Check failed, retrying');
        await sleep(config.retryDelayMs);
      } else {
        result.status = 'failed';
      }
    }
  }

  result.completedAt = Date.now();
  return result;
}

// ============================================================================
// MAIN VERIFICATION
// ============================================================================

export async function runVerification(
  baseUrl: string,
  deploymentId: string,
  service: string,
  environment: string,
  version?: string,
  checks: VerificationCheck[] = DEFAULT_CHECKS,
  userConfig?: Partial<VerificationConfig>
): Promise<VerificationResult> {
  config = { ...DEFAULT_CONFIG, ...userConfig };

  // Initialize Slack
  if (config.enableSlack && !slackService) {
    try {
      slackService = new SlackNotificationService();
    } catch {
      config.enableSlack = false;
    }
  }

  const result: VerificationResult = {
    deploymentId,
    service,
    environment,
    version,
    startedAt: Date.now(),
    passed: false,
    totalChecks: checks.length,
    passedChecks: 0,
    failedChecks: 0,
    skippedChecks: 0,
    successRate: 0,
    criticalFailures: [],
    checkResults: [],
    rollbackTriggered: false,
  };

  log.info(
    { deploymentId, service, environment, checkCount: checks.length },
    '🔍 Starting post-deploy verification'
  );

  // Run checks in order (critical first)
  const sortedChecks = [...checks].sort((a, b) => {
    const severityOrder = { critical: 0, major: 1, minor: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });

  for (const check of sortedChecks) {
    // Check total timeout
    if (Date.now() - result.startedAt > config.totalTimeoutMs) {
      log.warn('Verification timed out');
      break;
    }

    const checkResult = await runCheck(baseUrl, check);
    result.checkResults.push(checkResult);

    if (checkResult.status === 'passed') {
      result.passedChecks++;
      log.debug({ check: check.name }, '✅ Check passed');
    } else if (checkResult.status === 'failed') {
      result.failedChecks++;
      log.warn({ check: check.name, error: checkResult.error }, '❌ Check failed');

      if (check.severity === 'critical') {
        result.criticalFailures.push(check.name);

        // Fail fast on critical failures
        if (config.rollbackOnCriticalFail) {
          result.rollbackTriggered = true;
          result.rollbackReason = `Critical check failed: ${check.name}`;
          log.error({ check: check.name }, '🛑 Critical failure - stopping verification');
          break;
        }
      }
    } else {
      result.skippedChecks++;
    }
  }

  // Calculate results
  result.completedAt = Date.now();
  result.durationMs = result.completedAt - result.startedAt;
  result.successRate =
    result.totalChecks > 0 ? result.passedChecks / (result.totalChecks - result.skippedChecks) : 0;
  result.passed =
    result.criticalFailures.length === 0 && result.successRate >= config.requiredSuccessRate;

  // Log final result
  const emoji = result.passed ? '✅' : '❌';
  log.info(
    {
      passed: result.passed,
      successRate: `${(result.successRate * 100).toFixed(1)}%`,
      duration: `${result.durationMs}ms`,
      passed_count: result.passedChecks,
      failed_count: result.failedChecks,
      criticalFailures: result.criticalFailures,
    },
    `${emoji} Verification ${result.passed ? 'PASSED' : 'FAILED'}`
  );

  // Send Slack notification
  if (config.enableSlack && slackService) {
    await sendVerificationSlackNotification(result);
  }

  return result;
}

async function sendVerificationSlackNotification(result: VerificationResult): Promise<void> {
  if (!slackService) return;

  try {
    if (result.passed) {
      await slackService.notify({
        type: 'deployment_success',
        title: `✅ Deploy Verification Passed: ${result.service}`,
        message: [
          `**Environment:** ${result.environment}`,
          `**Version:** ${result.version || 'unknown'}`,
          `**Checks:** ${result.passedChecks}/${result.totalChecks} passed (${(result.successRate * 100).toFixed(1)}%)`,
          `**Duration:** ${result.durationMs}ms`,
        ].join('\n'),
        severity: 'info',
        metadata: {
          deploymentId: result.deploymentId,
          service: result.service,
          successRate: result.successRate,
        },
      });
    } else {
      await slackService.notify({
        type: 'deployment_failed',
        title: `❌ Deploy Verification Failed: ${result.service}`,
        message: [
          `**Environment:** ${result.environment}`,
          `**Version:** ${result.version || 'unknown'}`,
          `**Checks:** ${result.passedChecks}/${result.totalChecks} passed`,
          `**Critical Failures:** ${result.criticalFailures.join(', ') || 'None'}`,
          result.rollbackTriggered ? `\n⚠️ **Rollback triggered:** ${result.rollbackReason}` : '',
        ].join('\n'),
        severity: 'error',
        metadata: {
          deploymentId: result.deploymentId,
          criticalFailures: result.criticalFailures,
        },
      });
    }
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to send Slack notification');
  }
}

// ============================================================================
// ROLLBACK SUPPORT
// ============================================================================

export interface RollbackConfig {
  service: string;
  region: string;
  previousRevision?: string;
}

export async function triggerRollback(
  rollbackConfig: RollbackConfig
): Promise<{ success: boolean; message: string }> {
  const { service, region, previousRevision } = rollbackConfig;

  log.warn({ service, region, previousRevision }, '🔄 Triggering rollback');

  try {
    // In a real implementation, this would:
    // 1. Call gcloud CLI or Cloud Run API to shift traffic
    // 2. Or for GCE, restart the previous container

    // For now, we log the rollback request
    // The actual rollback is handled by the deploy script

    const message = previousRevision
      ? `Rollback requested to revision ${previousRevision}`
      : `Rollback requested for ${service}`;

    log.info({ service, previousRevision }, message);

    // Notify Slack
    if (slackService) {
      await slackService.notify({
        type: 'incident_opened',
        title: `🔄 Rollback Triggered: ${service}`,
        message: [
          `**Region:** ${region}`,
          `**Previous Revision:** ${previousRevision || 'auto-select'}`,
          '',
          'Deployment verification failed. Rolling back to previous stable version.',
        ].join('\n'),
        severity: 'error',
      });
    }

    return { success: true, message };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error({ error: errorMsg }, 'Rollback failed');
    return { success: false, message: errorMsg };
  }
}

// ============================================================================
// QUICK VERIFICATION HELPERS
// ============================================================================

/**
 * Quick health check - just verify service is up
 */
export async function quickHealthCheck(
  baseUrl: string
): Promise<{ healthy: boolean; responseTimeMs: number; error?: string }> {
  try {
    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    const responseTimeMs = Date.now() - startTime;

    return {
      healthy: response.ok,
      responseTimeMs,
      error: response.ok ? undefined : `Status ${response.status}`,
    };
  } catch (error) {
    return {
      healthy: false,
      responseTimeMs: -1,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Full verification with default checks
 */
export async function verifyDeployment(
  baseUrl: string,
  service: string,
  version?: string
): Promise<VerificationResult> {
  const deploymentId = `deploy-${Date.now()}`;
  const environment = baseUrl.includes('localhost') ? 'development' : 'production';

  return runVerification(baseUrl, deploymentId, service, environment, version, DEFAULT_CHECKS);
}
