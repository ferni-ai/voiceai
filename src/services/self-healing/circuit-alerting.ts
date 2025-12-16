/**
 * Circuit Breaker Alerting
 *
 * Sends notifications when circuit breakers change state:
 * - CLOSED → OPEN: Alert! Service is failing
 * - OPEN → HALF_OPEN: Service is recovering
 * - HALF_OPEN → CLOSED: Recovery complete
 * - HALF_OPEN → OPEN: Recovery failed
 *
 * Integrates with:
 * - Slack webhooks for real-time alerts
 * - Email for critical incidents
 * - In-memory event log for debugging
 */

import { createLogger } from '../../utils/safe-logger.js';
import type { CircuitState } from './circuit-breaker.js';

const log = createLogger({ module: 'circuit-alerting' });

// ============================================================================
// TYPES
// ============================================================================

export interface CircuitEvent {
  circuitName: string;
  oldState: CircuitState;
  newState: CircuitState;
  timestamp: Date;
  details?: {
    failures?: number;
    lastError?: string;
    successRate?: string;
  };
}

export interface AlertConfig {
  /** Slack webhook URL for alerts */
  slackWebhookUrl?: string;
  /** Email for critical alerts */
  alertEmail?: string;
  /** Minimum time between alerts for same circuit (ms) */
  alertCooldownMs?: number;
  /** Enable verbose logging */
  verbose?: boolean;
  /** Custom alert handler */
  onAlert?: (event: CircuitEvent, severity: AlertSeverity) => void;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

interface AlertRecord {
  circuitName: string;
  lastAlertTime: number;
  alertCount: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SLACK_ALERTS_WEBHOOK =
  process.env.SLACK_ALERTS_WEBHOOK || process.env.SLACK_WEBHOOK_URL || '';
const ALERT_EMAIL = process.env.ALERT_EMAIL || '';
const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

// Alert rate limiting
const alertRecords = new Map<string, AlertRecord>();

// Event history for debugging
const eventHistory: CircuitEvent[] = [];
const MAX_EVENT_HISTORY = 1000;

// Configuration
let config: AlertConfig = {
  slackWebhookUrl: SLACK_ALERTS_WEBHOOK,
  alertEmail: ALERT_EMAIL,
  alertCooldownMs: DEFAULT_COOLDOWN_MS,
  verbose: false,
};

// ============================================================================
// SEVERITY MAPPING
// ============================================================================

function getAlertSeverity(oldState: CircuitState, newState: CircuitState): AlertSeverity {
  // Circuit opened - service is failing
  if (newState === 'open' && oldState !== 'open') {
    return 'critical';
  }

  // Circuit stayed open after half-open test
  if (oldState === 'half_open' && newState === 'open') {
    return 'warning';
  }

  // Circuit closed - recovery complete
  if (newState === 'closed' && oldState !== 'closed') {
    return 'info';
  }

  // Circuit went to half-open - testing recovery
  if (newState === 'half_open') {
    return 'info';
  }

  return 'info';
}

// ============================================================================
// SLACK ALERTING
// ============================================================================

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: '🚨',
  warning: '⚠️',
  info: 'ℹ️',
};

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  critical: '#FF0000',
  warning: '#FFA500',
  info: '#4CAF50',
};

const STATE_DESCRIPTIONS: Record<CircuitState, string> = {
  closed: 'Service is healthy',
  open: 'Service is failing - requests blocked',
  half_open: 'Testing recovery',
};

async function sendSlackAlert(event: CircuitEvent, severity: AlertSeverity): Promise<boolean> {
  if (!config.slackWebhookUrl) {
    return false;
  }

  const emoji = SEVERITY_EMOJI[severity];
  const color = SEVERITY_COLOR[severity];
  const stateDescription = STATE_DESCRIPTIONS[event.newState];

  const title =
    severity === 'critical'
      ? `Circuit Breaker OPEN: ${event.circuitName}`
      : severity === 'warning'
        ? `Circuit Breaker Alert: ${event.circuitName}`
        : `Circuit Breaker Update: ${event.circuitName}`;

  try {
    const response = await fetch(config.slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attachments: [
          {
            color,
            blocks: [
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
                    text: `*Service:*\n${event.circuitName}`,
                  },
                  {
                    type: 'mrkdwn',
                    text: `*State:*\n${event.oldState} → ${event.newState}`,
                  },
                ],
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Status:* ${stateDescription}`,
                },
              },
              ...(event.details
                ? [
                    {
                      type: 'context',
                      elements: [
                        {
                          type: 'mrkdwn',
                          text: [
                            event.details.failures !== undefined
                              ? `Failures: ${event.details.failures}`
                              : '',
                            event.details.successRate
                              ? `Success Rate: ${event.details.successRate}`
                              : '',
                            event.details.lastError
                              ? `Last Error: ${event.details.lastError.slice(0, 100)}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' | '),
                        },
                      ],
                    },
                  ]
                : []),
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `Time: ${event.timestamp.toISOString()}`,
                  },
                ],
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      log.warn({ status: response.status }, 'Slack alert failed');
      return false;
    }

    return true;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to send Slack alert');
    return false;
  }
}

// ============================================================================
// EMAIL ALERTING (Critical only)
// ============================================================================

async function sendEmailAlert(event: CircuitEvent, severity: AlertSeverity): Promise<boolean> {
  // Only email for critical alerts
  if (severity !== 'critical' || !config.alertEmail) {
    return false;
  }

  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: config.alertEmail }] }],
        from: { email: 'alerts@ferni.ai', name: 'Ferni Alerts' },
        subject: `🚨 Circuit Breaker OPEN: ${event.circuitName}`,
        content: [
          {
            type: 'text/plain',
            value: `Circuit Breaker Alert

Service: ${event.circuitName}
State Change: ${event.oldState} → ${event.newState}
Time: ${event.timestamp.toISOString()}

${event.details?.lastError ? `Last Error: ${event.details.lastError}` : ''}
${event.details?.failures !== undefined ? `Failure Count: ${event.details.failures}` : ''}

This is an automated alert from Ferni's self-healing system.
Check the circuit breaker dashboard: https://app.ferni.ai/health/circuits
`,
          },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });

    return response.ok || response.status === 202;
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to send email alert');
    return false;
  }
}

// ============================================================================
// RATE LIMITING
// ============================================================================

function shouldAlert(circuitName: string): boolean {
  const now = Date.now();
  const record = alertRecords.get(circuitName);
  const cooldown = config.alertCooldownMs || DEFAULT_COOLDOWN_MS;

  if (!record) {
    alertRecords.set(circuitName, { circuitName, lastAlertTime: now, alertCount: 1 });
    return true;
  }

  if (now - record.lastAlertTime > cooldown) {
    record.lastAlertTime = now;
    record.alertCount++;
    return true;
  }

  return false;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

/**
 * Handle circuit breaker state change.
 * Call this from circuit breaker's onStateChange callback.
 */
export async function handleCircuitStateChange(
  circuitName: string,
  oldState: CircuitState,
  newState: CircuitState,
  details?: CircuitEvent['details']
): Promise<void> {
  const event: CircuitEvent = {
    circuitName,
    oldState,
    newState,
    timestamp: new Date(),
    details,
  };

  // Add to event history
  eventHistory.push(event);
  if (eventHistory.length > MAX_EVENT_HISTORY) {
    eventHistory.shift();
  }

  const severity = getAlertSeverity(oldState, newState);

  // Log the event
  if (severity === 'critical') {
    log.error({ ...event }, `Circuit breaker OPENED: ${circuitName}`);
  } else if (severity === 'warning') {
    log.warn({ ...event }, `Circuit breaker alert: ${circuitName}`);
  } else if (config.verbose) {
    log.info({ ...event }, `Circuit breaker state change: ${circuitName}`);
  }

  // Custom handler
  if (config.onAlert) {
    try {
      config.onAlert(event, severity);
    } catch (error) {
      log.warn({ error: String(error) }, 'Custom alert handler failed');
    }
  }

  // Rate limit alerts
  if (!shouldAlert(circuitName)) {
    log.debug({ circuitName }, 'Alert rate limited');
    return;
  }

  // Send alerts (non-blocking)
  const alertPromises: Promise<boolean>[] = [];

  // Slack for all severities
  if (config.slackWebhookUrl && (severity === 'critical' || severity === 'warning')) {
    alertPromises.push(sendSlackAlert(event, severity));
  }

  // Email only for critical
  if (severity === 'critical') {
    alertPromises.push(sendEmailAlert(event, severity));
  }

  // Wait for alerts but don't block
  if (alertPromises.length > 0) {
    Promise.all(alertPromises)
      .then((results) => {
        const sent = results.filter(Boolean).length;
        if (sent > 0) {
          log.debug({ circuitName, sent }, 'Alerts sent');
        }
      })
      .catch((error) => {
        log.warn({ error: String(error) }, 'Alert sending failed');
      });
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Configure circuit breaker alerting
 */
export function configureAlerting(newConfig: Partial<AlertConfig>): void {
  config = { ...config, ...newConfig };
  log.info(
    { hasSlack: !!config.slackWebhookUrl, hasEmail: !!config.alertEmail },
    'Alerting configured'
  );
}

/**
 * Get current alerting configuration (for testing)
 */
export function getAlertConfig(): AlertConfig {
  return { ...config };
}

// ============================================================================
// EVENT HISTORY
// ============================================================================

/**
 * Get recent circuit events for debugging
 */
export function getRecentEvents(limit = 100): CircuitEvent[] {
  return eventHistory.slice(-limit);
}

/**
 * Get events for a specific circuit
 */
export function getCircuitEvents(circuitName: string, limit = 50): CircuitEvent[] {
  return eventHistory.filter((e) => e.circuitName === circuitName).slice(-limit);
}

/**
 * Clear event history (for testing)
 */
export function clearEventHistory(): void {
  eventHistory.length = 0;
}

// ============================================================================
// INTEGRATION HELPER
// ============================================================================

/**
 * Create an onStateChange callback for circuit breakers that sends alerts
 */
export function createAlertingCallback(
  getStats?: (
    name: string
  ) => { failures: number; totalRequests: number; totalSuccesses: number } | undefined
): (name: string, oldState: CircuitState, newState: CircuitState) => void {
  return (name: string, oldState: CircuitState, newState: CircuitState) => {
    const stats = getStats?.(name);

    handleCircuitStateChange(name, oldState, newState, {
      failures: stats?.failures,
      successRate: stats?.totalRequests
        ? `${((stats.totalSuccesses / stats.totalRequests) * 100).toFixed(1)}%`
        : undefined,
    });
  };
}
