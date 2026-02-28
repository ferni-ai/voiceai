/**
 * Slack Notification Service
 *
 * Sends notifications to Slack for:
 * - Feature rollouts (start, advance, rollback, complete)
 * - Deployment events
 * - Incident alerts
 * - System health changes
 *
 * Workspace: https://ferniai.slack.com/
 *
 * Setup:
 *   1. Go to https://api.slack.com/apps
 *   2. Create app → From scratch → "Ferni Notifications"
 *   3. Incoming Webhooks → Activate → Add New Webhook
 *   4. Select channel (#deployments, #alerts, etc.)
 *   5. Copy webhook URL to SLACK_WEBHOOK_URL env var
 */

import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'SlackNotifications' });

// ============================================================================
// TYPES
// ============================================================================

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
    emoji?: boolean;
  };
  elements?: Array<{
    type: string;
    text?: { type: string; text: string };
    url?: string;
    style?: string;
  }>;
  fields?: Array<{
    type: string;
    text: string;
  }>;
  accessory?: unknown;
}

interface SlackAttachment {
  color?: string;
  title?: string;
  text?: string;
  fields?: Array<{
    title: string;
    value: string;
    short?: boolean;
  }>;
  footer?: string;
  ts?: number;
}

export type NotificationType =
  | 'rollout_started'
  | 'rollout_advanced'
  | 'rollout_complete'
  | 'rollout_failed'
  | 'rollout_rolled_back'
  | 'deployment_started'
  | 'deployment_success'
  | 'deployment_failed'
  | 'incident_opened'
  | 'incident_resolved'
  | 'health_degraded'
  | 'health_recovered'
  | 'crisis_alert';

export interface NotificationContext {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  severity?: 'info' | 'warning' | 'error' | 'success';
  actionUrl?: string;
  actionText?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';
const SLACK_DEPLOYMENTS_WEBHOOK = process.env.SLACK_DEPLOYMENTS_WEBHOOK || SLACK_WEBHOOK_URL;
const SLACK_ALERTS_WEBHOOK = process.env.SLACK_ALERTS_WEBHOOK || SLACK_WEBHOOK_URL;
const SLACK_ROLLOUTS_WEBHOOK = process.env.SLACK_ROLLOUTS_WEBHOOK || SLACK_WEBHOOK_URL;
const SLACK_SAFETY_WEBHOOK = process.env.SLACK_SAFETY_WEBHOOK || SLACK_ALERTS_WEBHOOK;

const WEBHOOK_TIMEOUT_MS = 10000;

// Color mapping for severity
const SEVERITY_COLORS: Record<string, string> = {
  info: '#2196F3', // Blue
  success: '#4CAF50', // Green
  warning: '#FF9800', // Orange
  error: '#F44336', // Red
};

// Emoji mapping for notification types
const TYPE_EMOJIS: Record<NotificationType, string> = {
  rollout_started: '🚀',
  rollout_advanced: '⏩',
  rollout_complete: '✅',
  rollout_failed: '❌',
  rollout_rolled_back: '⚠️',
  deployment_started: '🔄',
  deployment_success: '✅',
  deployment_failed: '❌',
  incident_opened: '🚨',
  incident_resolved: '✅',
  health_degraded: '⚠️',
  health_recovered: '💚',
  crisis_alert: '🛡️',
};

// ============================================================================
// SLACK NOTIFICATION SERVICE
// ============================================================================

export class SlackNotificationService {
  private defaultWebhook: string;
  private webhooks: Record<string, string>;

  constructor() {
    this.defaultWebhook = SLACK_WEBHOOK_URL;
    this.webhooks = {
      deployments: SLACK_DEPLOYMENTS_WEBHOOK,
      alerts: SLACK_ALERTS_WEBHOOK,
      rollouts: SLACK_ROLLOUTS_WEBHOOK,
      safety: SLACK_SAFETY_WEBHOOK,
    };

    if (!this.defaultWebhook) {
      log.warn('SLACK_WEBHOOK_URL not configured - notifications will be logged only');
    } else {
      log.info('Slack notification service initialized');
    }
  }

  /**
   * Send a notification
   */
  async notify(context: NotificationContext): Promise<boolean> {
    const emoji = TYPE_EMOJIS[context.type] || '📢';
    const color = SEVERITY_COLORS[context.severity || 'info'];

    const message = this.buildMessage(context, emoji, color);
    const webhook = this.getWebhookForType(context.type);

    // Always log the notification
    log.info({ type: context.type, title: context.title }, `${emoji} ${context.title}`);

    if (!webhook) {
      log.debug('No webhook configured, notification logged only');
      return false;
    }

    return this.sendToSlack(webhook, message);
  }

  /**
   * Send a notification (alias for notify with simplified interface)
   */
  async sendNotification(params: {
    type: 'deployment' | 'incident' | 'system' | 'alert';
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical' | 'error';
    details?: Record<string, unknown>;
  }): Promise<boolean> {
    // Map simplified types to NotificationType
    const typeMap: Record<string, NotificationType> = {
      deployment: 'deployment_success',
      incident: 'incident_opened',
      system: 'health_degraded',
      alert: 'crisis_alert',
    };

    // Map severity
    const severityMap: Record<string, 'info' | 'warning' | 'error' | 'success'> = {
      info: 'info',
      warning: 'warning',
      critical: 'error',
      error: 'error',
    };

    return this.notify({
      type: typeMap[params.type] || 'health_degraded',
      title: params.title,
      message: params.message,
      severity: severityMap[params.severity || 'info'],
      metadata: params.details,
    });
  }

  /**
   * Send a rollout notification
   */
  async notifyRollout(
    featureId: string,
    status: 'started' | 'advanced' | 'complete' | 'failed' | 'rolled_back',
    details: {
      percentage?: number;
      stage?: string;
      reason?: string;
      initiatedBy?: string;
      metrics?: Record<string, number>;
    }
  ): Promise<boolean> {
    const typeMap: Record<string, NotificationType> = {
      started: 'rollout_started',
      advanced: 'rollout_advanced',
      complete: 'rollout_complete',
      failed: 'rollout_failed',
      rolled_back: 'rollout_rolled_back',
    };

    const severityMap: Record<string, 'info' | 'success' | 'warning' | 'error'> = {
      started: 'info',
      advanced: 'info',
      complete: 'success',
      failed: 'error',
      rolled_back: 'warning',
    };

    const titleMap: Record<string, string> = {
      started: `Rollout Started: ${featureId}`,
      advanced: `Rollout Advanced: ${featureId} → ${details.percentage}%`,
      complete: `Rollout Complete: ${featureId}`,
      failed: `Rollout Failed: ${featureId}`,
      rolled_back: `Rollout Rolled Back: ${featureId}`,
    };

    return this.notify({
      type: typeMap[status],
      title: titleMap[status],
      message: details.reason || `Feature ${featureId} rollout ${status}`,
      severity: severityMap[status],
      metadata: {
        featureId,
        ...details,
      },
      actionUrl: process.env.DASHBOARD_URL
        ? `${process.env.DASHBOARD_URL}/rollouts/${featureId}`
        : undefined,
      actionText: 'View Rollout',
    });
  }

  /**
   * Send a deployment notification
   */
  async notifyDeployment(
    service: string,
    status: 'started' | 'success' | 'failed',
    details: {
      version?: string;
      commitSha?: string;
      environment?: string;
      duration?: number;
      url?: string;
      error?: string;
      triggeredBy?: string;
    }
  ): Promise<boolean> {
    const typeMap: Record<string, NotificationType> = {
      started: 'deployment_started',
      success: 'deployment_success',
      failed: 'deployment_failed',
    };

    const severityMap: Record<string, 'info' | 'success' | 'error'> = {
      started: 'info',
      success: 'success',
      failed: 'error',
    };

    return this.notify({
      type: typeMap[status],
      title: `Deployment ${status}: ${service}`,
      message:
        status === 'failed'
          ? details.error || 'Deployment failed'
          : `${service} deployed to ${details.environment || 'production'}`,
      severity: severityMap[status],
      metadata: {
        service,
        ...details,
      },
      actionUrl: details.url,
      actionText: status === 'success' ? 'View Service' : 'View Logs',
    });
  }

  /**
   * Send an incident notification
   */
  async notifyIncident(
    title: string,
    status: 'opened' | 'resolved',
    details: {
      severity?: 'critical' | 'major' | 'minor';
      affectedServices?: string[];
      description?: string;
      incidentUrl?: string;
    }
  ): Promise<boolean> {
    return this.notify({
      type: status === 'opened' ? 'incident_opened' : 'incident_resolved',
      title: `${status === 'opened' ? '🚨 Incident' : '✅ Resolved'}: ${title}`,
      message: details.description || title,
      severity: status === 'opened' ? 'error' : 'success',
      metadata: details,
      actionUrl: details.incidentUrl,
      actionText: 'View Incident',
    });
  }

  /**
   * Send a crisis alert notification for user safety events.
   *
   * This is used when critical/emergency crisis events are detected.
   * Alerts go to a dedicated safety channel for immediate attention.
   */
  async notifyCrisisAlert(details: {
    userId: string;
    crisisType: string;
    severity: 'critical' | 'emergency';
    timestamp: string;
    resourcesProvided: boolean;
    userAcceptedHelp?: boolean;
    metadata?: {
      sessionId?: string;
      personaId?: string;
      conversationTurnCount?: number;
    };
  }): Promise<boolean> {
    const title =
      details.severity === 'emergency'
        ? `EMERGENCY: ${details.crisisType} detected`
        : `Critical Crisis: ${details.crisisType} detected`;

    const message = [
      `User ${details.userId.slice(0, 8)}... triggered a ${details.severity} crisis event.`,
      `Resources provided: ${details.resourcesProvided ? 'Yes' : 'No'}`,
      details.userAcceptedHelp !== undefined
        ? `User accepted help: ${details.userAcceptedHelp ? 'Yes' : 'No'}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    return this.notify({
      type: 'crisis_alert',
      title,
      message,
      severity: 'error',
      metadata: {
        userId: `${details.userId.slice(0, 8)}...`, // Privacy: truncated
        crisisType: details.crisisType,
        severity: details.severity,
        resourcesProvided: details.resourcesProvided,
        personaId: details.metadata?.personaId,
        sessionId: details.metadata?.sessionId?.slice(0, 8),
        timestamp: details.timestamp,
      },
      actionUrl: process.env.DASHBOARD_URL
        ? `${process.env.DASHBOARD_URL}/safety/events`
        : undefined,
      actionText: 'View Safety Dashboard',
    });
  }

  // ============================================================================
  // INTERNAL METHODS
  // ============================================================================

  private buildMessage(context: NotificationContext, emoji: string, color: string): SlackMessage {
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${emoji} ${context.title}*\n\n${context.message}`,
        },
      },
    ];

    // Add metadata fields if present
    if (context.metadata && Object.keys(context.metadata).length > 0) {
      const fields = Object.entries(context.metadata)
        .filter(([_, v]) => v !== undefined && v !== null)
        .slice(0, 10) // Max 10 fields
        .map(([key, value]) => ({
          type: 'mrkdwn',
          text: `*${this.formatKey(key)}:* ${this.formatValue(value)}`,
        }));

      if (fields.length > 0) {
        blocks.push({
          type: 'section',
          fields,
        });
      }
    }

    // Add action button if present
    if (context.actionUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: context.actionText || 'View Details',
            },
            url: context.actionUrl,
            style: context.severity === 'error' ? 'danger' : 'primary',
          },
        ],
      });
    }

    // Add timestamp context block
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'plain_text',
          text: new Date().toISOString(),
        },
      ],
    } as unknown as SlackBlock);

    return {
      text: `${emoji} ${context.title}`,
      blocks,
      attachments: [
        {
          color,
          footer: 'Ferni AI',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  private getWebhookForType(type: NotificationType): string {
    if (type.startsWith('rollout_')) return this.webhooks.rollouts;
    if (type.startsWith('deployment_')) return this.webhooks.deployments;
    if (type.startsWith('incident_') || type.startsWith('health_')) return this.webhooks.alerts;
    if (type === 'crisis_alert') return this.webhooks.safety;
    return this.defaultWebhook;
  }

  private async sendToSlack(webhookUrl: string, message: SlackMessage): Promise<boolean> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (!response.ok) {
        log.error({ status: response.status }, 'Slack webhook failed');
        return false;
      }

      return true;
    } catch (error) {
      log.error({ error }, 'Failed to send Slack notification');
      return false;
    }
  }

  private formatKey(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private formatValue(value: unknown): string {
    if (typeof value === 'number') {
      if (value >= 1000) return value.toLocaleString();
      if (value < 1) return `${(value * 100).toFixed(1)}%`;
      return value.toString();
    }
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let slackService: SlackNotificationService | null = null;

export function getSlackNotifications(): SlackNotificationService {
  if (!slackService) {
    slackService = new SlackNotificationService();
  }
  return slackService;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export async function notifySlack(context: NotificationContext): Promise<boolean> {
  return getSlackNotifications().notify(context);
}

export async function notifyRollout(
  featureId: string,
  status: 'started' | 'advanced' | 'complete' | 'failed' | 'rolled_back',
  details: Parameters<SlackNotificationService['notifyRollout']>[2]
): Promise<boolean> {
  return getSlackNotifications().notifyRollout(featureId, status, details);
}

export async function notifyDeployment(
  service: string,
  status: 'started' | 'success' | 'failed',
  details: Parameters<SlackNotificationService['notifyDeployment']>[2]
): Promise<boolean> {
  return getSlackNotifications().notifyDeployment(service, status, details);
}

export async function notifyIncident(
  title: string,
  status: 'opened' | 'resolved',
  details: Parameters<SlackNotificationService['notifyIncident']>[2]
): Promise<boolean> {
  return getSlackNotifications().notifyIncident(title, status, details);
}

export async function notifyCrisisAlert(
  details: Parameters<SlackNotificationService['notifyCrisisAlert']>[0]
): Promise<boolean> {
  return getSlackNotifications().notifyCrisisAlert(details);
}

// ============================================================================
// SECURITY ALERTING
// ============================================================================

export interface DDoSAlertDetails {
  /** Detection confidence level */
  confidence: 'low' | 'medium' | 'high';
  /** Human-readable details */
  details: string;
  /** Rate limit stats */
  stats: {
    total: number;
    topIps: Array<[string, number]>;
    topEndpoints: Array<[string, number]>;
  };
  /** Server that detected the attack */
  server: string;
}

/**
 * Send a DDoS attack alert to Slack
 *
 * @param details - DDoS detection details
 * @returns Whether the alert was sent successfully
 */
export async function notifyDDoSAlert(details: DDoSAlertDetails): Promise<boolean> {
  const severityMap: Record<string, 'info' | 'warning' | 'error'> = {
    low: 'warning',
    medium: 'error',
    high: 'error',
  };

  const topIpsText = details.stats.topIps
    .map(([ip, count]) => `• \`${ip}\`: ${count} hits`)
    .join('\n');

  const topEndpointsText = details.stats.topEndpoints
    .map(([endpoint, count]) => `• \`${endpoint}\`: ${count} hits`)
    .join('\n');

  return getSlackNotifications().notify({
    type: 'crisis_alert',
    title: `🛡️ DDoS Attack Detected (${details.confidence} confidence)`,
    message: details.details,
    severity: severityMap[details.confidence],
    metadata: {
      server: details.server,
      totalRateLimits: details.stats.total,
      topIps: topIpsText,
      topEndpoints: topEndpointsText,
    },
    actionUrl: process.env.DASHBOARD_URL ? `${process.env.DASHBOARD_URL}/security` : undefined,
    actionText: 'View Security Dashboard',
  });
}
