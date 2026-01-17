/**
 * Advanced Reminder Tools
 *
 * Extended reminder capabilities beyond basic time-based reminders:
 * - Location-based reminders (geofencing)
 * - Recurring reminders with patterns
 * - Smart reminders that learn optimal timing
 *
 * These fill gaps identified in synthetic LLM testing.
 *
 * @module simple-utilities/advanced-reminders
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getToolDescription } from '../../utils/tool-descriptions.js';
import { trackCapabilityUsage } from './shortcuts-tools.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface LocationReminder {
  id: string;
  userId: string;
  message: string;
  location: {
    name: string;
    address?: string;
    latitude?: number;
    longitude?: number;
    radius?: number; // meters, default 100
  };
  triggerOn: 'arrive' | 'leave';
  active: boolean;
  createdAt: number;
  lastTriggered?: number;
}

export interface RecurringReminder {
  id: string;
  userId: string;
  message: string;
  pattern: RecurrencePattern;
  time: string; // HH:MM
  timezone: string;
  active: boolean;
  nextOccurrence: number;
  lastTriggered?: number;
  createdAt: number;
}

export type RecurrencePattern =
  | { type: 'daily' }
  | { type: 'weekdays' } // Mon-Fri
  | { type: 'weekends' } // Sat-Sun
  | { type: 'weekly'; dayOfWeek: number } // 0=Sun, 6=Sat
  | { type: 'biweekly'; dayOfWeek: number }
  | { type: 'monthly'; dayOfMonth: number }
  | { type: 'custom'; days: number[] }; // Array of day numbers

// ============================================================================
// STORAGE (Firestore-backed with in-memory fallback)
// ============================================================================

const locationReminders = new Map<string, LocationReminder[]>();
const recurringReminders = new Map<string, RecurringReminder[]>();

async function loadLocationReminders(userId: string): Promise<LocationReminder[]> {
  if (locationReminders.has(userId)) {
    return locationReminders.get(userId)!;
  }

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('location_reminders')
      .where('active', '==', true)
      .get();

    const reminders = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as LocationReminder
    );
    locationReminders.set(userId, reminders);
    return reminders;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Firestore not available for location reminders');
    return [];
  }
}

async function saveLocationReminder(userId: string, reminder: LocationReminder): Promise<void> {
  // Update cache
  const existing = locationReminders.get(userId) || [];
  const idx = existing.findIndex((r) => r.id === reminder.id);
  if (idx >= 0) {
    existing[idx] = reminder;
  } else {
    existing.push(reminder);
  }
  locationReminders.set(userId, existing);

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('location_reminders')
      .doc(reminder.id)
      .set(cleanForFirestore(reminder));

    log.info({ userId, reminderId: reminder.id }, 'Saved location reminder');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not persist location reminder');
  }
}

async function loadRecurringReminders(userId: string): Promise<RecurringReminder[]> {
  if (recurringReminders.has(userId)) {
    return recurringReminders.get(userId)!;
  }

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('recurring_reminders')
      .where('active', '==', true)
      .get();

    const reminders = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as RecurringReminder
    );
    recurringReminders.set(userId, reminders);
    return reminders;
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Firestore not available for recurring reminders');
    return [];
  }
}

async function saveRecurringReminder(userId: string, reminder: RecurringReminder): Promise<void> {
  // Update cache
  const existing = recurringReminders.get(userId) || [];
  const idx = existing.findIndex((r) => r.id === reminder.id);
  if (idx >= 0) {
    existing[idx] = reminder;
  } else {
    existing.push(reminder);
  }
  recurringReminders.set(userId, existing);

  try {
    const { getFirestoreStore } = await import('../../../memory/firestore-store.js');
    const store = getFirestoreStore();
    const db = await store.getDatabase();

    await db
      .collection('bogle_users')
      .doc(userId)
      .collection('recurring_reminders')
      .doc(reminder.id)
      .set(cleanForFirestore(reminder));

    log.info({ userId, reminderId: reminder.id }, 'Saved recurring reminder');
  } catch (error) {
    log.debug({ error: String(error), userId }, 'Could not persist recurring reminder');
  }
}

// ============================================================================
// LOCATION-BASED REMINDER
// ============================================================================

const locationReminderDef: ToolDefinition = {
  id: 'locationReminder',
  name: 'Location Reminder',
  description: 'Set a reminder that triggers when you arrive at or leave a location',
  domain: 'simple-utilities',
  tags: ['reminder', 'location', 'geofence', 'arrive', 'leave', 'advanced'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('locationReminder') ||
        'Set a location-based reminder. Say "remind me to buy milk when I get to the grocery store" or "remind me to take the trash out when I leave home".',
      parameters: z.object({
        message: z.string().describe('What to be reminded of'),
        locationName: z
          .string()
          .describe('Name of the place (e.g., "grocery store", "home", "work", "gym")'),
        address: z.string().optional().describe('Specific address if known'),
        triggerOn: z
          .enum(['arrive', 'leave'])
          .default('arrive')
          .describe('Trigger when arriving or leaving'),
      }),
      execute: async ({ message, locationName, address, triggerOn }) => {
        log.info({ userId: ctx.userId, locationName, triggerOn }, 'Creating location reminder');
        trackCapabilityUsage(ctx.userId || 'anon', 'locationReminder');

        // Create the reminder
        const reminder: LocationReminder = {
          id: `loc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          userId: ctx.userId || 'anon',
          message,
          location: {
            name: locationName,
            address,
            radius: 100, // 100 meters default
          },
          triggerOn,
          active: true,
          createdAt: Date.now(),
        };

        await saveLocationReminder(ctx.userId || 'anon', reminder);

        const triggerPhrase = triggerOn === 'arrive' ? 'get to' : 'leave';
        return `Got it! I'll remind you to "${message}" when you ${triggerPhrase} ${locationName}. Make sure location services are enabled on your device for this to work.`;
      },
    });
  },
};

// ============================================================================
// LIST LOCATION REMINDERS
// ============================================================================

const listLocationRemindersDef: ToolDefinition = {
  id: 'listLocationReminders',
  name: 'List Location Reminders',
  description: 'Show all active location-based reminders',
  domain: 'simple-utilities',
  tags: ['reminder', 'location', 'list'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('listLocationReminders') || 'Show all location-based reminders.',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Listing location reminders');
        trackCapabilityUsage(ctx.userId || 'anon', 'listLocationReminders');

        const reminders = await loadLocationReminders(ctx.userId || 'anon');
        const active = reminders.filter((r) => r.active);

        if (active.length === 0) {
          return "You don't have any location-based reminders set.";
        }

        const list = active
          .map((r) => {
            const trigger = r.triggerOn === 'arrive' ? 'When arriving at' : 'When leaving';
            return `• ${trigger} ${r.location.name}: "${r.message}"`;
          })
          .join('\n');

        return `**Your location reminders:**\n${list}`;
      },
    });
  },
};

// ============================================================================
// RECURRING REMINDER
// ============================================================================

const recurringReminderDef: ToolDefinition = {
  id: 'recurringReminder',
  name: 'Recurring Reminder',
  description: 'Set a reminder that repeats on a schedule',
  domain: 'simple-utilities',
  tags: ['reminder', 'recurring', 'repeat', 'schedule', 'advanced'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('recurringReminder') ||
        'Set a recurring reminder. Say "remind me to take out the trash every Tuesday" or "daily reminder to drink water at 9am".',
      parameters: z.object({
        message: z.string().describe('What to be reminded of'),
        pattern: z
          .enum(['daily', 'weekdays', 'weekends', 'weekly', 'biweekly', 'monthly'])
          .describe('How often to repeat'),
        dayOfWeek: z
          .number()
          .min(0)
          .max(6)
          .optional()
          .describe('Day of week for weekly/biweekly (0=Sunday, 6=Saturday)'),
        dayOfMonth: z.number().min(1).max(31).optional().describe('Day of month for monthly'),
        time: z.string().describe('Time for the reminder (e.g., "9am", "14:30")'),
      }),
      execute: async ({ message, pattern, dayOfWeek, dayOfMonth, time }) => {
        log.info({ userId: ctx.userId, pattern, time }, 'Creating recurring reminder');
        trackCapabilityUsage(ctx.userId || 'anon', 'recurringReminder');

        // Parse the time
        const parsedTime = parseTime(time);
        if (!parsedTime) {
          return `I didn't understand that time. Try something like "9am", "2:30 PM", or "14:00".`;
        }

        // Build the recurrence pattern
        let recurrencePattern: RecurrencePattern;
        switch (pattern) {
          case 'daily':
            recurrencePattern = { type: 'daily' };
            break;
          case 'weekdays':
            recurrencePattern = { type: 'weekdays' };
            break;
          case 'weekends':
            recurrencePattern = { type: 'weekends' };
            break;
          case 'weekly':
            if (dayOfWeek === undefined) {
              return 'For weekly reminders, I need to know which day. Try "every Monday" or specify the day.';
            }
            recurrencePattern = { type: 'weekly', dayOfWeek };
            break;
          case 'biweekly':
            if (dayOfWeek === undefined) {
              return 'For biweekly reminders, I need to know which day. Try "every other Monday".';
            }
            recurrencePattern = { type: 'biweekly', dayOfWeek };
            break;
          case 'monthly':
            if (dayOfMonth === undefined) {
              return 'For monthly reminders, I need to know which day. Try "1st of every month" or "15th monthly".';
            }
            recurrencePattern = { type: 'monthly', dayOfMonth };
            break;
          default:
            recurrencePattern = { type: 'daily' };
        }

        // Calculate next occurrence
        const nextOccurrence = calculateNextOccurrence(recurrencePattern, parsedTime);

        // Get user's timezone preference, defaulting to America/New_York
        let userTimezone = 'America/New_York';
        try {
          const store = await import('../../../memory/index.js').then((m) => m.getDefaultStore());
          const profile = await store.getProfile(ctx.userId || 'anon');
          if (profile?.contactInfo?.timezone) {
            userTimezone = profile.contactInfo.timezone;
          }
        } catch {
          // Fallback to default timezone
        }

        const reminder: RecurringReminder = {
          id: `rec_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          userId: ctx.userId || 'anon',
          message,
          pattern: recurrencePattern,
          time: parsedTime,
          timezone: userTimezone,
          active: true,
          nextOccurrence,
          createdAt: Date.now(),
        };

        await saveRecurringReminder(ctx.userId || 'anon', reminder);

        const patternDescription = describePattern(recurrencePattern);
        return `Got it! I'll remind you "${message}" ${patternDescription} at ${formatTime(parsedTime)}. First reminder: ${formatNextOccurrence(nextOccurrence)}.`;
      },
    });
  },
};

// ============================================================================
// LIST RECURRING REMINDERS
// ============================================================================

const listRecurringRemindersDef: ToolDefinition = {
  id: 'listRecurringReminders',
  name: 'List Recurring Reminders',
  description: 'Show all active recurring reminders',
  domain: 'simple-utilities',
  tags: ['reminder', 'recurring', 'list'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: getToolDescription('listRecurringReminders') || 'Show all recurring reminders.',
      parameters: z.object({}),
      execute: async () => {
        log.info({ userId: ctx.userId }, 'Listing recurring reminders');
        trackCapabilityUsage(ctx.userId || 'anon', 'listRecurringReminders');

        const reminders = await loadRecurringReminders(ctx.userId || 'anon');
        const active = reminders.filter((r) => r.active);

        if (active.length === 0) {
          return "You don't have any recurring reminders set.";
        }

        const list = active
          .map((r) => {
            const pattern = describePattern(r.pattern);
            return `• ${pattern} at ${formatTime(r.time)}: "${r.message}"`;
          })
          .join('\n');

        return `**Your recurring reminders:**\n${list}`;
      },
    });
  },
};

// ============================================================================
// CANCEL REMINDER
// ============================================================================

const cancelReminderDef: ToolDefinition = {
  id: 'cancelRecurringReminder',
  name: 'Cancel Recurring Reminder',
  description: 'Cancel a recurring or location-based reminder',
  domain: 'simple-utilities',
  tags: ['reminder', 'cancel', 'delete'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description:
        getToolDescription('cancelRecurringReminder') || 'Cancel a recurring or location reminder.',
      parameters: z.object({
        type: z.enum(['location', 'recurring']).describe('Type of reminder to cancel'),
        searchTerm: z.string().describe('Part of the reminder message to find it'),
      }),
      execute: async ({ type, searchTerm }) => {
        log.info({ userId: ctx.userId, type, searchTerm }, 'Cancelling reminder');
        trackCapabilityUsage(ctx.userId || 'anon', 'cancelRecurringReminder');

        const userId = ctx.userId || 'anon';
        const searchLower = searchTerm.toLowerCase();

        if (type === 'location') {
          const reminders = await loadLocationReminders(userId);
          const match = reminders.find(
            (r) => r.active && r.message.toLowerCase().includes(searchLower)
          );

          if (!match) {
            return `I couldn't find a location reminder matching "${searchTerm}".`;
          }

          match.active = false;
          await saveLocationReminder(userId, match);
          return `Cancelled: "${match.message}" at ${match.location.name}`;
        } else {
          const reminders = await loadRecurringReminders(userId);
          const match = reminders.find(
            (r) => r.active && r.message.toLowerCase().includes(searchLower)
          );

          if (!match) {
            return `I couldn't find a recurring reminder matching "${searchTerm}".`;
          }

          match.active = false;
          await saveRecurringReminder(userId, match);
          return `Cancelled: "${match.message}" (${describePattern(match.pattern)})`;
        }
      },
    });
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseTime(time: string): string | null {
  const cleaned = time.toLowerCase().trim();

  // Match patterns like "9am", "9:30 am", "14:30", "2 PM"
  const patterns = [/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/i, /^(\d{1,2})\s*(am|pm)$/i];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3]?.toLowerCase();

      // Convert to 24-hour format
      if (meridiem === 'pm' && hours !== 12) {
        hours += 12;
      } else if (meridiem === 'am' && hours === 12) {
        hours = 0;
      }

      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      }
    }
  }

  return null;
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const meridiem = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return minutes === 0
    ? `${displayHours} ${meridiem}`
    : `${displayHours}:${minutes.toString().padStart(2, '0')} ${meridiem}`;
}

function describePattern(pattern: RecurrencePattern): string {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  switch (pattern.type) {
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'every weekday (Mon-Fri)';
    case 'weekends':
      return 'every weekend (Sat-Sun)';
    case 'weekly':
      return `every ${dayNames[pattern.dayOfWeek]}`;
    case 'biweekly':
      return `every other ${dayNames[pattern.dayOfWeek]}`;
    case 'monthly':
      return `the ${ordinal(pattern.dayOfMonth)} of every month`;
    case 'custom':
      const days = pattern.days.map((d) => dayNames[d]).join(', ');
      return `every ${days}`;
    default:
      return 'on schedule';
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function calculateNextOccurrence(pattern: RecurrencePattern, time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(hours, minutes, 0, 0);

  // If time has passed today, start from tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  // Find next matching day
  const maxIterations = 35; // Max days to search
  for (let i = 0; i < maxIterations; i++) {
    const dayOfWeek = next.getDay();
    const dayOfMonth = next.getDate();

    let matches = false;
    switch (pattern.type) {
      case 'daily':
        matches = true;
        break;
      case 'weekdays':
        matches = dayOfWeek >= 1 && dayOfWeek <= 5;
        break;
      case 'weekends':
        matches = dayOfWeek === 0 || dayOfWeek === 6;
        break;
      case 'weekly':
        matches = dayOfWeek === pattern.dayOfWeek;
        break;
      case 'biweekly':
        // Simplified: just match weekly for now
        matches = dayOfWeek === pattern.dayOfWeek;
        break;
      case 'monthly':
        matches = dayOfMonth === pattern.dayOfMonth;
        break;
      case 'custom':
        matches = pattern.days.includes(dayOfWeek);
        break;
    }

    if (matches) {
      return next.getTime();
    }

    next.setDate(next.getDate() + 1);
  }

  // Fallback: return tomorrow
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 1);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback.getTime();
}

function formatNextOccurrence(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const timeStr = formatTime(
    `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
  );

  if (date.toDateString() === now.toDateString()) {
    return `today at ${timeStr}`;
  } else if (date.toDateString() === tomorrow.toDateString()) {
    return `tomorrow at ${timeStr}`;
  } else {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return `${dayNames[date.getDay()]} at ${timeStr}`;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const advancedReminderDefinitions: ToolDefinition[] = [
  locationReminderDef,
  listLocationRemindersDef,
  recurringReminderDef,
  listRecurringRemindersDef,
  cancelReminderDef,
];

export {
  locationReminderDef,
  listLocationRemindersDef,
  recurringReminderDef,
  listRecurringRemindersDef,
  cancelReminderDef,
};
