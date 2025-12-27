/**
 * Alarm Tools
 *
 * Recurring wake-up alarms (different from one-time reminders).
 * Supports daily, weekdays, weekends, and custom day patterns.
 *
 * @module simple-utilities/alarm-tools
 */

import type { ToolDefinition, ToolContext, Tool } from '../../registry/types.js';
import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../../../utils/safe-logger.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export type AlarmRepeat = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface Alarm {
  id: string;
  userId: string;
  label: string;
  time: string; // HH:MM in 24-hour format
  repeat: AlarmRepeat;
  customDays?: number[]; // 0-6 for Sunday-Saturday
  enabled: boolean;
  snoozedUntil?: number; // Timestamp if snoozed
  createdAt: number;
  updatedAt: number;
}

// In-memory fallback
const alarmStore = new Map<string, Alarm[]>();

// Day name mappings
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORTS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ============================================================================
// STORAGE HELPERS
// ============================================================================

async function loadAlarms(userId: string): Promise<Alarm[]> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const snapshot = await db
        .collection('bogle_users')
        .doc(userId)
        .collection('alarms')
        .where('enabled', '==', true)
        .get();

      return snapshot.docs.map(
        (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({ id: doc.id, ...doc.data() }) as Alarm
      );
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available for alarms');
  }

  // Fallback to in-memory
  return alarmStore.get(userId) || [];
}

async function saveAlarm(userId: string, alarm: Alarm): Promise<Alarm> {
  try {
    const db = getFirestoreDb();
    if (db) {
      const ref = db.collection('bogle_users').doc(userId).collection('alarms').doc(alarm.id);
      await ref.set(cleanForFirestore(alarm));
      log.info({ alarmId: alarm.id, userId }, 'Alarm saved to Firestore');
      return alarm;
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore not available, using in-memory');
  }

  // Fallback to in-memory
  const userAlarms = alarmStore.get(userId) || [];
  const existingIndex = userAlarms.findIndex((a) => a.id === alarm.id);
  if (existingIndex >= 0) {
    userAlarms[existingIndex] = alarm;
  } else {
    userAlarms.push(alarm);
  }
  alarmStore.set(userId, userAlarms);

  return alarm;
}

async function deleteAlarm(userId: string, alarmId: string): Promise<boolean> {
  try {
    const db = getFirestoreDb();
    if (db) {
      await db.collection('bogle_users').doc(userId).collection('alarms').doc(alarmId).delete();
      log.info({ alarmId, userId }, 'Alarm deleted from Firestore');
      return true;
    }
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Firestore delete failed');
  }

  // Fallback to in-memory
  const userAlarms = alarmStore.get(userId) || [];
  const filtered = userAlarms.filter((a) => a.id !== alarmId);
  alarmStore.set(userId, filtered);
  return true;
}

// ============================================================================
// TIME PARSING HELPERS
// ============================================================================

/**
 * Parse a natural language time into 24-hour format HH:MM
 */
function parseAlarmTime(input: string): { time: string; error?: string } {
  const normalized = input.toLowerCase().trim();

  // Handle special times
  if (normalized === 'noon' || normalized === 'midday') {
    return { time: '12:00' };
  }
  if (normalized === 'midnight') {
    return { time: '00:00' };
  }

  // Handle HH:MM or H:MM format with optional AM/PM
  const timeMatch = normalized.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/i);

  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2] || '0', 10);
    const meridiem = timeMatch[3]?.replace(/\./g, '').toLowerCase();

    // Validate
    if (hour > 23 || minute > 59) {
      return { time: '', error: 'Invalid time format' };
    }

    // Handle AM/PM conversion
    if (meridiem === 'pm' && hour !== 12) {
      hour += 12;
    } else if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }

    // Format as HH:MM
    return { time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}` };
  }

  // Handle just hour with AM/PM (e.g., "7am", "10 pm")
  const simpleMatch = normalized.match(/^(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)$/i);

  if (simpleMatch) {
    let hour = parseInt(simpleMatch[1], 10);
    const meridiem = simpleMatch[2].replace(/\./g, '').toLowerCase();

    if (hour > 12) {
      return { time: '', error: 'Invalid hour for AM/PM format' };
    }

    if (meridiem === 'pm' && hour !== 12) {
      hour += 12;
    } else if (meridiem === 'am' && hour === 12) {
      hour = 0;
    }

    return { time: `${hour.toString().padStart(2, '0')}:00` };
  }

  return { time: '', error: `Couldn't understand "${input}". Try "7:30 AM" or "14:00".` };
}

/**
 * Parse repeat pattern from natural language
 */
function parseRepeatPattern(input: string): {
  repeat: AlarmRepeat;
  customDays?: number[];
  error?: string;
} {
  const normalized = input.toLowerCase().trim();

  // Simple patterns
  if (!input || normalized === 'once' || normalized === 'one time' || normalized === 'just once') {
    return { repeat: 'once' };
  }

  if (normalized === 'daily' || normalized === 'every day' || normalized === 'everyday') {
    return { repeat: 'daily' };
  }

  if (
    normalized === 'weekdays' ||
    normalized === 'every weekday' ||
    normalized === 'monday through friday' ||
    normalized === 'mon-fri'
  ) {
    return { repeat: 'weekdays' };
  }

  if (
    normalized === 'weekends' ||
    normalized === 'every weekend' ||
    normalized === 'saturday and sunday'
  ) {
    return { repeat: 'weekends' };
  }

  // Custom days parsing
  const days: number[] = [];
  const dayPatterns = [
    { pattern: /\bsun(?:day)?\b/i, day: 0 },
    { pattern: /\bmon(?:day)?\b/i, day: 1 },
    { pattern: /\btue(?:s(?:day)?)?\b/i, day: 2 },
    { pattern: /\bwed(?:nesday)?\b/i, day: 3 },
    { pattern: /\bthu(?:rs(?:day)?)?\b/i, day: 4 },
    { pattern: /\bfri(?:day)?\b/i, day: 5 },
    { pattern: /\bsat(?:urday)?\b/i, day: 6 },
  ];

  for (const { pattern, day } of dayPatterns) {
    if (pattern.test(normalized)) {
      days.push(day);
    }
  }

  if (days.length > 0) {
    return { repeat: 'custom', customDays: days.sort() };
  }

  return { repeat: 'once' }; // Default to once if can't parse
}

/**
 * Format time for speech
 */
function formatTimeForSpeech(time: string): string {
  const [hourStr, minuteStr] = time.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const meridiem = hour >= 12 ? 'PM' : 'AM';
  const minuteDisplay = minute === 0 ? '' : `:${minuteStr}`;

  return `${displayHour}${minuteDisplay} ${meridiem}`;
}

/**
 * Format repeat pattern for speech
 */
function formatRepeatForSpeech(alarm: Alarm): string {
  switch (alarm.repeat) {
    case 'once':
      return 'one time';
    case 'daily':
      return 'every day';
    case 'weekdays':
      return 'weekdays only';
    case 'weekends':
      return 'weekends only';
    case 'custom':
      if (alarm.customDays && alarm.customDays.length > 0) {
        if (alarm.customDays.length === 7) return 'every day';
        return alarm.customDays.map((d) => DAY_SHORTS[d]).join(', ');
      }
      return 'custom';
    default:
      return '';
  }
}

/**
 * Generate unique alarm ID
 */
function generateAlarmId(): string {
  return `alarm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// SET ALARM TOOL
// ============================================================================

const setAlarmDef: ToolDefinition = {
  id: 'setAlarm',
  name: 'Set Alarm',
  description: 'Set a recurring or one-time alarm',
  domain: 'simple-utilities',
  tags: ['alarm', 'wake', 'morning', 'schedule', 'recurring'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Set an alarm for a specific time. Supports recurring patterns: daily, weekdays (Mon-Fri), weekends (Sat-Sun), or specific days. Use when the user says "Set an alarm for 7am", "Wake me up at 6:30", or "Set a weekday alarm for 5:45".`,
      parameters: z.object({
        time: z
          .string()
          .describe('The alarm time in natural language (e.g., "7:30 AM", "6am", "14:00", "noon")'),
        repeat: z
          .string()
          .optional()
          .describe(
            'How often to repeat: "once", "daily", "weekdays", "weekends", or specific days like "Monday, Wednesday, Friday"'
          ),
        label: z
          .string()
          .optional()
          .describe('Optional label for the alarm (e.g., "Wake up", "Take medicine")'),
      }),
      execute: async ({ time, repeat = 'once', label }) => {
        const { time: parsedTime, error: timeError } = parseAlarmTime(time);
        if (timeError) {
          return timeError;
        }

        const { repeat: parsedRepeat, customDays, error: repeatError } = parseRepeatPattern(repeat);
        if (repeatError) {
          return repeatError;
        }

        const alarm: Alarm = {
          id: generateAlarmId(),
          userId: ctx.userId,
          label: label || 'Alarm',
          time: parsedTime,
          repeat: parsedRepeat,
          customDays,
          enabled: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        await saveAlarm(ctx.userId, alarm);

        log.info({ alarmId: alarm.id, time: parsedTime, repeat: parsedRepeat }, 'Alarm set');

        // Build response
        const timeDisplay = formatTimeForSpeech(parsedTime);
        const repeatDisplay = formatRepeatForSpeech(alarm);

        if (alarm.repeat === 'once') {
          return `⏰ Alarm set for **${timeDisplay}**${label ? ` - "${label}"` : ''}`;
        }

        return `⏰ Alarm set for **${timeDisplay}**, repeating ${repeatDisplay}${label ? ` - "${label}"` : ''}`;
      },
    });
  },
};

// ============================================================================
// GET ALARMS TOOL
// ============================================================================

const getAlarmsDef: ToolDefinition = {
  id: 'getAlarms',
  name: 'Get Alarms',
  description: 'View all set alarms',
  domain: 'simple-utilities',
  tags: ['alarm', 'list', 'view'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `List all active alarms. Use when the user asks "What alarms do I have?", "Show my alarms", or "What time is my alarm set for?"`,
      parameters: z.object({}),
      execute: async () => {
        const alarms = await loadAlarms(ctx.userId);

        if (alarms.length === 0) {
          return "You don't have any alarms set. Say 'Set an alarm for 7am' to create one.";
        }

        // Sort by time
        const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));

        const lines = sorted.map((alarm, i) => {
          const timeDisplay = formatTimeForSpeech(alarm.time);
          const repeatDisplay = formatRepeatForSpeech(alarm);
          const label = alarm.label !== 'Alarm' ? ` - ${alarm.label}` : '';
          const snoozed = alarm.snoozedUntil && alarm.snoozedUntil > Date.now() ? ' (snoozed)' : '';

          return `${i + 1}. **${timeDisplay}** ${repeatDisplay}${label}${snoozed}`;
        });

        return `**Your Alarms:**\n${lines.join('\n')}`;
      },
    });
  },
};

// ============================================================================
// DELETE ALARM TOOL
// ============================================================================

const deleteAlarmDef: ToolDefinition = {
  id: 'deleteAlarm',
  name: 'Delete Alarm',
  description: 'Delete or turn off an alarm',
  domain: 'simple-utilities',
  tags: ['alarm', 'delete', 'cancel', 'off'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Delete or disable an alarm. Use when the user says "Delete my 7am alarm", "Turn off the alarm", "Cancel alarm 1", or "Remove the morning alarm".`,
      parameters: z.object({
        query: z
          .string()
          .describe(
            'Which alarm to delete - can be a number from the list, a time like "7am", or a label like "morning"'
          ),
      }),
      execute: async ({ query }) => {
        const alarms = await loadAlarms(ctx.userId);

        if (alarms.length === 0) {
          return "You don't have any alarms to delete.";
        }

        const queryLower = query.toLowerCase().trim();

        // Try to match by number
        const num = parseInt(queryLower);
        if (!isNaN(num) && num > 0 && num <= alarms.length) {
          const sorted = [...alarms].sort((a, b) => a.time.localeCompare(b.time));
          const toDelete = sorted[num - 1];
          await deleteAlarm(ctx.userId, toDelete.id);
          return `Deleted alarm for ${formatTimeForSpeech(toDelete.time)}.`;
        }

        // Try to match by time
        const { time: parsedTime } = parseAlarmTime(query);
        if (parsedTime) {
          const match = alarms.find((a) => a.time === parsedTime);
          if (match) {
            await deleteAlarm(ctx.userId, match.id);
            return `Deleted alarm for ${formatTimeForSpeech(match.time)}.`;
          }
        }

        // Try to match by label
        const match = alarms.find(
          (a) =>
            a.label.toLowerCase().includes(queryLower) || queryLower.includes(a.label.toLowerCase())
        );
        if (match) {
          await deleteAlarm(ctx.userId, match.id);
          return `Deleted alarm "${match.label}" for ${formatTimeForSpeech(match.time)}.`;
        }

        // Delete all if "all" is specified
        if (queryLower === 'all' || queryLower === 'everything') {
          for (const alarm of alarms) {
            await deleteAlarm(ctx.userId, alarm.id);
          }
          return `Deleted all ${alarms.length} alarm${alarms.length > 1 ? 's' : ''}.`;
        }

        return `I couldn't find an alarm matching "${query}". Say "show my alarms" to see the list.`;
      },
    });
  },
};

// ============================================================================
// SNOOZE ALARM TOOL
// ============================================================================

const snoozeAlarmDef: ToolDefinition = {
  id: 'snoozeAlarm',
  name: 'Snooze Alarm',
  description: 'Snooze an alarm for a few more minutes',
  domain: 'simple-utilities',
  tags: ['alarm', 'snooze', 'more sleep'],

  create: (ctx: ToolContext): Tool => {
    return llm.tool({
      description: `Snooze an active alarm. Use when the user says "Snooze", "5 more minutes", or "Snooze the alarm for 10 minutes".`,
      parameters: z.object({
        minutes: z.number().optional().describe('How many minutes to snooze (default: 9 minutes)'),
      }),
      execute: async ({ minutes = 9 }) => {
        const alarms = await loadAlarms(ctx.userId);

        // Find the most recently triggered or upcoming alarm
        const now = Date.now();
        const currentHour = new Date().getHours();
        const currentMin = new Date().getMinutes();
        const currentTimeStr = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

        // Find alarm closest to current time (within 30 min window)
        const recent = alarms.find((a) => {
          const [aH, aM] = a.time.split(':').map(Number);
          const diff = currentHour * 60 + currentMin - (aH * 60 + aM);
          return diff >= -5 && diff <= 30; // 5 min before to 30 min after
        });

        if (!recent) {
          return "I don't see an alarm that needs snoozing. Set an alarm first!";
        }

        // Snooze it
        const snoozeMs = minutes * 60 * 1000;
        recent.snoozedUntil = now + snoozeMs;
        recent.updatedAt = now;
        await saveAlarm(ctx.userId, recent);

        log.info({ alarmId: recent.id, minutes }, 'Alarm snoozed');

        return `⏰ Snoozed for ${minutes} minute${minutes !== 1 ? 's' : ''}. I'll remind you again soon.`;
      },
    });
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const alarmToolDefinitions: ToolDefinition[] = [
  setAlarmDef,
  getAlarmsDef,
  deleteAlarmDef,
  snoozeAlarmDef,
];

export { setAlarmDef, getAlarmsDef, deleteAlarmDef, snoozeAlarmDef };
