/**
 * Incident Timeline - Automatic Incident Documentation
 *
 * Automatically captures and documents everything during an incident:
 * - Timeline of events
 * - Actions taken
 * - Metrics changes
 * - Root cause determination
 * - Resolution summary
 *
 * "The best incident postmortem is one written during the incident."
 */

import { createLogger } from '../../utils/safe-logger.js';
import { SlackNotificationService } from '../integrations/slack-notifications.js';
import { generateRunbook, type Runbook } from './smart-runbooks.js';

const log = createLogger({ module: 'IncidentTimeline' });

// ============================================================================
// TYPES
// ============================================================================

export type IncidentSeverity = 'critical' | 'major' | 'minor';
export type IncidentStatus = 'open' | 'investigating' | 'mitigating' | 'resolved' | 'postmortem';
export type EventType =
  | 'detected'
  | 'alert_sent'
  | 'acknowledged'
  | 'investigating'
  | 'root_cause_identified'
  | 'mitigation_started'
  | 'mitigation_failed'
  | 'mitigation_successful'
  | 'rollback_initiated'
  | 'rollback_completed'
  | 'resolved'
  | 'postmortem_started'
  | 'action_taken'
  | 'metric_change'
  | 'note_added'
  | 'escalated'
  | 'runbook_generated';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: EventType;
  title: string;
  description: string;
  actor?: string; // Who/what triggered this event
  metadata?: Record<string, unknown>;
  automated: boolean;
}

export interface MetricSnapshot {
  timestamp: number;
  metrics: Record<string, number>;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  status: IncidentStatus;

  // Timing
  detectedAt: number;
  acknowledgedAt?: number;
  mitigatedAt?: number;
  resolvedAt?: number;
  durationMs?: number;

  // Context
  affectedServices: string[];
  affectedUsers?: number;
  rootCause?: string;
  resolution?: string;

  // Timeline
  events: TimelineEvent[];
  metricSnapshots: MetricSnapshot[];

  // Linked resources
  runbook?: Runbook;
  slackThreadId?: string;
  relatedIncidents?: string[];

  // Postmortem
  postmortem?: IncidentPostmortem;
}

export interface IncidentPostmortem {
  generatedAt: number;
  summary: string;
  timeline: string;
  rootCause: string;
  impact: string;
  whatWentWell: string[];
  whatCouldBeImproved: string[];
  actionItems: ActionItem[];
}

export interface ActionItem {
  title: string;
  owner?: string;
  priority: 'high' | 'medium' | 'low';
  dueDate?: string;
  status: 'pending' | 'in_progress' | 'completed';
}

// ============================================================================
// STATE
// ============================================================================

const incidents = new Map<string, Incident>();
const activeIncident = { current: null as string | null };
let slackService: SlackNotificationService | null = null;

// ============================================================================
// LIFECYCLE
// ============================================================================

export function initializeIncidentTimeline(): void {
  try {
    slackService = new SlackNotificationService();
  } catch {
    log.warn('Slack notifications disabled for incident timeline');
  }

  log.info('📅 Incident timeline initialized');
}

// ============================================================================
// INCIDENT MANAGEMENT
// ============================================================================

function generateId(): string {
  return `inc-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Open a new incident
 */
export async function openIncident(
  title: string,
  description: string,
  severity: IncidentSeverity,
  affectedServices: string[],
  actor = 'system'
): Promise<Incident> {
  const id = generateId();
  const now = Date.now();

  const incident: Incident = {
    id,
    title,
    description,
    severity,
    status: 'open',
    detectedAt: now,
    affectedServices,
    events: [],
    metricSnapshots: [],
  };

  // Add detection event
  addEvent(incident, {
    type: 'detected',
    title: 'Incident Detected',
    description: `${title} - ${description}`,
    actor,
    automated: actor === 'system',
  });

  // Store incident
  incidents.set(id, incident);
  activeIncident.current = id;

  log.warn({ incidentId: id, severity, title }, '🚨 Incident opened');

  // Send Slack notification
  if (slackService) {
    try {
      await slackService.notify({
        type: 'incident_opened',
        title: `🚨 Incident Opened: ${title}`,
        message: [
          `**Severity:** ${severity.toUpperCase()}`,
          `**Description:** ${description}`,
          `**Affected Services:** ${affectedServices.join(', ')}`,
          `**ID:** ${id}`,
        ].join('\n'),
        severity: severity === 'critical' ? 'error' : 'warning',
        metadata: { incidentId: id },
      });

      // Record alert event
      addEvent(incident, {
        type: 'alert_sent',
        title: 'Alert Sent to Slack',
        description: 'Incident notification sent to ops channel',
        automated: true,
      });
    } catch (error) {
      log.warn({ error: String(error) }, 'Failed to send incident Slack notification');
    }
  }

  // Auto-generate runbook
  try {
    const runbook = await generateRunbook(
      {
        type: title.toLowerCase().replace(/\s+/g, '_'),
        severity,
        title,
        description,
        timestamp: now,
      },
      id
    );

    incident.runbook = runbook;

    addEvent(incident, {
      type: 'runbook_generated',
      title: 'Runbook Generated',
      description: `AI-generated runbook with ${runbook.steps.length} steps`,
      automated: true,
      metadata: {
        confidence: runbook.confidence,
        estimatedMinutes: runbook.estimatedResolutionMinutes,
      },
    });
  } catch (error) {
    log.warn({ error: String(error) }, 'Failed to generate runbook');
  }

  return incident;
}

/**
 * Acknowledge an incident
 */
export function acknowledgeIncident(incidentId: string, actor: string): Incident | undefined {
  const incident = incidents.get(incidentId);
  if (!incident) return undefined;

  incident.acknowledgedAt = Date.now();
  incident.status = 'investigating';

  addEvent(incident, {
    type: 'acknowledged',
    title: 'Incident Acknowledged',
    description: `Acknowledged by ${actor}`,
    actor,
    automated: false,
  });

  log.info({ incidentId, actor }, 'Incident acknowledged');
  return incident;
}

/**
 * Add a note to the incident timeline
 */
export function addNote(incidentId: string, note: string, actor: string): void {
  const incident = incidents.get(incidentId);
  if (!incident) return;

  addEvent(incident, {
    type: 'note_added',
    title: 'Note Added',
    description: note,
    actor,
    automated: false,
  });
}

/**
 * Record an action taken
 */
export function recordAction(
  incidentId: string,
  action: string,
  result: string,
  actor: string,
  metadata?: Record<string, unknown>
): void {
  const incident = incidents.get(incidentId);
  if (!incident) return;

  addEvent(incident, {
    type: 'action_taken',
    title: action,
    description: result,
    actor,
    automated: false,
    metadata,
  });

  log.info({ incidentId, action, result }, 'Action recorded');
}

/**
 * Record a metric snapshot
 */
export function recordMetrics(incidentId: string, metrics: Record<string, number>): void {
  const incident = incidents.get(incidentId);
  if (!incident) return;

  incident.metricSnapshots.push({
    timestamp: Date.now(),
    metrics,
  });

  // Record significant changes as events
  if (incident.metricSnapshots.length > 1) {
    const prev = incident.metricSnapshots[incident.metricSnapshots.length - 2];
    const changes: string[] = [];

    for (const [key, value] of Object.entries(metrics)) {
      const prevValue = prev.metrics[key];
      if (prevValue !== undefined) {
        const changePercent = ((value - prevValue) / prevValue) * 100;
        if (Math.abs(changePercent) > 20) {
          changes.push(`${key}: ${changePercent > 0 ? '+' : ''}${changePercent.toFixed(1)}%`);
        }
      }
    }

    if (changes.length > 0) {
      addEvent(incident, {
        type: 'metric_change',
        title: 'Significant Metric Change',
        description: changes.join(', '),
        automated: true,
        metadata: metrics,
      });
    }
  }
}

/**
 * Set root cause
 */
export function setRootCause(incidentId: string, rootCause: string, actor: string): void {
  const incident = incidents.get(incidentId);
  if (!incident) return;

  incident.rootCause = rootCause;

  addEvent(incident, {
    type: 'root_cause_identified',
    title: 'Root Cause Identified',
    description: rootCause,
    actor,
    automated: false,
  });

  log.info({ incidentId, rootCause }, 'Root cause identified');
}

/**
 * Start mitigation
 */
export function startMitigation(incidentId: string, approach: string, actor: string): void {
  const incident = incidents.get(incidentId);
  if (!incident) return;

  incident.status = 'mitigating';

  addEvent(incident, {
    type: 'mitigation_started',
    title: 'Mitigation Started',
    description: approach,
    actor,
    automated: false,
  });

  log.info({ incidentId, approach }, 'Mitigation started');
}

/**
 * Resolve the incident
 */
export async function resolveIncident(
  incidentId: string,
  resolution: string,
  actor: string
): Promise<Incident | undefined> {
  const incident = incidents.get(incidentId);
  if (!incident) return undefined;

  incident.resolvedAt = Date.now();
  incident.mitigatedAt = incident.mitigatedAt || incident.resolvedAt;
  incident.durationMs = incident.resolvedAt - incident.detectedAt;
  incident.status = 'resolved';
  incident.resolution = resolution;

  addEvent(incident, {
    type: 'resolved',
    title: 'Incident Resolved',
    description: resolution,
    actor,
    automated: false,
  });

  // Clear active incident
  if (activeIncident.current === incidentId) {
    activeIncident.current = null;
  }

  log.info(
    { incidentId, durationMinutes: (incident.durationMs / 60000).toFixed(1) },
    '✅ Incident resolved'
  );

  // Send resolution notification
  if (slackService) {
    try {
      await slackService.notify({
        type: 'incident_resolved',
        title: `✅ Incident Resolved: ${incident.title}`,
        message: [
          `**Resolution:** ${resolution}`,
          `**Duration:** ${formatDuration(incident.durationMs)}`,
          `**Root Cause:** ${incident.rootCause || 'Not determined'}`,
        ].join('\n'),
        severity: 'success',
        metadata: { incidentId, durationMs: incident.durationMs },
      });
    } catch {
      // Ignore Slack errors
    }
  }

  return incident;
}

// ============================================================================
// POSTMORTEM GENERATION
// ============================================================================

export function generatePostmortem(incidentId: string): IncidentPostmortem | undefined {
  const incident = incidents.get(incidentId);
  if (!incident) return undefined;

  // Build timeline narrative
  const timelineNarrative = incident.events
    .map((e) => {
      const time = new Date(e.timestamp).toISOString();
      return `- **${time.split('T')[1].split('.')[0]}** - ${e.title}: ${e.description}`;
    })
    .join('\n');

  // Analyze what went well
  const whatWentWell: string[] = [];
  const ttd = incident.acknowledgedAt ? incident.acknowledgedAt - incident.detectedAt : null;
  if (ttd && ttd < 5 * 60 * 1000) {
    whatWentWell.push('Quick detection and acknowledgment');
  }
  if (incident.durationMs && incident.durationMs < 30 * 60 * 1000) {
    whatWentWell.push('Fast resolution time');
  }
  if (incident.runbook) {
    whatWentWell.push('AI-generated runbook was available');
  }
  if (incident.events.filter((e) => e.type === 'action_taken').length > 0) {
    whatWentWell.push('Actions were documented during incident');
  }

  // Analyze improvements
  const whatCouldBeImproved: string[] = [];
  if (!incident.rootCause) {
    whatCouldBeImproved.push('Root cause should be documented');
  }
  if (incident.durationMs && incident.durationMs > 60 * 60 * 1000) {
    whatCouldBeImproved.push('Resolution took longer than ideal');
  }
  if (!incident.acknowledgedAt) {
    whatCouldBeImproved.push('Incident was not formally acknowledged');
  }
  if (incident.events.filter((e) => e.type === 'note_added').length === 0) {
    whatCouldBeImproved.push('More real-time notes during incident would help');
  }

  // Generate action items
  const actionItems: ActionItem[] = [];
  if (!incident.rootCause) {
    actionItems.push({
      title: 'Document root cause of incident',
      priority: 'high',
      status: 'pending',
    });
  }
  if (incident.runbook?.preventionRecommendations) {
    for (const rec of incident.runbook.preventionRecommendations.slice(0, 3)) {
      actionItems.push({
        title: rec,
        priority: 'medium',
        status: 'pending',
      });
    }
  }
  actionItems.push({
    title: 'Review and update runbook based on actual resolution',
    priority: 'low',
    status: 'pending',
  });

  const postmortem: IncidentPostmortem = {
    generatedAt: Date.now(),
    summary: `${incident.title} - ${incident.severity} severity incident affecting ${incident.affectedServices.join(', ')}. ${incident.resolution || 'Resolved through investigation.'}`,
    timeline: timelineNarrative,
    rootCause: incident.rootCause || 'Root cause not documented',
    impact: `Affected services: ${incident.affectedServices.join(', ')}. Duration: ${formatDuration(incident.durationMs || 0)}.`,
    whatWentWell,
    whatCouldBeImproved,
    actionItems,
  };

  incident.postmortem = postmortem;
  incident.status = 'postmortem';

  addEvent(incident, {
    type: 'postmortem_started',
    title: 'Postmortem Generated',
    description: `Postmortem with ${actionItems.length} action items`,
    automated: true,
  });

  log.info({ incidentId, actionItems: actionItems.length }, 'Postmortem generated');
  return postmortem;
}

// ============================================================================
// HELPERS
// ============================================================================

function addEvent(incident: Incident, event: Omit<TimelineEvent, 'id' | 'timestamp'>): void {
  incident.events.push({
    id: generateEventId(),
    timestamp: Date.now(),
    ...event,
  });
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

// ============================================================================
// QUERIES
// ============================================================================

export function getIncident(incidentId: string): Incident | undefined {
  return incidents.get(incidentId);
}

export function getActiveIncident(): Incident | undefined {
  if (!activeIncident.current) return undefined;
  return incidents.get(activeIncident.current);
}

export function getActiveIncidents(): Incident[] {
  return Array.from(incidents.values()).filter(
    (i) => i.status !== 'resolved' && i.status !== 'postmortem'
  );
}

export function getRecentIncidents(limit = 10): Incident[] {
  return Array.from(incidents.values())
    .sort((a, b) => b.detectedAt - a.detectedAt)
    .slice(0, limit);
}

export function getIncidentStats(windowMs: number = 7 * 24 * 60 * 60 * 1000): {
  total: number;
  bySeverity: Record<IncidentSeverity, number>;
  avgResolutionMs: number;
  mttr: number; // Mean Time To Resolve
  mtta: number; // Mean Time To Acknowledge
} {
  const windowStart = Date.now() - windowMs;
  const windowIncidents = Array.from(incidents.values()).filter((i) => i.detectedAt >= windowStart);

  const resolved = windowIncidents.filter((i) => i.resolvedAt);
  const acknowledged = windowIncidents.filter((i) => i.acknowledgedAt);

  const totalResolutionMs = resolved.reduce((sum, i) => sum + (i.durationMs || 0), 0);
  const totalAckTimeMs = acknowledged.reduce(
    (sum, i) => sum + ((i.acknowledgedAt || 0) - i.detectedAt),
    0
  );

  return {
    total: windowIncidents.length,
    bySeverity: {
      critical: windowIncidents.filter((i) => i.severity === 'critical').length,
      major: windowIncidents.filter((i) => i.severity === 'major').length,
      minor: windowIncidents.filter((i) => i.severity === 'minor').length,
    },
    avgResolutionMs: resolved.length > 0 ? totalResolutionMs / resolved.length : 0,
    mttr: resolved.length > 0 ? totalResolutionMs / resolved.length : 0,
    mtta: acknowledged.length > 0 ? totalAckTimeMs / acknowledged.length : 0,
  };
}

// ============================================================================
// AUTO-INCIDENT CREATION
// ============================================================================

/**
 * Automatically create incident from alert
 * Called by other monitoring systems
 */
export async function createIncidentFromAlert(
  alertType: string,
  title: string,
  description: string,
  severity: IncidentSeverity,
  metrics?: Record<string, number>,
  services?: string[]
): Promise<Incident> {
  const incident = await openIncident(
    title,
    description,
    severity,
    services || ['voice-agent'],
    'automated-alert'
  );

  if (metrics) {
    recordMetrics(incident.id, metrics);
  }

  return incident;
}
