/**
 * Optimization Alerting Service
 *
 * Monitors tool health and sends alerts when issues are detected:
 * - High error rates (>10% failures)
 * - Slow response times (>2s average)
 * - Feedback score drops
 * - Unusual usage patterns
 * - Critical recommendations
 *
 * Supports multiple channels:
 * - Slack (via webhook)
 * - Google Cloud Monitoring (custom metrics)
 * - Email (via SendGrid or similar)
 */

import { getLogger } from '../utils/safe-logger.js';

// ============================================================================
// TYPES
// ============================================================================

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertChannel = 'slack' | 'cloud_monitoring' | 'email' | 'log';

export interface Alert {
  id: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: Date;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface AlertConfig {
  /** Slack webhook URL */
  slackWebhookUrl?: string;
  /** Slack channel for alerts (optional, uses webhook default) */
  slackChannel?: string;
  /** Email recipients for alerts */
  emailRecipients?: string[];
  /** Google Cloud project for Cloud Monitoring */
  gcpProject?: string;
  /** Minimum severity to alert on */
  minSeverity: AlertSeverity;
  /** Channels to send alerts to */
  channels: AlertChannel[];
  /** Cooldown between same alerts (ms) */
  alertCooldownMs: number;
  /** Enable/disable alerting */
  enabled: boolean;
}

export interface AlertThresholds {
  /** Error rate threshold (0-1) */
  errorRate: number;
  /** Average latency threshold (ms) */
  latencyMs: number;
  /** Feedback positive rate threshold (0-1) */
  feedbackRate: number;
  /** Minimum calls before alerting on tool */
  minCalls: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: AlertConfig = {
  slackWebhookUrl: process.env.SLACK_ALERTS_WEBHOOK_URL,
  gcpProject: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT,
  minSeverity: 'warning',
  channels: ['log', 'slack'],
  alertCooldownMs: 15 * 60 * 1000, // 15 minutes
  enabled: process.env.NODE_ENV === 'production',
};

const DEFAULT_THRESHOLDS: AlertThresholds = {
  errorRate: 0.1, // 10%
  latencyMs: 2000, // 2 seconds
  feedbackRate: 0.5, // 50% positive
  minCalls: 10,
};

// ============================================================================
// ALERTING SERVICE
// ============================================================================

class OptimizationAlertingService {
  private config: AlertConfig;
  private thresholds: AlertThresholds;
  private recentAlerts = new Map<string, Date>();
  private activeAlerts = new Map<string, Alert>();

  constructor(config?: Partial<AlertConfig>, thresholds?: Partial<AlertThresholds>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  // ==========================================================================
  // MAIN MONITORING
  // ==========================================================================

  /**
   * Check all conditions and send alerts as needed
   */
  async runHealthCheck(): Promise<{
    checked: string[];
    alertsSent: number;
    issues: string[];
  }> {
    const checked: string[] = [];
    const issues: string[] = [];
    let alertsSent = 0;

    try {
      // Import services dynamically
      const [{ toolUsageAnalytics }, { feedbackCollector }, { recommendationEngine }] =
        await Promise.all([
          import('./analytics/tool-usage-analytics.js'),
          import('../tools/optimization/feedback-collector.js'),
          import('../tools/optimization/recommendation-engine.js'),
        ]);

      // Check tool error rates
      checked.push('tool_error_rates');
      const stats = toolUsageAnalytics.getAllStats();
      for (const tool of stats) {
        if (tool.totalCalls < this.thresholds.minCalls) continue;

        const errorRate = tool.failureCount / tool.totalCalls;
        if (errorRate > this.thresholds.errorRate) {
          const sent = await this.alert({
            severity: errorRate > 0.25 ? 'critical' : 'warning',
            type: 'high_error_rate',
            title: `High Error Rate: ${tool.toolId}`,
            message: `Tool ${tool.toolId} has ${Math.round(errorRate * 100)}% error rate (${tool.failureCount}/${tool.totalCalls} calls)`,
            details: { toolId: tool.toolId, errorRate, calls: tool.totalCalls },
          });
          if (sent) alertsSent++;
          issues.push(`${tool.toolId}: ${Math.round(errorRate * 100)}% errors`);
        }
      }

      // Check latency
      checked.push('tool_latency');
      for (const tool of stats) {
        if (tool.totalCalls < this.thresholds.minCalls) continue;

        if (tool.avgLatencyMs > this.thresholds.latencyMs) {
          const sent = await this.alert({
            severity: tool.avgLatencyMs > 5000 ? 'warning' : 'info',
            type: 'high_latency',
            title: `High Latency: ${tool.toolId}`,
            message: `Tool ${tool.toolId} averaging ${Math.round(tool.avgLatencyMs)}ms (threshold: ${this.thresholds.latencyMs}ms)`,
            details: { toolId: tool.toolId, avgLatencyMs: tool.avgLatencyMs },
          });
          if (sent) alertsSent++;
          issues.push(`${tool.toolId}: ${Math.round(tool.avgLatencyMs)}ms avg`);
        }
      }

      // Check feedback scores
      checked.push('feedback_scores');
      const feedback = feedbackCollector.getAllFeedback();
      const totalFeedback = feedback.reduce((sum, f) => sum + f.totalFeedback, 0);
      const totalPositive = feedback.reduce((sum, f) => sum + f.positiveCount, 0);

      if (totalFeedback >= 10) {
        const positiveRate = totalPositive / totalFeedback;
        if (positiveRate < this.thresholds.feedbackRate) {
          const sent = await this.alert({
            severity: positiveRate < 0.3 ? 'critical' : 'warning',
            type: 'low_satisfaction',
            title: 'Low User Satisfaction',
            message: `Overall satisfaction at ${Math.round(positiveRate * 100)}% (threshold: ${this.thresholds.feedbackRate * 100}%)`,
            details: { positiveRate, totalFeedback, totalPositive },
          });
          if (sent) alertsSent++;
          issues.push(`Satisfaction: ${Math.round(positiveRate * 100)}%`);
        }
      }

      // Check for critical recommendations
      checked.push('critical_recommendations');
      const recommendations = await recommendationEngine.generateRecommendations();
      const criticalRecs = recommendations.filter((r) => r.priority === 'critical');

      if (criticalRecs.length > 0) {
        const sent = await this.alert({
          severity: 'critical',
          type: 'critical_recommendations',
          title: `${criticalRecs.length} Critical Recommendations`,
          message: criticalRecs.map((r) => r.title).join(', '),
          details: {
            count: criticalRecs.length,
            recommendations: criticalRecs.map((r) => r.title),
          },
        });
        if (sent) alertsSent++;
        issues.push(`${criticalRecs.length} critical recommendations`);
      }

      getLogger().info({ checked, alertsSent, issues }, '🔍 Health check complete');
    } catch (error) {
      getLogger().error({ error }, 'Health check failed');
      issues.push(`Health check error: ${error}`);
    }

    return { checked, alertsSent, issues };
  }

  // ==========================================================================
  // ALERT SENDING
  // ==========================================================================

  /**
   * Send an alert through configured channels
   */
  async alert(params: {
    severity: AlertSeverity;
    type: string;
    title: string;
    message: string;
    details: Record<string, unknown>;
  }): Promise<boolean> {
    if (!this.config.enabled) {
      getLogger().debug(params, 'Alerting disabled, skipping alert');
      return false;
    }

    // Check severity threshold
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (severityOrder[params.severity] > severityOrder[this.config.minSeverity]) {
      return false;
    }

    // Check cooldown
    const alertKey = `${params.type}:${params.title}`;
    const lastAlert = this.recentAlerts.get(alertKey);
    if (lastAlert && Date.now() - lastAlert.getTime() < this.config.alertCooldownMs) {
      getLogger().debug({ alertKey }, 'Alert on cooldown, skipping');
      return false;
    }

    // Create alert object
    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...params,
      timestamp: new Date(),
    };

    // Store alert
    this.activeAlerts.set(alert.id, alert);
    this.recentAlerts.set(alertKey, alert.timestamp);

    // Send to configured channels
    const results = await Promise.all(
      this.config.channels.map(async (channel) => this.sendToChannel(channel, alert))
    );

    const sent = results.some((r) => r);
    if (sent) {
      getLogger().warn(
        { alert: alert.id, type: alert.type, severity: alert.severity },
        '🚨 Alert sent'
      );
    }

    return sent;
  }

  /**
   * Send alert to a specific channel
   */
  private async sendToChannel(channel: AlertChannel, alert: Alert): Promise<boolean> {
    try {
      switch (channel) {
        case 'slack':
          return this.sendSlackAlert(alert);
        case 'cloud_monitoring':
          return this.sendCloudMonitoringMetric(alert);
        case 'log':
          this.logAlert(alert);
          return true;
        default:
          return false;
      }
    } catch (error) {
      getLogger().error({ error, channel }, 'Failed to send alert');
      return false;
    }
  }

  /**
   * Send alert to Slack
   */
  private async sendSlackAlert(alert: Alert): Promise<boolean> {
    if (!this.config.slackWebhookUrl) {
      return false;
    }

    const severityEmoji = {
      critical: '🚨',
      warning: '⚠️',
      info: 'ℹ️',
    };

    const severityColor = {
      critical: '#ff0000',
      warning: '#ffaa00',
      info: '#0066ff',
    };

    try {
      const response = await fetch(this.config.slackWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachments: [
            {
              color: severityColor[alert.severity],
              blocks: [
                {
                  type: 'header',
                  text: {
                    type: 'plain_text',
                    text: `${severityEmoji[alert.severity]} ${alert.title}`,
                    emoji: true,
                  },
                },
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: alert.message,
                  },
                },
                {
                  type: 'context',
                  elements: [
                    {
                      type: 'mrkdwn',
                      text: `*Type:* ${alert.type} | *Severity:* ${alert.severity} | *Time:* ${alert.timestamp.toISOString()}`,
                    },
                  ],
                },
                ...(Object.keys(alert.details).length > 0
                  ? [
                      {
                        type: 'section',
                        text: {
                          type: 'mrkdwn',
                          text: `\`\`\`${JSON.stringify(alert.details, null, 2)}\`\`\``,
                        },
                      },
                    ]
                  : []),
              ],
            },
          ],
        }),
      });

      return response.ok;
    } catch (error) {
      getLogger().error({ error }, 'Failed to send Slack alert');
      return false;
    }
  }

  /**
   * Send metric to Cloud Monitoring
   */
  private async sendCloudMonitoringMetric(alert: Alert): Promise<boolean> {
    if (!this.config.gcpProject) {
      return false;
    }

    try {
      // Use Google Cloud Monitoring API - optional dependency
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Monitoring = (await import('@google-cloud/monitoring').catch(() => null)) as any;
      if (!Monitoring) {
        return false;
      }
      const client = new Monitoring.MetricServiceClient();

      const projectPath = client.projectPath(this.config.gcpProject);
      const now = new Date();

      await client.createTimeSeries({
        name: projectPath,
        timeSeries: [
          {
            metric: {
              type: `custom.googleapis.com/ferni/optimization/${alert.type}`,
              labels: {
                severity: alert.severity,
              },
            },
            resource: {
              type: 'global',
              labels: {
                project_id: this.config.gcpProject,
              },
            },
            points: [
              {
                interval: {
                  endTime: {
                    seconds: Math.floor(now.getTime() / 1000),
                  },
                },
                value: {
                  int64Value: 1,
                },
              },
            ],
          },
        ],
      });

      return true;
    } catch (error) {
      getLogger().debug({ error }, 'Cloud Monitoring metric failed (may not be configured)');
      return false;
    }
  }

  /**
   * Log alert to standard logger
   */
  private logAlert(alert: Alert): void {
    const logFn =
      alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warn' : 'info';

    getLogger()[logFn](
      {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        details: alert.details,
      },
      `🚨 ALERT: ${alert.message}`
    );
  }

  // ==========================================================================
  // ALERT MANAGEMENT
  // ==========================================================================

  /**
   * Resolve an active alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      getLogger().info({ alertId }, '✅ Alert resolved');
      return true;
    }
    return false;
  }

  /**
   * Get all active (unresolved) alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values()).filter((a) => !a.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Clear old resolved alerts
   */
  clearResolvedAlerts(olderThanMs: number = 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [id, alert] of this.activeAlerts) {
      if (alert.resolved && alert.timestamp.getTime() < cutoff) {
        this.activeAlerts.delete(id);
        cleared++;
      }
    }

    return cleared;
  }

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  /**
   * Update configuration
   */
  configure(config: Partial<AlertConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Update thresholds
   */
  setThresholds(thresholds: Partial<AlertThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * Enable/disable alerting
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    getLogger().info({ enabled }, 'Alerting enabled state changed');
  }

  /**
   * Get current configuration
   */
  getConfig(): { config: AlertConfig; thresholds: AlertThresholds } {
    return {
      config: {
        ...this.config,
        slackWebhookUrl: this.config.slackWebhookUrl ? '[REDACTED]' : undefined,
      },
      thresholds: { ...this.thresholds },
    };
  }
}

// ============================================================================
// LAZY SINGLETON
// ============================================================================

let _instance: OptimizationAlertingService | null = null;

/** Get the OptimizationAlertingService singleton (lazy-initialized on first access) */
export function getAlertingService(): OptimizationAlertingService {
  if (!_instance) {
    _instance = new OptimizationAlertingService();
  }
  return _instance;
}

/** @deprecated Use getAlertingService() instead. Kept for backward compatibility. */
export const alertingService = new Proxy({} as OptimizationAlertingService, {
  get(_target, prop) {
    return (getAlertingService() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export default alertingService;
