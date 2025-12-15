/**
 * Container Watchdog - Intelligent Self-Monitoring for Voice Agent
 *
 * Runs inside the container to provide:
 * - Real-time disk/memory/CPU monitoring
 * - Proactive alerting before issues become critical
 * - Self-healing (auto-cleanup when disk fills)
 * - Health metrics export
 *
 * Integration:
 *   import { startWatchdog } from './services/container-watchdog.js';
 *   startWatchdog(); // Called in agent startup
 */

import { execSync } from 'child_process';
import { createLogger } from '../utils/safe-logger.js';
import { SlackNotificationService, type NotificationType } from './slack-notifications.js';
import {
  quickDiagnose,
  analyzeFailure,
  type DiagnosticResult,
} from './self-healing/ai-diagnostics.js';

const log = createLogger({ module: 'ContainerWatchdog' });

// ============================================================================
// AI DIAGNOSTICS INTEGRATION
// ============================================================================

/**
 * Recent issues for AI analysis
 */
interface IssueLog {
  timestamp: Date;
  type: 'disk' | 'memory' | 'error' | 'cleanup';
  message: string;
  context?: Record<string, unknown>;
}

const recentIssues: IssueLog[] = [];
const MAX_ISSUE_HISTORY = 50;

function logIssue(issue: Omit<IssueLog, 'timestamp'>): void {
  recentIssues.push({ ...issue, timestamp: new Date() });
  if (recentIssues.length > MAX_ISSUE_HISTORY) {
    recentIssues.shift();
  }
}

/**
 * Use AI to analyze recurring issues and suggest optimizations
 */
async function analyzeIssuesWithAI(): Promise<DiagnosticResult | null> {
  if (recentIssues.length < 3) return null;

  const issueMessages = recentIssues
    .slice(-20)
    .map((i) => `[${i.type}] ${i.message}`)
    .join('\n');

  try {
    // First try quick pattern matching
    const quickResult = quickDiagnose(issueMessages);
    if (quickResult && quickResult.confidence > 0.8) {
      return quickResult;
    }

    // Fall back to Gemini for complex analysis
    return await analyzeFailure([issueMessages], {
      stage: 'session',
      errorType: 'container_health',
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'AI analysis failed');
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface WatchdogConfig {
  // Check intervals
  diskCheckIntervalMs: number;
  memoryCheckIntervalMs: number;
  healthReportIntervalMs: number;

  // Disk thresholds
  diskWarningPercent: number; // Alert
  diskCriticalPercent: number; // Alert + Auto-cleanup
  diskEmergencyPercent: number; // Alert + Aggressive cleanup

  // Memory thresholds
  memoryWarningPercent: number;
  memoryCriticalPercent: number;

  // Auto-cleanup settings
  autoCleanupEnabled: boolean;
  keepImages: number; // Keep last N images for rollback

  // Alerting
  slackEnabled: boolean;
  alertCooldownMs: number; // Don't spam alerts

  // Instance metadata
  instanceName: string;
  zone: string;
}

const DEFAULT_CONFIG: WatchdogConfig = {
  diskCheckIntervalMs: 60_000, // Check disk every minute
  memoryCheckIntervalMs: 30_000, // Check memory every 30s
  healthReportIntervalMs: 3600_000, // Report health hourly

  diskWarningPercent: 70,
  diskCriticalPercent: 85,
  diskEmergencyPercent: 95,

  memoryWarningPercent: 80,
  memoryCriticalPercent: 90,

  autoCleanupEnabled: true,
  keepImages: 3,

  slackEnabled: true,
  alertCooldownMs: 300_000, // 5 minutes between repeat alerts

  instanceName: process.env.GCE_INSTANCE || 'voiceai-agent-gce',
  zone: process.env.GCP_ZONE || 'us-central1-a',
};

// ============================================================================
// TYPES
// ============================================================================

interface DiskStatus {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
}

interface MemoryStatus {
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  usedPercent: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
}

interface DockerStats {
  containersRunning: number;
  containersStopped: number;
  imagesTotal: number;
  imagesDangling: number;
  buildCacheBytes: number;
}

interface WatchdogState {
  startedAt: Date;
  lastDiskCheck: Date | null;
  lastMemoryCheck: Date | null;
  lastHealthReport: Date | null;
  lastCleanup: Date | null;
  lastAlerts: Map<string, Date>; // Alert type -> last sent
  cleanupCount: number;
  alertCount: number;
}

type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

// ============================================================================
// STATE
// ============================================================================

let config = { ...DEFAULT_CONFIG };
let isRunning = false;
let intervals: NodeJS.Timeout[] = [];
let slackService: SlackNotificationService | null = null;

const state: WatchdogState = {
  startedAt: new Date(),
  lastDiskCheck: null,
  lastMemoryCheck: null,
  lastHealthReport: null,
  lastCleanup: null,
  lastAlerts: new Map(),
  cleanupCount: 0,
  alertCount: 0,
};

// ============================================================================
// METRICS COLLECTION
// ============================================================================

function getDiskStatus(): DiskStatus {
  try {
    // Works inside container - checks root filesystem
    const output = execSync('df -B1 / | tail -1', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    const parts = output.split(/\s+/);

    return {
      totalBytes: parseInt(parts[1] || '0', 10),
      usedBytes: parseInt(parts[2] || '0', 10),
      availableBytes: parseInt(parts[3] || '0', 10),
      usedPercent: parseInt((parts[4] || '0').replace('%', ''), 10),
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get disk status');
    return { totalBytes: 0, usedBytes: 0, availableBytes: 0, usedPercent: 0 };
  }
}

function getMemoryStatus(): MemoryStatus {
  const memUsage = process.memoryUsage();

  try {
    // Get system memory
    const memInfo = execSync('cat /proc/meminfo', { encoding: 'utf-8', stdio: 'pipe' });
    const totalMatch = memInfo.match(/MemTotal:\s+(\d+)/);
    const availMatch = memInfo.match(/MemAvailable:\s+(\d+)/);

    const totalKb = parseInt(totalMatch?.[1] || '0', 10);
    const availKb = parseInt(availMatch?.[1] || '0', 10);
    const totalBytes = totalKb * 1024;
    const availableBytes = availKb * 1024;
    const usedBytes = totalBytes - availableBytes;

    return {
      totalBytes,
      usedBytes,
      availableBytes,
      usedPercent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
      heapUsedBytes: memUsage.heapUsed,
      heapTotalBytes: memUsage.heapTotal,
    };
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to get system memory');
    return {
      totalBytes: 0,
      usedBytes: 0,
      availableBytes: 0,
      usedPercent: 0,
      heapUsedBytes: memUsage.heapUsed,
      heapTotalBytes: memUsage.heapTotal,
    };
  }
}

function getDockerStats(): DockerStats | null {
  try {
    // These only work on the host (not inside container)
    // Return null if Docker socket not available
    execSync('docker info', { encoding: 'utf-8', stdio: 'pipe' });

    const containersRunning = parseInt(
      execSync('docker ps -q | wc -l', { encoding: 'utf-8', stdio: 'pipe' }).trim(),
      10
    );
    const containersStopped = parseInt(
      execSync('docker ps -aq --filter status=exited | wc -l', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim(),
      10
    );
    const imagesTotal = parseInt(
      execSync('docker images -q | wc -l', { encoding: 'utf-8', stdio: 'pipe' }).trim(),
      10
    );
    const imagesDangling = parseInt(
      execSync('docker images -f dangling=true -q | wc -l', {
        encoding: 'utf-8',
        stdio: 'pipe',
      }).trim(),
      10
    );

    return {
      containersRunning,
      containersStopped,
      imagesTotal,
      imagesDangling,
      buildCacheBytes: 0, // Would need docker system df parsing
    };
  } catch {
    // Docker not available from inside container (expected)
    return null;
  }
}

// ============================================================================
// CLEANUP ACTIONS
// ============================================================================

interface CleanupResult {
  success: boolean;
  spaceFreedBytes: number;
  actions: string[];
}

function performCleanup(aggressive: boolean): CleanupResult {
  const result: CleanupResult = {
    success: true,
    spaceFreedBytes: 0,
    actions: [],
  };

  const beforeDisk = getDiskStatus();

  try {
    // 1. Clean temp files
    log.info('Cleaning temp files...');
    execSync('rm -rf /tmp/* 2>/dev/null || true', { stdio: 'pipe' });
    result.actions.push('Cleaned /tmp');

    // 2. Clear Node.js cache
    log.info('Clearing Node.js cache...');
    execSync('rm -rf /root/.npm/_cacache 2>/dev/null || true', { stdio: 'pipe' });
    result.actions.push('Cleared npm cache');

    // 3. Truncate logs
    log.info('Truncating logs...');
    execSync('find /var/log -name "*.log" -exec truncate -s 0 {} \\; 2>/dev/null || true', {
      stdio: 'pipe',
    });
    result.actions.push('Truncated logs');

    // 4. If aggressive, clear more
    if (aggressive) {
      log.info('Aggressive cleanup: clearing additional caches...');
      execSync('rm -rf /root/.cache 2>/dev/null || true', { stdio: 'pipe' });
      result.actions.push('Cleared user cache');
    }

    // Calculate space freed
    const afterDisk = getDiskStatus();
    result.spaceFreedBytes = afterDisk.availableBytes - beforeDisk.availableBytes;

    state.lastCleanup = new Date();
    state.cleanupCount++;

    log.info(
      { spaceFreedMb: Math.round(result.spaceFreedBytes / 1024 / 1024), actions: result.actions },
      'Cleanup completed'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Cleanup failed');
    result.success = false;
  }

  return result;
}

// ============================================================================
// ALERTING
// ============================================================================

function shouldSendAlert(alertKey: string): boolean {
  const lastSent = state.lastAlerts.get(alertKey);
  if (!lastSent) return true;

  const elapsed = Date.now() - lastSent.getTime();
  return elapsed > config.alertCooldownMs;
}

async function sendAlert(
  severity: AlertSeverity,
  title: string,
  message: string,
  details?: Record<string, unknown>
): Promise<void> {
  const alertKey = `${severity}:${title}`;

  if (!shouldSendAlert(alertKey)) {
    log.debug({ alertKey }, 'Alert rate-limited');
    return;
  }

  state.lastAlerts.set(alertKey, new Date());
  state.alertCount++;

  const emoji = {
    info: 'ℹ️',
    warning: '⚠️',
    critical: '🚨',
    emergency: '🆘',
  }[severity];

  const fullMessage = `${emoji} *${title}*\n${message}${
    details ? `\n\`\`\`${JSON.stringify(details, null, 2)}\`\`\`` : ''
  }`;

  log.warn({ severity, title, details }, fullMessage);

  // Send to Slack if enabled
  if (config.slackEnabled && slackService) {
    try {
      // Map watchdog severity to Slack notification types
      const typeMap: Record<AlertSeverity, NotificationType> = {
        emergency: 'incident_opened',
        critical: 'health_degraded',
        warning: 'health_degraded',
        info: 'health_recovered',
      };
      const slackSeverityMap: Record<AlertSeverity, 'info' | 'warning' | 'error' | 'success'> = {
        emergency: 'error',
        critical: 'error',
        warning: 'warning',
        info: 'info',
      };

      await slackService.notify({
        type: typeMap[severity],
        title: `[${config.instanceName}] ${title}`,
        message,
        severity: slackSeverityMap[severity],
        metadata: details,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to send Slack alert');
    }
  }
}

// ============================================================================
// MONITORING CHECKS
// ============================================================================

async function checkDisk(): Promise<void> {
  const disk = getDiskStatus();
  state.lastDiskCheck = new Date();

  const details = {
    usedPercent: disk.usedPercent,
    availableGb: (disk.availableBytes / 1024 / 1024 / 1024).toFixed(2),
    totalGb: (disk.totalBytes / 1024 / 1024 / 1024).toFixed(2),
  };

  // Emergency: >= 95% - Aggressive cleanup + alert
  if (disk.usedPercent >= config.diskEmergencyPercent) {
    logIssue({ type: 'disk', message: `Emergency: ${disk.usedPercent}%`, context: details });

    // Get AI suggestion for root cause
    const aiDiagnosis = await analyzeIssuesWithAI();
    const aiSuggestion = aiDiagnosis?.suggestedFix || 'Running aggressive cleanup';

    await sendAlert(
      'emergency',
      'DISK EMERGENCY',
      `Disk at ${disk.usedPercent}%! ${aiSuggestion}`,
      { ...details, aiAnalysis: aiDiagnosis?.rootCause }
    );

    if (config.autoCleanupEnabled) {
      const result = performCleanup(true);
      logIssue({
        type: 'cleanup',
        message: `Freed ${result.spaceFreedBytes} bytes`,
        context: result as unknown as Record<string, unknown>,
      });
      await sendAlert(
        'info',
        'Emergency Cleanup Complete',
        `Freed ${(result.spaceFreedBytes / 1024 / 1024).toFixed(1)} MB`,
        { actions: result.actions }
      );
    }
    return;
  }

  // Critical: >= 85% - Standard cleanup + alert
  if (disk.usedPercent >= config.diskCriticalPercent) {
    logIssue({ type: 'disk', message: `Critical: ${disk.usedPercent}%`, context: details });

    await sendAlert(
      'critical',
      'Disk Critical',
      `Disk at ${disk.usedPercent}%! Running cleanup.`,
      details
    );

    if (config.autoCleanupEnabled) {
      const result = performCleanup(false);
      logIssue({
        type: 'cleanup',
        message: `Freed ${result.spaceFreedBytes} bytes`,
        context: result as unknown as Record<string, unknown>,
      });
      await sendAlert(
        'info',
        'Cleanup Complete',
        `Freed ${(result.spaceFreedBytes / 1024 / 1024).toFixed(1)} MB`,
        { actions: result.actions }
      );
    }
    return;
  }

  // Warning: >= 70% - Just alert
  if (disk.usedPercent >= config.diskWarningPercent) {
    logIssue({ type: 'disk', message: `Warning: ${disk.usedPercent}%`, context: details });

    await sendAlert(
      'warning',
      'Disk Warning',
      `Disk at ${disk.usedPercent}%. Consider cleanup.`,
      details
    );
    return;
  }

  log.debug({ ...details }, 'Disk check OK');
}

async function checkMemory(): Promise<void> {
  const memory = getMemoryStatus();
  state.lastMemoryCheck = new Date();

  const details = {
    systemUsedPercent: memory.usedPercent,
    systemAvailableMb: Math.round(memory.availableBytes / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsedBytes / 1024 / 1024),
    heapTotalMb: Math.round(memory.heapTotalBytes / 1024 / 1024),
  };

  if (memory.usedPercent >= config.memoryCriticalPercent) {
    logIssue({ type: 'memory', message: `Critical: ${memory.usedPercent}%`, context: details });

    // Get AI suggestion for memory issues
    const aiDiagnosis = await analyzeIssuesWithAI();
    const aiSuggestion = aiDiagnosis?.humanExplanation || 'Memory pressure detected';

    await sendAlert(
      'critical',
      'Memory Critical',
      `System memory at ${memory.usedPercent}%! ${aiSuggestion}`,
      { ...details, aiAnalysis: aiDiagnosis?.rootCause }
    );
    return;
  }

  if (memory.usedPercent >= config.memoryWarningPercent) {
    logIssue({ type: 'memory', message: `Warning: ${memory.usedPercent}%`, context: details });

    await sendAlert(
      'warning',
      'Memory Warning',
      `System memory at ${memory.usedPercent}%.`,
      details
    );
    return;
  }

  log.debug({ ...details }, 'Memory check OK');
}

async function sendHealthReport(): Promise<void> {
  const disk = getDiskStatus();
  const memory = getMemoryStatus();
  const uptime = Math.round((Date.now() - state.startedAt.getTime()) / 1000 / 60); // minutes

  state.lastHealthReport = new Date();

  // Get AI insights if there have been issues
  let aiInsights: string | null = null;
  if (recentIssues.length >= 3) {
    const diagnosis = await analyzeIssuesWithAI();
    if (diagnosis && diagnosis.confidence > 0.6) {
      aiInsights = `🤖 AI Analysis: ${diagnosis.rootCause}\nSuggestion: ${diagnosis.suggestedFix}`;
    }
  }

  const report = {
    instance: config.instanceName,
    uptimeMinutes: uptime,
    disk: {
      usedPercent: disk.usedPercent,
      availableGb: (disk.availableBytes / 1024 / 1024 / 1024).toFixed(2),
    },
    memory: {
      systemUsedPercent: memory.usedPercent,
      heapUsedMb: Math.round(memory.heapUsedBytes / 1024 / 1024),
    },
    watchdog: {
      cleanupCount: state.cleanupCount,
      alertCount: state.alertCount,
      recentIssueCount: recentIssues.length,
    },
    aiInsights,
  };

  log.info(report, 'Hourly health report');

  // Only send to Slack if there's something notable
  if (disk.usedPercent > 50 || memory.usedPercent > 60 || state.cleanupCount > 0 || aiInsights) {
    const message = aiInsights
      ? `Uptime: ${uptime}m | Disk: ${disk.usedPercent}% | Memory: ${memory.usedPercent}%\n${aiInsights}`
      : `Uptime: ${uptime}m | Disk: ${disk.usedPercent}% | Memory: ${memory.usedPercent}%`;

    await sendAlert('info', 'Hourly Health Report', message, report);
  }
}

// ============================================================================
// WATCHDOG LIFECYCLE
// ============================================================================

export function startWatchdog(userConfig?: Partial<WatchdogConfig>): void {
  if (isRunning) {
    log.warn('Watchdog already running');
    return;
  }

  config = { ...DEFAULT_CONFIG, ...userConfig };
  state.startedAt = new Date();
  isRunning = true;

  // Initialize Slack service
  if (config.slackEnabled) {
    try {
      slackService = new SlackNotificationService();
    } catch (error) {
      log.warn({ error: String(error) }, 'Slack notifications disabled');
      config.slackEnabled = false;
    }
  }

  log.info(
    {
      config: {
        diskWarning: config.diskWarningPercent,
        diskCritical: config.diskCriticalPercent,
        autoCleanup: config.autoCleanupEnabled,
      },
    },
    '🐕 Container Watchdog started'
  );

  // Run initial checks
  checkDisk().catch((e) => log.error({ error: String(e) }, 'Initial disk check failed'));
  checkMemory().catch((e) => log.error({ error: String(e) }, 'Initial memory check failed'));

  // Schedule periodic checks
  intervals.push(
    setInterval(() => {
      checkDisk().catch((e) => log.error({ error: String(e) }, 'Disk check failed'));
    }, config.diskCheckIntervalMs)
  );

  intervals.push(
    setInterval(() => {
      checkMemory().catch((e) => log.error({ error: String(e) }, 'Memory check failed'));
    }, config.memoryCheckIntervalMs)
  );

  intervals.push(
    setInterval(() => {
      sendHealthReport().catch((e) => log.error({ error: String(e) }, 'Health report failed'));
    }, config.healthReportIntervalMs)
  );
}

export function stopWatchdog(): void {
  if (!isRunning) {
    return;
  }

  log.info('Stopping watchdog...');

  for (const interval of intervals) {
    clearInterval(interval);
  }
  intervals = [];
  isRunning = false;

  log.info('Watchdog stopped');
}

export function getWatchdogStatus(): WatchdogState & {
  isRunning: boolean;
  config: WatchdogConfig;
} {
  return {
    ...state,
    isRunning,
    config,
  };
}

// ============================================================================
// HEALTH ENDPOINT DATA
// ============================================================================

export interface WatchdogHealthData {
  watchdogRunning: boolean;
  uptimeMinutes: number;
  disk: DiskStatus;
  memory: MemoryStatus;
  docker: DockerStats | null;
  cleanupCount: number;
  alertCount: number;
  lastCleanup: Date | null;
  recentIssues: IssueLog[];
}

export function getHealthData(): WatchdogHealthData {
  return {
    watchdogRunning: isRunning,
    uptimeMinutes: Math.round((Date.now() - state.startedAt.getTime()) / 1000 / 60),
    disk: getDiskStatus(),
    memory: getMemoryStatus(),
    docker: getDockerStats(),
    cleanupCount: state.cleanupCount,
    alertCount: state.alertCount,
    lastCleanup: state.lastCleanup,
    recentIssues: recentIssues.slice(-10), // Last 10 issues
  };
}

/**
 * Manually trigger AI analysis of recent issues
 * Useful for debugging or on-demand diagnostics
 */
export async function runAIDiagnostics(): Promise<DiagnosticResult | null> {
  log.info('Running on-demand AI diagnostics...');
  return analyzeIssuesWithAI();
}

/**
 * Log a custom issue for AI analysis
 */
export function reportIssue(
  type: IssueLog['type'],
  message: string,
  context?: Record<string, unknown>
): void {
  logIssue({ type, message, context });
}
