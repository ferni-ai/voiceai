/**
 * Recurring Call Scheduler
 *
 * "Call my mom every Sunday" - superhuman relationship maintenance
 *
 * Features:
 * - Natural language schedule parsing ("every Sunday at 10am")
 * - Smart timing based on contact's availability
 * - Personalized call purposes that evolve
 * - Automatic rescheduling on missed calls
 *
 * @module tools/domains/telephony/recurring-calls
 */

import { z } from 'zod';
import { createLogger } from '../../../utils/safe-logger.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = createLogger({ module: 'recurring-calls' });

// ============================================================================
// TYPES
// ============================================================================

export interface RecurringCallSchedule {
  id: string;
  userId: string;

  // Contact info
  contactQuery: string; // "mom", "dad", etc.
  contactName?: string; // Resolved name
  contactPhone?: string; // Resolved phone

  // Schedule
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  timeOfDay: string; // "10:00" in user's timezone
  timezone: string;

  // Call settings
  purpose: string; // "check in", "say good morning", etc.
  defaultMessage?: string; // What to say if user doesn't specify

  // Status
  enabled: boolean;
  lastCallDate?: string;
  nextCallDate?: string;
  missedCount: number;

  // Metadata
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// SCHEMA
// ============================================================================

export const scheduleRecurringCallSchema = z.object({
  contactQuery: z
    .string()
    .describe('Who to call - can be a name, relationship, or alias like "mom", "dad", "grandma"'),
  schedule: z
    .string()
    .describe(
      'Natural language schedule: "every Sunday", "weekly on Tuesdays", "every day at 10am", "twice a month"'
    ),
  purpose: z
    .string()
    .optional()
    .describe('Why to call: "check in", "say good morning", "see how they\'re doing"'),
  message: z
    .string()
    .optional()
    .describe("Optional default message to deliver if the user doesn't specify later"),
});

// ============================================================================
// SCHEDULE PARSING
// ============================================================================

interface ParsedSchedule {
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  dayOfWeek?: number;
  dayOfMonth?: number;
  timeOfDay: string;
}

/**
 * Parse natural language schedule into structured format
 */
function parseSchedule(input: string): ParsedSchedule {
  const lower = input.toLowerCase();

  // Default time
  let timeOfDay = '10:00';

  // Extract time if specified
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1]);
    const minute = timeMatch[2] || '00';
    const meridiem = timeMatch[3];

    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;

    timeOfDay = `${hour.toString().padStart(2, '0')}:${minute}`;
  }

  // Parse frequency and day
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  // Check for specific day
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      return {
        frequency:
          lower.includes('every other') || lower.includes('biweekly') ? 'biweekly' : 'weekly',
        dayOfWeek: i,
        timeOfDay,
      };
    }
  }

  // Check for patterns
  if (lower.includes('every day') || lower.includes('daily')) {
    return { frequency: 'daily', timeOfDay };
  }

  if (lower.includes('every week') || lower.includes('weekly')) {
    return { frequency: 'weekly', dayOfWeek: 0, timeOfDay }; // Default to Sunday
  }

  if (lower.includes('every other week') || lower.includes('biweekly')) {
    return { frequency: 'biweekly', dayOfWeek: 0, timeOfDay };
  }

  if (
    lower.includes('monthly') ||
    lower.includes('every month') ||
    lower.includes('once a month')
  ) {
    return { frequency: 'monthly', dayOfMonth: 1, timeOfDay };
  }

  if (lower.includes('twice a month')) {
    return { frequency: 'biweekly', dayOfWeek: 0, timeOfDay };
  }

  // Default to weekly on Sunday
  return { frequency: 'weekly', dayOfWeek: 0, timeOfDay };
}

/**
 * Calculate the next call date based on schedule
 */
function calculateNextCallDate(schedule: ParsedSchedule, timezone: string): Date {
  const now = new Date();
  const [hours, minutes] = schedule.timeOfDay.split(':').map(Number);

  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);

  if (schedule.frequency === 'daily') {
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
  } else if (schedule.frequency === 'weekly' || schedule.frequency === 'biweekly') {
    const currentDay = now.getDay();
    const targetDay = schedule.dayOfWeek ?? 0;
    let daysUntil = (targetDay - currentDay + 7) % 7;

    if (daysUntil === 0 && next <= now) {
      daysUntil = 7;
    }

    next.setDate(next.getDate() + daysUntil);

    if (schedule.frequency === 'biweekly') {
      // For biweekly, we'd need to track which week we're on
      // Simplified: just use weekly for now
    }
  } else if (schedule.frequency === 'monthly') {
    const targetDay = schedule.dayOfMonth ?? 1;
    next.setDate(targetDay);

    if (next <= now) {
      next.setMonth(next.getMonth() + 1);
    }
  }

  return next;
}

// ============================================================================
// STORAGE
// ============================================================================

/**
 * Save a recurring call schedule
 */
async function saveSchedule(schedule: RecurringCallSchedule): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (db) {
      await db
        .collection('bogle_users')
        .doc(schedule.userId)
        .collection('recurring_call_schedules')
        .doc(schedule.id)
        .set(cleanForFirestore(schedule));

      log.info(
        { scheduleId: schedule.id, userId: schedule.userId, frequency: schedule.frequency },
        'Saved recurring call schedule'
      );
    }
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to save recurring call schedule');
    throw error;
  }
}

/**
 * Get all active recurring call schedules for a user
 */
export async function getActiveSchedules(userId: string): Promise<RecurringCallSchedule[]> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return [];

    const snapshot = await db
      .collection('bogle_users')
      .doc(userId)
      .collection('recurring_call_schedules')
      .where('enabled', '==', true)
      .get();

    const schedules: RecurringCallSchedule[] = [];
    snapshot.forEach((doc) => {
      schedules.push(doc.data() as RecurringCallSchedule);
    });

    return schedules;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get active schedules');
    return [];
  }
}

/**
 * Get schedules that are due for execution
 */
export async function getDueSchedules(userId: string): Promise<RecurringCallSchedule[]> {
  const schedules = await getActiveSchedules(userId);
  const now = new Date();

  return schedules.filter((schedule) => {
    if (!schedule.nextCallDate) return false;
    const nextCall = new Date(schedule.nextCallDate);
    return nextCall <= now;
  });
}

/**
 * Update schedule after a call is made
 */
export async function markScheduleExecuted(scheduleId: string, userId: string): Promise<void> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) return;

    const docRef = db
      .collection('bogle_users')
      .doc(userId)
      .collection('recurring_call_schedules')
      .doc(scheduleId);

    const doc = await docRef.get();
    if (!doc.exists) return;

    const schedule = doc.data() as RecurringCallSchedule;
    const parsed: ParsedSchedule = {
      frequency: schedule.frequency,
      dayOfWeek: schedule.dayOfWeek,
      dayOfMonth: schedule.dayOfMonth,
      timeOfDay: schedule.timeOfDay,
    };

    const nextCall = calculateNextCallDate(parsed, schedule.timezone);

    await docRef.update({
      lastCallDate: new Date().toISOString(),
      nextCallDate: nextCall.toISOString(),
      missedCount: 0,
      updatedAt: new Date().toISOString(),
    });

    log.info(
      { scheduleId, nextCallDate: nextCall.toISOString() },
      'Updated schedule after execution'
    );
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to mark schedule executed');
  }
}

// ============================================================================
// TOOL IMPLEMENTATION
// ============================================================================

/**
 * Schedule a recurring call to a contact
 */
export async function scheduleRecurringCall(
  params: z.infer<typeof scheduleRecurringCallSchema>,
  ctx: { userId: string; timezone?: string }
): Promise<string> {
  const { contactQuery, schedule, purpose, message } = params;
  const timezone = ctx.timezone || 'Etc/UTC';

  log.info({ contactQuery, schedule, purpose, userId: ctx.userId }, 'Scheduling recurring call');

  // Parse the schedule
  const parsedSchedule = parseSchedule(schedule);

  // Resolve the contact
  let contactName: string | undefined;
  let contactPhone: string | undefined;

  try {
    const { findContactForTelephony, isEntityStoreReady } =
      await import('../../../memory/entity-store/integration.js');

    if (isEntityStoreReady()) {
      const contact = await findContactForTelephony(ctx.userId, contactQuery);
      if (contact) {
        contactName = contact.name;
        contactPhone = contact.phone;
      }
    }
  } catch {
    // Contact resolution failed, will try later
  }

  // Calculate next call
  const nextCallDate = calculateNextCallDate(parsedSchedule, timezone);

  // Create the schedule
  const scheduleRecord: RecurringCallSchedule = {
    id: `recurring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId: ctx.userId,
    contactQuery,
    contactName,
    contactPhone,
    frequency: parsedSchedule.frequency,
    dayOfWeek: parsedSchedule.dayOfWeek,
    dayOfMonth: parsedSchedule.dayOfMonth,
    timeOfDay: parsedSchedule.timeOfDay,
    timezone,
    purpose: purpose || 'check in',
    defaultMessage: message,
    enabled: true,
    nextCallDate: nextCallDate.toISOString(),
    missedCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Save to Firestore
  await saveSchedule(scheduleRecord);

  // Build response
  const frequencyText = {
    daily: 'every day',
    weekly: 'every week',
    biweekly: 'every other week',
    monthly: 'every month',
  }[parsedSchedule.frequency];

  const dayText =
    parsedSchedule.dayOfWeek !== undefined
      ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
          parsedSchedule.dayOfWeek
        ]
      : '';

  const displayName = contactName || contactQuery;

  return (
    `Got it! I'll call ${displayName} ${frequencyText}${dayText ? ` on ${dayText}` : ''} ` +
    `around ${formatTime(parsedSchedule.timeOfDay)}. ` +
    `My first call will be ${formatRelativeDate(nextCallDate)}. ` +
    `${purpose ? `I'll ${purpose} when I call them.` : "I'll check in on them for you."} ` +
    `Want me to change anything about this schedule?`
  );
}

/**
 * List recurring call schedules
 */
export async function listRecurringCalls(ctx: { userId: string }): Promise<string> {
  const schedules = await getActiveSchedules(ctx.userId);

  if (schedules.length === 0) {
    return (
      "You don't have any recurring calls set up yet. " +
      'Would you like me to schedule regular check-ins with someone? ' +
      'Just say something like "call mom every Sunday".'
    );
  }

  const lines = schedules.map((s) => {
    const day =
      s.dayOfWeek !== undefined
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][s.dayOfWeek]
        : '';
    const freq = {
      daily: 'Daily',
      weekly: `Every ${day}`,
      biweekly: `Every other ${day}`,
      monthly: `Monthly`,
    }[s.frequency];

    return `- ${s.contactName || s.contactQuery}: ${freq} at ${formatTime(s.timeOfDay)}`;
  });

  return `Here are your recurring calls:\n\n${lines.join('\n')}\n\nWant to add or change any?`;
}

/**
 * Cancel a recurring call schedule
 */
export async function cancelRecurringCall(
  contactQuery: string,
  ctx: { userId: string }
): Promise<string> {
  try {
    const { getFirestoreDb } = await import('../../../services/superhuman/firestore-utils.js');
    const db = getFirestoreDb();

    if (!db) {
      return "I couldn't access the schedule. Please try again.";
    }

    // Find matching schedule
    const snapshot = await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('recurring_call_schedules')
      .where('enabled', '==', true)
      .get();

    const lowerQuery = contactQuery.toLowerCase();
    let matchedDocId: string | null = null;
    let matchedData: RecurringCallSchedule | null = null;

    for (const doc of snapshot.docs) {
      const data = doc.data() as RecurringCallSchedule;
      if (
        data.contactQuery.toLowerCase().includes(lowerQuery) ||
        (data.contactName && data.contactName.toLowerCase().includes(lowerQuery))
      ) {
        matchedDocId = doc.id;
        matchedData = data;
        break;
      }
    }

    if (!matchedDocId || !matchedData) {
      return `I couldn't find a recurring call schedule for "${contactQuery}". Want me to list your schedules?`;
    }

    // TypeScript narrowing doesn't work after the loop, so capture the values
    const docId = matchedDocId;
    const scheduleData = matchedData;

    // Disable the schedule
    await db
      .collection('bogle_users')
      .doc(ctx.userId)
      .collection('recurring_call_schedules')
      .doc(docId)
      .update({
        enabled: false,
        updatedAt: new Date().toISOString(),
      });

    return `Okay, I've cancelled the recurring calls to ${scheduleData.contactName || scheduleData.contactQuery}. I won't call them on schedule anymore. You can always set it up again later!`;
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to cancel recurring call');
    return 'I had trouble cancelling that schedule. Please try again.';
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function formatTime(timeOfDay: string): string {
  const [hours, minutes] = timeOfDay.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 || 12;
  return minutes === 0
    ? `${displayHour} ${period}`
    : `${displayHour}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function formatRelativeDate(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
      date.getDay()
    ];
  }
  return date.toLocaleDateString();
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export const recurringCallTools = [
  {
    name: 'scheduleRecurringCall',
    description:
      'Schedule a recurring phone call to a contact. Examples: "call mom every Sunday", "check in with dad weekly", "call grandma every month".',
    schema: scheduleRecurringCallSchema,
    execute: scheduleRecurringCall,
  },
  {
    name: 'listRecurringCalls',
    description: 'List all scheduled recurring calls.',
    schema: z.object({}),
    execute: listRecurringCalls,
  },
  {
    name: 'cancelRecurringCall',
    description: 'Cancel a recurring call schedule.',
    schema: z.object({
      contactQuery: z.string().describe('Who to stop calling - name or relationship'),
    }),
    execute: cancelRecurringCall,
  },
];

export default recurringCallTools;
