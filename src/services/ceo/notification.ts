/**
 * CEO CLI Notification Service
 *
 * Handles Slack and email notifications for autonomous actions in the Ferni CLI.
 * Used for:
 * - Experiment promotions
 * - Incident alerts
 * - Daily/weekly digests
 * - System notifications
 *
 * Features:
 * - Graceful degradation when credentials are missing
 * - Rate limiting to prevent spam
 * - Nice formatted Slack messages with blocks
 * - Configurable via environment variables
 *
 * Environment Variables:
 * - SLACK_CEO_WEBHOOK_URL: Slack webhook for CEO notifications
 * - SENDGRID_API_KEY: SendGrid API key for email
 * - CEO_NOTIFICATION_EMAIL: Default email recipient
 *
 * @module services/ceo/notification
 */

import { createLogger } from '../../utils/safe-logger.js';
import { RateLimiter } from '../../utils/rate-limiter.js';

const log = createLogger({ module: 'CEONotification' });

// ============================================================================
// TYPES
// ============================================================================

export interface SlackBlock {
  type: 'section' | 'header' | 'divider' | 'context' | 'actions';
  text?: {
    type: 'mrkdwn' | 'plain_text';
    text: string;
    emoji?: boolean;
  };
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text';
    text: string;
  }>;
  elements?: Array<{
    type: string;
    text?: { type: string; text: string; emoji?: boolean };
    url?: string;
    style?: 'primary' | 'danger';
    action_id?: string;
  }>;
  accessory?: unknown;
}

export interface SlackAttachment {
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

export interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

export interface Incident {
  id: string;
  title: string;
  severity: 'critical' | 'major' | 'minor';
  status: 'open' | 'investigating' | 'resolved';
  affectedServices: string[];
  description?: string;
  startedAt: Date;
  resolvedAt?: Date;
  rootCause?: string;
  actionsTaken?: string[];
}

export interface ExperimentResult {
  experimentId: string;
  name: string;
  winner: string;
  confidence: number;
  improvement: number;
  metrics: Record<string, number>;
}

export interface DigestContent {
  period: 'daily' | 'weekly';
  metrics: {
    activeUsers: number;
    callVolume: number;
    revenue: number;
    userGrowth: number;
  };
  highlights: string[];
  alerts: string[];
  experiments: Array<{
    name: string;
    status: string;
    confidence?: number;
  }>;
  goals: Array<{
    name: string;
    progress: number;
  }>;
}

export interface NotificationService {
  sendSlack: (channel: string, message: SlackMessage) => Promise<void>;
  sendEmail: (to: string, subject: string, body: string) => Promise<void>;
  sendDigest: (userId: string, type: 'daily' | 'weekly') => Promise<void>;
  notifyExperimentPromotion: (experimentId: string, winner: string) => Promise<void>;
  notifyIncident: (incident: Incident) => Promise<void>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_WEBHOOK_URL = process.env.SLACK_CEO_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || '';
const DEFAULT_EMAIL = process.env.CEO_NOTIFICATION_EMAIL || '';
const SENDGRID_FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || 'notifications@ferni.ai';

const WEBHOOK_TIMEOUT_MS = 10_000;

// Rate limiters to prevent spam
const slackLimiter = new RateLimiter({
  maxTokens: 30, // 30 messages burst
  refillRate: 1, // 1 message per second
  refillInterval: 1000,
});

const emailLimiter = new RateLimiter({
  maxTokens: 10, // 10 emails burst
  refillRate: 1, // 1 email per 10 seconds
  refillInterval: 10_000,
});

// Severity colors for Slack
const SEVERITY_COLORS: Record<string, string> = {
  info: '#2196F3', // Blue
  success: '#4CAF50', // Green
  warning: '#FF9800', // Orange
  error: '#F44336', // Red
  critical: '#D32F2F', // Dark red
};

// ============================================================================
// NOTIFICATION SERVICE IMPLEMENTATION
// ============================================================================

class CEONotificationService implements NotificationService {
  private slackConfigured: boolean;
  private emailConfigured: boolean;

  constructor() {
    this.slackConfigured = Boolean(SLACK_WEBHOOK_URL);
    this.emailConfigured = Boolean(SENDGRID_API_KEY);

    if (!this.slackConfigured) {
      log.warn('Slack webhook not configured - Slack notifications will be logged only');
    }

    if (!this.emailConfigured) {
      log.warn('SendGrid not configured - email notifications will be logged only');
    }

    if (this.slackConfigured || this.emailConfigured) {
      log.info(
        {
          slack: this.slackConfigured,
          email: this.emailConfigured,
        },
        'CEO Notification service initialized'
      );
    }
  }

  // --------------------------------------------------------------------------
  // SLACK NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Send a Slack message to a channel via webhook.
   *
   * Rate limited to prevent spam. Gracefully degrades if webhook not configured.
   */
  async sendSlack(channel: string, message: SlackMessage): Promise<void> {
    // Always log the notification
    log.info(
      {
        channel,
        text: message.text.slice(0, 100),
      },
      'Slack notification'
    );

    if (!this.slackConfigured) {
      log.debug('Slack not configured, notification logged only');
      return;
    }

    // Check rate limit
    if (!slackLimiter.tryConsume()) {
      log.warn({ channel }, 'Slack rate limit exceeded, notification dropped');
      return;
    }

    try {
      const response = await fetch(SLACK_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...message,
          channel: channel || undefined,
        }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        log.error({ status: response.status, error: errorText }, 'Slack webhook failed');
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to send Slack notification');
    }
  }

  // --------------------------------------------------------------------------
  // EMAIL NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Send an email via SendGrid.
   *
   * Rate limited to prevent spam. Gracefully degrades if not configured.
   */
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    const recipient = to || DEFAULT_EMAIL;

    // Always log the notification
    log.info(
      {
        to: recipient ? `${recipient.slice(0, 3)}***` : 'none',
        subject: subject.slice(0, 50),
      },
      'Email notification'
    );

    if (!this.emailConfigured) {
      log.debug('Email not configured, notification logged only');
      return;
    }

    if (!recipient) {
      log.warn('No email recipient configured');
      return;
    }

    // Check rate limit
    if (!emailLimiter.tryConsume()) {
      log.warn({ to: recipient }, 'Email rate limit exceeded, notification dropped');
      return;
    }

    try {
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SENDGRID_API_KEY}`,
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: recipient }],
              subject,
            },
          ],
          from: { email: SENDGRID_FROM_EMAIL, name: 'Ferni AI' },
          content: [
            {
              type: 'text/html',
              value: this.wrapEmailBody(subject, body),
            },
          ],
        }),
        signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        log.error({ status: response.status, error: errorText }, 'SendGrid request failed');
      }
    } catch (error) {
      log.error({ error: String(error) }, 'Failed to send email');
    }
  }

  /**
   * Wrap email body in a simple HTML template.
   */
  private wrapEmailBody(subject: string, body: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #2C2520; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { border-bottom: 2px solid #3D5A45; padding-bottom: 10px; margin-bottom: 20px; }
    .header h1 { color: #3D5A45; margin: 0; font-size: 24px; }
    .content { padding: 20px 0; }
    .footer { border-top: 1px solid #e0e0e0; padding-top: 15px; margin-top: 30px; font-size: 12px; color: #666; }
    .metric { display: inline-block; padding: 8px 16px; background: #f5f5f5; border-radius: 4px; margin: 4px; }
    .metric-value { font-weight: bold; font-size: 18px; color: #3D5A45; }
    .highlight { background: #e8f5e9; border-left: 3px solid #4CAF50; padding: 10px 15px; margin: 10px 0; }
    .alert { background: #fff3e0; border-left: 3px solid #FF9800; padding: 10px 15px; margin: 10px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ferni AI</h1>
  </div>
  <div class="content">
    ${body}
  </div>
  <div class="footer">
    <p>This is an automated notification from Ferni AI.</p>
    <p>Manage your notification preferences in the Ferni CLI.</p>
  </div>
</body>
</html>`;
  }

  // --------------------------------------------------------------------------
  // DIGEST NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Send a daily or weekly digest to a user.
   *
   * This is a placeholder that will be connected to the unified data service.
   */
  async sendDigest(userId: string, type: 'daily' | 'weekly'): Promise<void> {
    log.info({ userId, type }, 'Sending digest');

    // TODO: Connect to unified data service to get actual data
    // For now, this creates a placeholder structure
    const digest: DigestContent = {
      period: type,
      metrics: {
        activeUsers: 0,
        callVolume: 0,
        revenue: 0,
        userGrowth: 0,
      },
      highlights: [],
      alerts: [],
      experiments: [],
      goals: [],
    };

    const slackMessage = this.buildDigestSlackMessage(digest);
    await this.sendSlack('#ceo-digest', slackMessage);

    if (DEFAULT_EMAIL) {
      const emailBody = this.buildDigestEmailBody(digest);
      const subject = `${type === 'daily' ? 'Daily' : 'Weekly'} Digest - ${new Date().toLocaleDateString()}`;
      await this.sendEmail(DEFAULT_EMAIL, subject, emailBody);
    }
  }

  /**
   * Build a Slack message for the digest.
   */
  private buildDigestSlackMessage(digest: DigestContent): SlackMessage {
    const emoji = digest.period === 'daily' ? ':sunrise:' : ':calendar:';
    const title = digest.period === 'daily' ? 'Daily Digest' : 'Weekly Digest';

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Active Users*\n${digest.metrics.activeUsers.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Call Volume*\n${digest.metrics.callVolume.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Revenue*\n$${digest.metrics.revenue.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*User Growth*\n${digest.metrics.userGrowth > 0 ? '+' : ''}${digest.metrics.userGrowth}%`,
          },
        ],
      },
    ];

    // Add highlights
    if (digest.highlights.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:star: *Highlights*\n${digest.highlights.map((h) => `• ${h}`).join('\n')}`,
          },
        }
      );
    }

    // Add alerts
    if (digest.alerts.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:warning: *Alerts*\n${digest.alerts.map((a) => `• ${a}`).join('\n')}`,
          },
        }
      );
    }

    // Add experiments
    if (digest.experiments.length > 0) {
      blocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:test_tube: *Experiments*\n${digest.experiments
              .map(
                (e) =>
                  `• ${e.name}: ${e.status}${e.confidence ? ` (${e.confidence}% confidence)` : ''}`
              )
              .join('\n')}`,
          },
        }
      );
    }

    // Add timestamp
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
      text: `${title} - ${new Date().toLocaleDateString()}`,
      blocks,
      attachments: [
        {
          color: SEVERITY_COLORS.info,
          footer: 'Ferni AI CEO Dashboard',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  /**
   * Build an HTML email body for the digest.
   */
  private buildDigestEmailBody(digest: DigestContent): string {
    const title = digest.period === 'daily' ? 'Daily Digest' : 'Weekly Digest';

    let html = `
<h2>${title} - ${new Date().toLocaleDateString()}</h2>

<h3>Key Metrics</h3>
<div>
  <span class="metric"><span class="metric-value">${digest.metrics.activeUsers.toLocaleString()}</span><br>Active Users</span>
  <span class="metric"><span class="metric-value">${digest.metrics.callVolume.toLocaleString()}</span><br>Calls</span>
  <span class="metric"><span class="metric-value">$${digest.metrics.revenue.toLocaleString()}</span><br>Revenue</span>
  <span class="metric"><span class="metric-value">${digest.metrics.userGrowth > 0 ? '+' : ''}${digest.metrics.userGrowth}%</span><br>Growth</span>
</div>`;

    if (digest.highlights.length > 0) {
      html += `
<h3>Highlights</h3>
${digest.highlights.map((h) => `<div class="highlight">${h}</div>`).join('\n')}`;
    }

    if (digest.alerts.length > 0) {
      html += `
<h3>Alerts</h3>
${digest.alerts.map((a) => `<div class="alert">${a}</div>`).join('\n')}`;
    }

    if (digest.experiments.length > 0) {
      html += `
<h3>Experiments</h3>
<ul>
${digest.experiments.map((e) => `<li><strong>${e.name}:</strong> ${e.status}${e.confidence ? ` (${e.confidence}% confidence)` : ''}</li>`).join('\n')}
</ul>`;
    }

    if (digest.goals.length > 0) {
      html += `
<h3>Goals Progress</h3>
<ul>
${digest.goals.map((g) => `<li><strong>${g.name}:</strong> ${g.progress}%</li>`).join('\n')}
</ul>`;
    }

    return html;
  }

  // --------------------------------------------------------------------------
  // EXPERIMENT NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Notify about an experiment promotion (winner found and promoted).
   */
  async notifyExperimentPromotion(experimentId: string, winner: string): Promise<void> {
    log.info({ experimentId, winner }, 'Experiment promotion notification');

    const message: SlackMessage = {
      text: `Experiment Promoted: ${experimentId}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: ':trophy: Experiment Winner Promoted',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `Experiment *${experimentId}* has a winner!`,
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Winner*\n\`${winner}\``,
            },
            {
              type: 'mrkdwn',
              text: `*Status*\nPromoted to 100%`,
            },
          ],
        },
        {
          type: 'context',
          elements: [
            {
              type: 'plain_text',
              text: `Promoted at ${new Date().toISOString()}`,
            },
          ],
        } as unknown as SlackBlock,
      ],
      attachments: [
        {
          color: SEVERITY_COLORS.success,
          footer: 'Ferni AI Experiment System',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.sendSlack('#experiments', message);
  }

  // --------------------------------------------------------------------------
  // INCIDENT NOTIFICATIONS
  // --------------------------------------------------------------------------

  /**
   * Notify about an incident (open or resolved).
   */
  async notifyIncident(incident: Incident): Promise<void> {
    log.info(
      {
        incidentId: incident.id,
        severity: incident.severity,
        status: incident.status,
      },
      'Incident notification'
    );

    const isResolved = incident.status === 'resolved';
    const emoji = isResolved ? ':white_check_mark:' : ':rotating_light:';
    const color = isResolved
      ? SEVERITY_COLORS.success
      : SEVERITY_COLORS[incident.severity] || SEVERITY_COLORS.error;

    const blocks: SlackBlock[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} ${isResolved ? 'Resolved' : 'Incident'}: ${incident.title}`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Severity*\n${incident.severity.toUpperCase()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Status*\n${incident.status}`,
          },
          {
            type: 'mrkdwn',
            text: `*Affected Services*\n${incident.affectedServices.join(', ') || 'None specified'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Started*\n${incident.startedAt.toISOString()}`,
          },
        ],
      },
    ];

    if (incident.description) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Description*\n${incident.description}`,
        },
      });
    }

    if (isResolved && incident.resolvedAt) {
      const duration = Math.round(
        (incident.resolvedAt.getTime() - incident.startedAt.getTime()) / 60000
      );
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Resolved At*\n${incident.resolvedAt.toISOString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Duration*\n${duration} minutes`,
          },
        ],
      });

      if (incident.rootCause) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Root Cause*\n${incident.rootCause}`,
          },
        });
      }

      if (incident.actionsTaken && incident.actionsTaken.length > 0) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Actions Taken*\n${incident.actionsTaken.map((a) => `• ${a}`).join('\n')}`,
          },
        });
      }
    }

    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'plain_text',
          text: `Incident ID: ${incident.id}`,
        },
      ],
    } as unknown as SlackBlock);

    const message: SlackMessage = {
      text: `${isResolved ? 'Resolved' : 'Incident'}: ${incident.title}`,
      blocks,
      attachments: [
        {
          color,
          footer: 'Ferni AI Incident Management',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    await this.sendSlack('#incidents', message);

    // Also send email for critical incidents
    if (incident.severity === 'critical' && !isResolved) {
      const emailBody = `
<h2>Critical Incident: ${incident.title}</h2>
<p><strong>Severity:</strong> ${incident.severity.toUpperCase()}</p>
<p><strong>Status:</strong> ${incident.status}</p>
<p><strong>Affected Services:</strong> ${incident.affectedServices.join(', ') || 'None specified'}</p>
<p><strong>Started:</strong> ${incident.startedAt.toISOString()}</p>
${incident.description ? `<p><strong>Description:</strong> ${incident.description}</p>` : ''}
<p>Please investigate immediately.</p>`;

      await this.sendEmail(DEFAULT_EMAIL, `[CRITICAL] Incident: ${incident.title}`, emailBody);
    }
  }

  // --------------------------------------------------------------------------
  // HELPER METHODS
  // --------------------------------------------------------------------------

  /**
   * Check if Slack notifications are configured.
   */
  isSlackConfigured(): boolean {
    return this.slackConfigured;
  }

  /**
   * Check if email notifications are configured.
   */
  isEmailConfigured(): boolean {
    return this.emailConfigured;
  }

  /**
   * Get current rate limit status.
   */
  getRateLimitStatus(): {
    slack: { available: number; isLimited: boolean };
    email: { available: number; isLimited: boolean };
  } {
    return {
      slack: {
        available: slackLimiter.getAvailableTokens(),
        isLimited: slackLimiter.getAvailableTokens() === 0,
      },
      email: {
        available: emailLimiter.getAvailableTokens(),
        isLimited: emailLimiter.getAvailableTokens() === 0,
      },
    };
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let notificationServiceInstance: CEONotificationService | null = null;

/**
 * Get the singleton CEO notification service instance.
 */
export function getCEONotificationService(): CEONotificationService {
  if (!notificationServiceInstance) {
    notificationServiceInstance = new CEONotificationService();
  }
  return notificationServiceInstance;
}

/**
 * Reset the notification service (for testing).
 */
export function resetCEONotificationService(): void {
  notificationServiceInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

export const notificationService = {
  /**
   * Send a Slack message.
   */
  sendSlack: async (channel: string, message: SlackMessage) =>
    getCEONotificationService().sendSlack(channel, message),

  /**
   * Send an email.
   */
  sendEmail: async (to: string, subject: string, body: string) =>
    getCEONotificationService().sendEmail(to, subject, body),

  /**
   * Send a daily or weekly digest.
   */
  sendDigest: async (userId: string, type: 'daily' | 'weekly') =>
    getCEONotificationService().sendDigest(userId, type),

  /**
   * Notify about an experiment promotion.
   */
  notifyExperimentPromotion: async (experimentId: string, winner: string) =>
    getCEONotificationService().notifyExperimentPromotion(experimentId, winner),

  /**
   * Notify about an incident.
   */
  notifyIncident: async (incident: Incident) =>
    getCEONotificationService().notifyIncident(incident),

  /**
   * Check if Slack is configured.
   */
  isSlackConfigured: () => getCEONotificationService().isSlackConfigured(),

  /**
   * Check if email is configured.
   */
  isEmailConfigured: () => getCEONotificationService().isEmailConfigured(),

  /**
   * Get rate limit status.
   */
  getRateLimitStatus: () => getCEONotificationService().getRateLimitStatus(),
};

// Default export
export default notificationService;
