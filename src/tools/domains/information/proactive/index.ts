/**
 * Proactive Intelligence Engine
 *
 * The core "Better Than Human" feature: we reach out BEFORE you ask.
 *
 * This orchestrator runs periodic checks and generates alerts when:
 * - Weather threatens your outdoor plans
 * - Traffic is building before your commute
 * - Air quality is bad for your morning run
 * - Your favorite team is playing
 * - A friend's birthday is coming up
 *
 * TOOLS:
 *   checkAllAlerts       - Run all alert checks (called by background job)
 *   getMyAlerts          - Get pending alerts for a user
 *   acknowledgeAlert     - Mark an alert as seen
 *   setAlertPreferences  - Configure what alerts to receive
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../../utils/safe-logger.js';
import type { ToolContext, ToolDefinition } from '../../../registry/types.js';

import type {
  ProactiveAlert,
  AlertGenerationContext,
  AlertPreferences,
  AlertCategory,
} from './types.js';
import { DEFAULT_ALERT_PREFERENCES } from './types.js';
import { checkWeatherCalendarConflicts, checkWeatherAlerts } from './weather-calendar.js';

// Re-export types
export * from './types.js';
export { checkWeatherCalendarConflicts, checkWeatherAlerts } from './weather-calendar.js';

const log = getLogger();

// ============================================================================
// ALERT STORAGE (in-memory for now, will be Firestore)
// ============================================================================

const userAlerts = new Map<string, ProactiveAlert[]>();
const userPreferences = new Map<string, AlertPreferences>();

/**
 * Store an alert for a user
 */
function storeAlert(userId: string, alert: ProactiveAlert): void {
  const alerts = userAlerts.get(userId) || [];

  // Avoid duplicates (same id or very similar alerts)
  const isDuplicate = alerts.some(
    (a) =>
      a.id === alert.id ||
      (a.category === alert.category && a.title === alert.title && !a.acknowledged)
  );

  if (!isDuplicate) {
    alerts.push(alert);
    userAlerts.set(userId, alerts);
    log.info({ userId, alertId: alert.id, category: alert.category }, '🔔 Alert stored');
  }
}

/**
 * Get pending alerts for a user
 */
function getPendingAlerts(userId: string): ProactiveAlert[] {
  const alerts = userAlerts.get(userId) || [];
  const now = new Date();

  // Filter to unacknowledged, non-expired, relevant alerts
  return alerts.filter(
    (a) => !a.acknowledged && new Date(a.expiresAt) > now && new Date(a.relevantAt) <= now
  );
}

/**
 * Acknowledge an alert
 */
function acknowledgeAlert(userId: string, alertId: string, wasHelpful?: boolean): boolean {
  const alerts = userAlerts.get(userId);
  if (!alerts) return false;

  const alert = alerts.find((a) => a.id === alertId);
  if (!alert) return false;

  alert.acknowledged = true;
  alert.wasHelpful = wasHelpful;

  log.info({ userId, alertId, wasHelpful }, '🔔 Alert acknowledged');
  return true;
}

/**
 * Get user's alert preferences
 */
function getUserAlertPreferences(userId: string): AlertPreferences {
  return userPreferences.get(userId) || DEFAULT_ALERT_PREFERENCES;
}

/**
 * Set user's alert preferences
 */
function setUserAlertPreferences(
  userId: string,
  prefs: Partial<AlertPreferences>
): AlertPreferences {
  const current = getUserAlertPreferences(userId);
  const updated = { ...current, ...prefs };
  userPreferences.set(userId, updated);
  return updated;
}

// ============================================================================
// MAIN ALERT CHECK ORCHESTRATOR
// ============================================================================

/**
 * Run all alert checks for a user
 * This should be called periodically (e.g., every 15 minutes)
 */
export async function checkAllAlerts(context: AlertGenerationContext): Promise<ProactiveAlert[]> {
  const { userId } = context;
  const prefs = getUserAlertPreferences(userId);
  const allAlerts: ProactiveAlert[] = [];

  log.info({ userId }, '🔔 Running proactive alert checks');

  // Check weather alerts
  if (prefs.enabledCategories.includes('weather')) {
    try {
      const weatherAlerts = await checkWeatherAlerts(context);
      allAlerts.push(...weatherAlerts);

      // Also check weather-calendar conflicts if we have calendar events
      if (context.calendarEvents && context.calendarEvents.length > 0) {
        const calendarAlerts = await checkWeatherCalendarConflicts(context);
        allAlerts.push(...calendarAlerts);
      }
    } catch (error) {
      log.warn({ error: String(error), userId }, '🔔 Weather alert check failed');
    }
  }

  // Filter by urgency preference
  const urgencyOrder: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };
  const minUrgency = urgencyOrder[prefs.minimumUrgency] || 2;

  const filteredAlerts = allAlerts.filter((a) => urgencyOrder[a.urgency] >= minUrgency);

  // Check quiet hours
  const now = new Date();
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  if (prefs.quietHoursStart && prefs.quietHoursEnd) {
    const inQuietHours = isInQuietHours(currentTime, prefs.quietHoursStart, prefs.quietHoursEnd);
    if (inQuietHours) {
      // Only allow critical alerts during quiet hours
      const criticalAlerts = filteredAlerts.filter((a) => a.urgency === 'critical');
      criticalAlerts.forEach((a) => storeAlert(userId, a));
      return criticalAlerts;
    }
  }

  // Store all filtered alerts
  filteredAlerts.forEach((a) => storeAlert(userId, a));

  log.info({ userId, alertCount: filteredAlerts.length }, '🔔 Alert check complete');
  return filteredAlerts;
}

/**
 * Check if current time is in quiet hours
 */
function isInQuietHours(current: string, start: string, end: string): boolean {
  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (start > end) {
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const proactiveToolDefinitions: ToolDefinition[] = [
  {
    id: 'getMyAlerts',
    name: 'Get My Alerts',
    description: 'Get pending proactive alerts for the user.',
    domain: 'information',
    tags: ['information', 'alerts', 'proactive', 'notifications'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Get any pending alerts for the user. Use when user asks "any alerts?", "what should I know?", or at the start of a session to check for important notifications.',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return 'I need to know who you are to check your alerts.';
          }

          const alerts = getPendingAlerts(ctx.userId);

          if (alerts.length === 0) {
            return 'No alerts right now. All clear!';
          }

          // Format alerts naturally
          const formatted = alerts.map((a) => {
            const urgencyEmoji =
              a.urgency === 'critical' ? '🚨' : a.urgency === 'high' ? '⚠️' : 'ℹ️';
            return `${urgencyEmoji} ${a.message}`;
          });

          return `Here's what you should know:\n\n${formatted.join('\n\n')}`;
        },
      }),
  },

  {
    id: 'acknowledgeAlert',
    name: 'Acknowledge Alert',
    description: 'Mark an alert as seen and optionally provide feedback.',
    domain: 'information',
    tags: ['information', 'alerts', 'proactive'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Mark an alert as acknowledged. Use when user says "got it", "thanks for letting me know", or dismisses an alert.',
        parameters: z.object({
          alertId: z.string().describe('ID of the alert to acknowledge'),
          wasHelpful: z.boolean().optional().describe('Whether the alert was helpful'),
        }),
        execute: async ({ alertId, wasHelpful }) => {
          if (!ctx.userId) {
            return 'I need to know who you are.';
          }

          const success = acknowledgeAlert(ctx.userId, alertId, wasHelpful);

          return success ? "Got it! I'll learn from your feedback." : "Couldn't find that alert.";
        },
      }),
  },

  {
    id: 'setAlertPreferences',
    name: 'Set Alert Preferences',
    description: 'Configure what kinds of alerts the user wants to receive.',
    domain: 'information',
    tags: ['information', 'alerts', 'preferences', 'settings'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Configure alert preferences. Use when user says "fewer alerts", "only important alerts", "no alerts after 10pm", or "I want weather alerts".',
        parameters: z.object({
          enabledCategories: z
            .array(
              z.enum([
                'weather',
                'traffic',
                'environmental',
                'finance',
                'sports',
                'health',
                'relationship',
                'calendar',
              ])
            )
            .optional()
            .describe('Categories to enable'),
          quietHoursStart: z.string().optional().describe('Start of quiet hours (HH:MM)'),
          quietHoursEnd: z.string().optional().describe('End of quiet hours (HH:MM)'),
          minimumUrgency: z
            .enum(['low', 'medium', 'high', 'critical'])
            .optional()
            .describe('Minimum urgency to alert on'),
        }),
        execute: async ({ enabledCategories, quietHoursStart, quietHoursEnd, minimumUrgency }) => {
          if (!ctx.userId) {
            return 'I need to know who you are.';
          }

          const updates: Partial<AlertPreferences> = {};
          if (enabledCategories) updates.enabledCategories = enabledCategories;
          if (quietHoursStart) updates.quietHoursStart = quietHoursStart;
          if (quietHoursEnd) updates.quietHoursEnd = quietHoursEnd;
          if (minimumUrgency) updates.minimumUrgency = minimumUrgency;

          const prefs = setUserAlertPreferences(ctx.userId, updates);

          log.info({ userId: ctx.userId, updates }, '🔔 Alert preferences updated');

          const parts: string[] = ['Updated your alert preferences!'];

          if (enabledCategories) {
            parts.push(`Alerts enabled for: ${enabledCategories.join(', ')}.`);
          }
          if (quietHoursStart && quietHoursEnd) {
            parts.push(`Quiet hours: ${quietHoursStart} - ${quietHoursEnd}.`);
          }
          if (minimumUrgency) {
            parts.push(`Only ${minimumUrgency} urgency or higher will notify you.`);
          }

          return parts.join(' ');
        },
      }),
  },

  {
    id: 'checkProactiveAlerts',
    name: 'Check Proactive Alerts',
    description: 'Manually trigger a check for new alerts.',
    domain: 'information',
    tags: ['information', 'alerts', 'proactive', 'check'],
    create: (ctx: ToolContext) =>
      llm.tool({
        description:
          'Check for new proactive alerts based on current conditions. Use at session start or when user asks to check for updates.',
        parameters: z.object({}),
        execute: async () => {
          if (!ctx.userId) {
            return 'I need to know who you are to check alerts.';
          }

          const context: AlertGenerationContext = {
            userId: ctx.userId,
            location: ctx.userLocation
              ? {
                  city: ctx.userLocation.city || 'Unknown',
                  latitude: 0, // Would need to geocode
                  longitude: 0,
                }
              : undefined,
          };

          const alerts = await checkAllAlerts(context);

          if (alerts.length === 0) {
            return 'All clear! No new alerts.';
          }

          return `Found ${alerts.length} new alert${alerts.length > 1 ? 's' : ''}. Say "what are my alerts?" to hear them.`;
        },
      }),
  },
];

/**
 * Get proactive tool definitions
 */
export function getProactiveToolDefinitions(): ToolDefinition[] {
  return proactiveToolDefinitions;
}
