/**
 * Performance Alerting Service
 *
 * Monitors performance metrics and sends alerts when thresholds are exceeded.
 * Supports Slack and email notifications.
 *
 * @module services/performance-alerts
 */

import { createLogger } from '../../utils/safe-logger.js';
import { registerInterval, clearNamedInterval, hasInterval } from '../../utils/interval-manager.js';
import {
  getGlobalPerformanceSummary,
  PERFORMANCE_THRESHOLDS,
} from './performance/turn-profiler.js';
import { getReliabilityDashboard } from './performance/tool-execution-reliability.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';

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

const PERFORMANCE_ALERT_INTERVAL = 'performance-alerts-check';

class PerformanceAlertingService {
  private config: Required<AlertConfig>;
  private lastAlerts = new Map<string, number>(); // Alert type -> last sent timestamp

  constructor(config: AlertConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start monitoring performance
   */
  start(): void {
    if (hasInterval(PERFORMANCE_ALERT_INTERVAL)) {
      log.warn({}, 'Performance alerting already running');
      return;
    }

    log.info({ config: this.sanitizeConfig() }, '🚨 Starting performance alerting');

    registerInterval(
      PERFORMANCE_ALERT_INTERVAL,
      () => {
        void this.checkAndAlert();
      },
      this.config.checkIntervalMs
    );

    // Initial check
    void this.checkAndAlert();
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    clearNamedInterval(PERFORMANCE_ALERT_INTERVAL);
    log.info({}, '🛑 Performance alerting stopped');
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

    const promises: Array<Promise<void>> = [];

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
   * Send email notification via SendGrid
   */
  private async sendEmailAlert(alert: Alert): Promise<void> {
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.ALERT_FROM_EMAIL || 'alerts@ferni.ai';

    if (!sendgridApiKey) {
      log.warn({}, 'SendGrid API key not configured, skipping email alert');
      return;
    }

    try {
      const subject = `[${alert.severity.toUpperCase()}] Ferni Voice Agent: ${alert.type.replace(/_/g, ' ')}`;
      const html = this.formatAlertEmailHtml(alert);
      const text = this.formatAlertEmailText(alert);

      // Use circuit breaker to prevent hammering SendGrid on failures
      const circuitBreaker = getCircuitBreaker('sendgrid-alerts', {
        failureThreshold: 3,
        resetTimeout: 120_000,
        successThreshold: 2,
      });

      const response = await circuitBreaker.execute(async () =>
        fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [
              {
                to: this.config.emailRecipients.map((email) => ({ email })),
                subject,
              },
            ],
            from: {
              email: fromEmail,
              name: 'Ferni Alerts',
            },
            content: [
              { type: 'text/plain', value: text },
              { type: 'text/html', value: html },
            ],
            categories: ['performance-alert', alert.severity, alert.type],
          }),
        })
      );

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`SendGrid error: ${response.status} - ${errorBody}`);
      }

      log.info(
        { type: alert.type, recipients: this.config.emailRecipients.length },
        '✅ Email alert sent'
      );
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to send email alert');
    }
  }

  /**
   * Format alert email as HTML
   */
  private formatAlertEmailHtml(alert: Alert): string {
    const severityColor = alert.severity === 'critical' ? '#ef4444' : '#f59e0b';
    const severityEmoji = alert.severity === 'critical' ? '🔴' : '⚠️';

    const detailsRows = Object.entries(alert.details)
      .map(
        ([key, value]) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; font-weight: 500; color: #666;">
            ${key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
          </td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; color: #333;">
            ${typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </td>
        </tr>
      `
      )
      .join('');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: ${severityColor}; padding: 24px; text-align: center;">
      <div style="font-size: 32px; margin-bottom: 8px;">${severityEmoji}</div>
      <div style="color: white; font-size: 18px; font-weight: 600;">
        ${alert.severity.toUpperCase()} Alert
      </div>
    </div>

    <!-- Content -->
    <div style="padding: 24px;">
      <h2 style="margin: 0 0 16px 0; color: #333; font-size: 20px;">
        ${alert.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
      </h2>

      <p style="margin: 0 0 24px 0; color: #555; font-size: 16px; line-height: 1.5;">
        ${alert.message}
      </p>

      <!-- Details Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr>
            <th style="padding: 8px 12px; background: #f8f8f8; text-align: left; font-weight: 600; color: #333; border-bottom: 2px solid #e5e5e5;">
              Metric
            </th>
            <th style="padding: 8px 12px; background: #f8f8f8; text-align: left; font-weight: 600; color: #333; border-bottom: 2px solid #e5e5e5;">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          ${detailsRows}
        </tbody>
      </table>

      <!-- Timestamp -->
      <p style="margin: 0; color: #888; font-size: 13px;">
        Detected at: ${alert.timestamp.toISOString()}
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f8f8f8; padding: 16px 24px; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0; color: #888; font-size: 12px;">
        Ferni Voice Agent Performance Monitoring<br>
        <a href="https://console.cloud.google.com/monitoring" style="color: #4a6741; text-decoration: none;">View GCP Monitoring Dashboard</a>
      </p>
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  /**
   * Format alert email as plain text
   */
  private formatAlertEmailText(alert: Alert): string {
    const severityEmoji = alert.severity === 'critical' ? '🔴 CRITICAL' : '⚠️ WARNING';

    const detailsText = Object.entries(alert.details)
      .map(([key, value]) => {
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
        const val = typeof value === 'object' ? JSON.stringify(value) : String(value);
        return `  - ${label}: ${val}`;
      })
      .join('\n');

    return `
${severityEmoji} - Ferni Voice Agent Alert

Type: ${alert.type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}

${alert.message}

Details:
${detailsText}

Detected at: ${alert.timestamp.toISOString()}

---
Ferni Voice Agent Performance Monitoring
https://console.cloud.google.com/monitoring
    `.trim();
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
      running: hasInterval(PERFORMANCE_ALERT_INTERVAL),
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
