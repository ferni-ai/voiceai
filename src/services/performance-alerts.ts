/**
 * Performance Alerting Service
 *
 * Monitors performance metrics and sends alerts when thresholds are exceeded.
 * Supports Slack and email notifications.
 *
 * @module services/performance-alerts
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  getGlobalPerformanceSummary,
  PERFORMANCE_THRESHOLDS,
} from '../agents/shared/performance/turn-profiler.js';
import { getReliabilityDashboard } from '../agents/shared/tool-execution-reliability.js';

const log = createLogger({ module: 'PerformanceAlerts' });

// ============================================================================
// TYPES
// ============================================================================

export interface AlertConfig {
  /** Enable Slack notifications */
  slackEnabled?: boolean;
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Enable email notifications */
  emailEnabled?: boolean;
  /** Email recipients */
  emailRecipients?: string[];
  /** Slow turn threshold percentage */
  slowTurnThreshold?: number;
  /** Average latency threshold in ms */
  avgLatencyThreshold?: number;
  /** Open circuits threshold */
  openCircuitsThreshold?: number;
  /** How often to check metrics (ms) */
  checkIntervalMs?: number;
  /** Cooldown between same alerts (ms) */
  alertCooldownMs?: number;
}

interface Alert {
  type: 'slow_turns' | 'high_latency' | 'circuit_open' | 'high_failure_rate';
  severity: 'warning' | 'critical';
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Required<AlertConfig> = {
  slackEnabled: false,
  slackWebhookUrl: process.env.SLACK_ALERTS_WEBHOOK || '',
  emailEnabled: false,
  emailRecipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
  slowTurnThreshold: 15, // Alert if > 15% slow turns
  avgLatencyThreshold: 800, // Alert if avg > 800ms
  openCircuitsThreshold: 1, // Alert if any circuits open
  checkIntervalMs: 60000, // Check every minute
  alertCooldownMs: 300000, // 5 minute cooldown between same alerts
};

// ============================================================================
// ALERTING SERVICE
// ============================================================================

class PerformanceAlertingService {
  private config: Required<AlertConfig>;
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private lastAlerts = new Map<string, number>(); // Alert type -> last sent timestamp

  constructor(config: AlertConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring performance
   */
  start(): void {
    if (this.checkInterval) {
      log.warn({}, 'Performance alerting already running');
      return;
    }

    log.info({ config: this.sanitizeConfig() }, '🚨 Starting performance alerting');

    this.checkInterval = setInterval(() => {
      void this.checkAndAlert();
    }, this.config.checkIntervalMs);

    // Initial check
    void this.checkAndAlert();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      log.info({}, '🛑 Performance alerting stopped');
    }
  }

  /**
   * Update configuration
   */
  configure(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
    log.info({ config: this.sanitizeConfig() }, 'Alert config updated');
  }

  /**
   * Check metrics and send alerts if needed
   */
  private async checkAndAlert(): Promise<void> {
    try {
      const turnMetrics = getGlobalPerformanceSummary();
      const reliability = getReliabilityDashboard();

      const alerts: Alert[] = [];

      // Check slow turns
      if (turnMetrics.slowTurnPercentage > this.config.slowTurnThreshold) {
        alerts.push({
          type: 'slow_turns',
          severity: turnMetrics.slowTurnPercentage > 25 ? 'critical' : 'warning',
          message: `Slow turns at ${turnMetrics.slowTurnPercentage.toFixed(1)}% (threshold: ${this.config.slowTurnThreshold}%)`,
          details: {
            percentage: turnMetrics.slowTurnPercentage,
            threshold: this.config.slowTurnThreshold,
            totalTurns: turnMetrics.totalTurns,
          },
          timestamp: new Date(),
        });
      }

      // Check average latency
      if (turnMetrics.avgTurnMs > this.config.avgLatencyThreshold) {
        alerts.push({
          type: 'high_latency',
          severity:
            turnMetrics.avgTurnMs > PERFORMANCE_THRESHOLDS.SLOW_TOTAL_MS ? 'critical' : 'warning',
          message: `Average turn latency at ${Math.round(turnMetrics.avgTurnMs)}ms (threshold: ${this.config.avgLatencyThreshold}ms)`,
          details: {
            avgLatencyMs: turnMetrics.avgTurnMs,
            threshold: this.config.avgLatencyThreshold,
          },
          timestamp: new Date(),
        });
      }

      // Check open circuits
      if (reliability.summary.openCircuits >= this.config.openCircuitsThreshold) {
        alerts.push({
          type: 'circuit_open',
          severity: 'critical',
          message: `${reliability.summary.openCircuits} circuit breaker(s) are OPEN`,
          details: {
            openCircuits: reliability.summary.openCircuits,
            circuits: reliability.circuitBreakers,
          },
          timestamp: new Date(),
        });
      }

      // Check failure rate
      const failureRate =
        reliability.summary.totalCalls > 0
          ? (reliability.summary.totalFailures / reliability.summary.totalCalls) * 100
          : 0;
      if (failureRate > 5 && reliability.summary.totalCalls > 10) {
        alerts.push({
          type: 'high_failure_rate',
          severity: failureRate > 15 ? 'critical' : 'warning',
          message: `Tool failure rate at ${failureRate.toFixed(1)}%`,
          details: {
            failureRate,
            totalCalls: reliability.summary.totalCalls,
            totalFailures: reliability.summary.totalFailures,
          },
          timestamp: new Date(),
        });
      }

      // Send alerts (with cooldown)
      for (const alert of alerts) {
        if (this.shouldSendAlert(alert)) {
          await this.sendAlert(alert);
          this.lastAlerts.set(alert.type, Date.now());
        }
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Error checking performance metrics');
    }
  }

  /**
   * Check if alert should be sent (cooldown logic)
   */
  private shouldSendAlert(alert: Alert): boolean {
    const lastSent = this.lastAlerts.get(alert.type);
    if (!lastSent) return true;
    return Date.now() - lastSent > this.config.alertCooldownMs;
  }

  /**
   * Send alert to configured channels
   */
  private async sendAlert(alert: Alert): Promise<void> {
    log.warn({ alert }, '🚨 Sending performance alert');

    const promises: Promise<void>[] = [];

    if (this.config.slackEnabled && this.config.slackWebhookUrl) {
      promises.push(this.sendSlackAlert(alert));
    }

    if (this.config.emailEnabled && this.config.emailRecipients.length > 0) {
      promises.push(this.sendEmailAlert(alert));
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send Slack notification
   */
  private async sendSlackAlert(alert: Alert): Promise<void> {
    try {
      const emoji = alert.severity === 'critical' ? '🔴' : '⚠️';
      const color = alert.severity === 'critical' ? '#ef4444' : '#f59e0b';

      const payload = {
        attachments: [
          {
            color,
            fallback: `${emoji} ${alert.message}`,
            title: `${emoji} Ferni Voice Agent Performance Alert`,
            text: alert.message,
            fields: Object.entries(alert.details).map(([key, value]) => ({
              title: key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()),
              value: String(value),
              short: true,
            })),
            footer: 'Ferni Performance Monitoring',
            ts: Math.floor(alert.timestamp.getTime() / 1000),
          },
        ],
      };

      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status}`);
      }

      log.info({ type: alert.type }, '✅ Slack alert sent');
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to send Slack alert');
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    try {
      // Use SendGrid or similar email service
      // For now, we'll just log the intent
      log.info(
        {
          recipients: this.config.emailRecipients,
          subject: `[${alert.severity.toUpperCase()}] Ferni Voice Agent: ${alert.type}`,
          message: alert.message,
        },
        '📧 Email alert would be sent (email integration pending)'
      );

      // TODO: Implement actual email sending
      // const { sendEmail } = await import('./email-service.js');
      // await sendEmail({
      //   to: this.config.emailRecipients,
      //   subject: `[${alert.severity.toUpperCase()}] Ferni Voice Agent: ${alert.type}`,
      //   html: this.formatEmailBody(alert),
      // });
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to send email alert');
    }
  }

  /**
   * Sanitize config for logging (hide sensitive values)
   */
  private sanitizeConfig(): Record<string, unknown> {
    return {
      ...this.config,
      slackWebhookUrl: this.config.slackWebhookUrl ? '[REDACTED]' : '',
      emailRecipients: this.config.emailRecipients.map((e) => e.replace(/(.{2}).+@/, '$1***@')),
    };
  }

  /**
   * Get current alert status
   */
  getStatus(): {
    running: boolean;
    lastCheck: Date | null;
    recentAlerts: Array<{ type: string; lastSent: Date }>;
  } {
    return {
      running: this.checkInterval !== null,
      lastCheck: new Date(),
      recentAlerts: Array.from(this.lastAlerts.entries()).map(([type, ts]) => ({
        type,
        lastSent: new Date(ts),
      })),
    };
  }

  /**
   * Manually trigger an alert check
   */
  async triggerCheck(): Promise<void> {
    await this.checkAndAlert();
  }
}

// ============================================================================
// SINGLETON & EXPORTS
// ============================================================================

let alertingService: PerformanceAlertingService | null = null;

export function getPerformanceAlertingService(): PerformanceAlertingService {
  if (!alertingService) {
    alertingService = new PerformanceAlertingService();
  }
  return alertingService;
}

export function startPerformanceAlerting(config?: AlertConfig): void {
  const service = getPerformanceAlertingService();
  if (config) {
    service.configure(config);
  }
  service.start();
}

export function stopPerformanceAlerting(): void {
  if (alertingService) {
    alertingService.stop();
  }
}

export function configurePerformanceAlerts(config: Partial<AlertConfig>): void {
  getPerformanceAlertingService().configure(config);
}

export default PerformanceAlertingService;
