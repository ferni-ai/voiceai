/**
 * Milestone Calendar Sync
 *
 * Syncs Jordan's milestones and events to the calendar.
 * This is "better than human" because no assistant:
 * - Automatically creates countdown reminders
 * - Blocks prep time for important milestones
 * - Injects milestone awareness into daily briefings
 *
 * @module milestones/milestone-calendar-sync
 */

import { createLogger } from '../../utils/safe-logger.js';
import {
  createEvent,
  getEventsForDay,
  type CalendarEvent,
  type CreateEventInput,
} from '../calendar/calendar-service.js';

const log = createLogger({ module: 'milestone-calendar' });

// ============================================================================
// TYPES
// ============================================================================

export interface Milestone {
  id: string;
  userId: string;
  name: string;
  description?: string;
  date: Date;
  category?: 'personal' | 'career' | 'health' | 'relationship' | 'financial' | 'other';
  importance: 'high' | 'medium' | 'low';
  requiresPrep: boolean;
  prepTimeHours?: number;
  calendarEventId?: string;
  countdownReminderIds?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface MilestoneCalendarSync {
  milestoneId: string;
  calendarEventId: string | null;
  countdownReminders: Array<{ date: Date; eventId: string }>;
  prepTimeBlocked: boolean;
  prepEventId?: string;
}

export interface MilestoneCountdown {
  milestone: Milestone;
  daysUntil: number;
  isUrgent: boolean; // <= 7 days
  isImminent: boolean; // <= 3 days
  message: string;
}

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

/**
 * Sync a milestone to the calendar
 *
 * Creates the main event and optionally prep time.
 */
export async function syncMilestoneToCalendar(
  userId: string,
  milestone: Milestone
): Promise<MilestoneCalendarSync> {
  const result: MilestoneCalendarSync = {
    milestoneId: milestone.id,
    calendarEventId: null,
    countdownReminders: [],
    prepTimeBlocked: false,
  };

  try {
    // Create main calendar event (all day events use durationMinutes: 24*60)
    const mainEvent = await createEvent(userId, {
      title: `🎯 ${milestone.name}`,
      description: `Milestone: ${milestone.description || milestone.name}\n\nCategory: ${milestone.category || 'personal'}\nImportance: ${milestone.importance}\n\nTracked by Ferni`,
      startTime: milestone.date,
      durationMinutes: 60, // 1 hour event on milestone day
    });

    if (mainEvent) {
      result.calendarEventId = mainEvent.id;
      log.debug(
        { userId, milestoneId: milestone.id, eventId: mainEvent.id },
        'Milestone synced to calendar'
      );
    }

    // Block prep time if needed
    if (milestone.requiresPrep && milestone.prepTimeHours) {
      const prepStart = new Date(milestone.date);
      prepStart.setDate(prepStart.getDate() - 1);
      prepStart.setHours(14, 0, 0, 0); // Day before at 2pm

      const prepEvent = await createEvent(userId, {
        title: `📝 Prep for: ${milestone.name}`,
        description: `Preparation time for tomorrow's milestone.\n\nMilestone: ${milestone.name}`,
        startTime: prepStart,
        durationMinutes: milestone.prepTimeHours * 60,
      });

      if (prepEvent) {
        result.prepTimeBlocked = true;
        result.prepEventId = prepEvent.id;
      }
    }

    return result;
  } catch (error) {
    log.error(
      { error: String(error), userId, milestoneId: milestone.id },
      'Failed to sync milestone'
    );
    return result;
  }
}

/**
 * Create countdown reminders for a milestone
 */
export async function createMilestoneCountdown(
  userId: string,
  milestone: Milestone,
  reminderDaysBefore: number[] = [30, 14, 7, 3, 1]
): Promise<Array<{ date: Date; eventId: string }>> {
  const reminders: Array<{ date: Date; eventId: string }> = [];

  const now = new Date();
  const milestoneDate = new Date(milestone.date);

  for (const daysBefore of reminderDaysBefore) {
    const reminderDate = new Date(milestoneDate);
    reminderDate.setDate(reminderDate.getDate() - daysBefore);

    // Skip if reminder date is in the past
    if (reminderDate < now) continue;

    // Set to morning
    reminderDate.setHours(9, 0, 0, 0);

    try {
      const event = await createEvent(userId, {
        title: `⏰ ${daysBefore} days until: ${milestone.name}`,
        description: `Countdown reminder for ${milestone.name}\n\nMilestone date: ${milestoneDate.toLocaleDateString()}\nDays remaining: ${daysBefore}`,
        startTime: reminderDate,
        durationMinutes: 15,
      });

      if (event) {
        reminders.push({ date: reminderDate, eventId: event.id });
      }
    } catch (error) {
      log.error({ error: String(error), daysBefore }, 'Failed to create countdown reminder');
    }
  }

  log.info(
    { userId, milestoneId: milestone.id, reminderCount: reminders.length },
    'Created countdown reminders'
  );

  return reminders;
}

/**
 * Get milestones that should be mentioned in today's briefing
 */
export async function getMilestonesForDailyBriefing(
  userId: string,
  milestones: Milestone[]
): Promise<MilestoneCountdown[]> {
  const countdowns: MilestoneCountdown[] = [];
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  for (const milestone of milestones) {
    const milestoneDate = new Date(milestone.date);
    milestoneDate.setHours(0, 0, 0, 0);

    const daysUntil = Math.ceil((milestoneDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    // Only include upcoming milestones (within 30 days)
    if (daysUntil < 0 || daysUntil > 30) continue;

    const isUrgent = daysUntil <= 7;
    const isImminent = daysUntil <= 3;

    // Generate appropriate message
    let message: string;
    if (daysUntil === 0) {
      message = `Today is the day: ${milestone.name}!`;
    } else if (daysUntil === 1) {
      message = `Tomorrow: ${milestone.name}`;
    } else if (isImminent) {
      message = `${milestone.name} in ${daysUntil} days - getting close!`;
    } else if (isUrgent) {
      message = `${milestone.name} coming up in ${daysUntil} days`;
    } else {
      message = `${daysUntil} days until ${milestone.name}`;
    }

    countdowns.push({
      milestone,
      daysUntil,
      isUrgent,
      isImminent,
      message,
    });
  }

  // Sort by days until
  countdowns.sort((a, b) => a.daysUntil - b.daysUntil);

  return countdowns;
}

/**
 * Inject milestone countdown into daily context
 */
export async function injectMilestoneCountdownToDaily(
  userId: string,
  milestones: Milestone[]
): Promise<string | null> {
  const countdowns = await getMilestonesForDailyBriefing(userId, milestones);

  if (countdowns.length === 0) {
    return null;
  }

  const sections: string[] = ["[MILESTONE COUNTDOWN - Jordan's Life Planning]"];

  // Group by urgency
  const imminent = countdowns.filter((c) => c.isImminent);
  const urgent = countdowns.filter((c) => c.isUrgent && !c.isImminent);
  const upcoming = countdowns.filter((c) => !c.isUrgent);

  if (imminent.length > 0) {
    sections.push('\n🚨 **Imminent (1-3 days):**');
    for (const c of imminent) {
      sections.push(`• ${c.message}`);
    }
  }

  if (urgent.length > 0) {
    sections.push('\n⏰ **This Week:**');
    for (const c of urgent) {
      sections.push(`• ${c.message}`);
    }
  }

  if (upcoming.length > 0) {
    sections.push('\n📅 **Coming Up:**');
    for (const c of upcoming.slice(0, 3)) {
      sections.push(`• ${c.message}`);
    }
  }

  return sections.join('\n');
}

/**
 * Check if milestone conflicts with calendar
 */
export async function checkMilestoneConflicts(
  userId: string,
  milestone: Milestone
): Promise<{
  hasConflict: boolean;
  conflictingEvents: CalendarEvent[];
  suggestion: string | null;
}> {
  try {
    const events = await getEventsForDay(userId, milestone.date);

    // Filter to significant conflicts (not all-day, longer than 30 min)
    const conflicts = events.filter((e) => {
      if (e.isAllDay) return false;
      const duration = (e.endTime.getTime() - e.startTime.getTime()) / 60000;
      return duration > 30;
    });

    if (conflicts.length === 0) {
      return { hasConflict: false, conflictingEvents: [], suggestion: null };
    }

    const totalConflictMinutes = conflicts.reduce((sum, e) => {
      return sum + (e.endTime.getTime() - e.startTime.getTime()) / 60000;
    }, 0);

    let suggestion: string | null = null;
    if (totalConflictMinutes > 180) {
      suggestion = `${milestone.name} day has ${Math.round(totalConflictMinutes / 60)}h of meetings. Consider clearing some time.`;
    } else if (conflicts.length > 2) {
      suggestion = `${conflicts.length} meetings on ${milestone.name} day. You might want to reschedule some.`;
    }

    return {
      hasConflict: true,
      conflictingEvents: conflicts,
      suggestion,
    };
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check milestone conflicts');
    return { hasConflict: false, conflictingEvents: [], suggestion: null };
  }
}

/**
 * Generate celebration suggestions for completed milestones
 */
export function generateMilestoneCelebration(milestone: Milestone): {
  message: string;
  celebrationSuggestion: string;
} {
  const category = milestone.category || 'personal';

  const messages: Record<string, string[]> = {
    personal: [
      'You did it! This is a moment worth celebrating.',
      'Another milestone achieved. How does it feel?',
    ],
    career: [
      'Career milestone reached! This took real effort.',
      'Professional growth in action. Well done.',
    ],
    health: [
      'Health milestone achieved! Your future self thanks you.',
      'Taking care of yourself pays off. Celebrate this.',
    ],
    relationship: [
      'Relationship milestone! These moments matter.',
      'Investing in relationships is always worth it.',
    ],
    financial: [
      'Financial milestone reached! Smart moves.',
      'Financial progress is worth celebrating.',
    ],
    other: [
      'Milestone achieved! Take a moment to appreciate this.',
      "Another goal reached. What's next?",
    ],
  };

  const celebrations: Record<string, string[]> = {
    personal: ['Treat yourself to something nice', 'Share this with someone you trust'],
    career: ['Update your accomplishments list', 'Acknowledge yourself publicly'],
    health: ['Enjoy a rest day guilt-free', 'Reward yourself with something healthy'],
    relationship: ['Plan something special together', 'Express gratitude to those involved'],
    financial: ["Review how far you've come", 'Set your next target'],
    other: ['Document this achievement', 'Celebrate in a way that feels right'],
  };

  const messageOptions = messages[category] || messages.other;
  const celebrationOptions = celebrations[category] || celebrations.other;

  return {
    message: messageOptions[Math.floor(Math.random() * messageOptions.length)],
    celebrationSuggestion:
      celebrationOptions[Math.floor(Math.random() * celebrationOptions.length)],
  };
}

// ============================================================================
// CONVENIENCE FUNCTION: Build Milestone Calendar Context
// ============================================================================

/**
 * Convenience function that fetches user milestones and generates calendar context.
 * This is the main entry point for context builders that need milestone-calendar integration.
 */
export async function buildMilestoneCalendarContext(userId: string): Promise<string | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const { getUserMilestones } =
      await import('../../tools/domains/life-planning/life-firsts-tracker.js');
    const userMilestones = await getUserMilestones(userId);

    if (!userMilestones || userMilestones.length === 0) {
      return null;
    }

    // Convert to Milestone format expected by our functions
    const now = new Date();
    const milestones: Milestone[] = userMilestones
      .filter((m) => m.targetDate && m.status !== 'completed')
      .map((m) => ({
        id: m.id,
        name: m.name,
        date: new Date(m.targetDate!),
        description: m.description,
        category: mapCategory(m.category),
        importance: 'medium' as const,
        requiresPrep: false,
        userId,
        createdAt: now,
        updatedAt: now,
      }));

    if (milestones.length === 0) {
      return null;
    }

    // Get countdowns for upcoming milestones
    return await injectMilestoneCountdownToDaily(userId, milestones);
  } catch (error) {
    log.warn({ error: String(error), userId }, 'Failed to build milestone calendar context');
    return null;
  }
}

/**
 * Map life-firsts-tracker categories to milestone-calendar-sync categories
 */
function mapCategory(
  category: string | undefined
): 'personal' | 'career' | 'health' | 'relationship' | 'financial' | 'other' {
  if (!category) return 'personal';
  const normalizedCategory = category.toLowerCase();

  if (['career', 'work', 'professional'].includes(normalizedCategory)) return 'career';
  if (['health', 'wellness', 'fitness'].includes(normalizedCategory)) return 'health';
  if (['relationship', 'family', 'social'].includes(normalizedCategory)) return 'relationship';
  if (['financial', 'money', 'budget'].includes(normalizedCategory)) return 'financial';
  if (['personal', 'self', 'growth'].includes(normalizedCategory)) return 'personal';

  return 'other';
}

// ============================================================================
// EXPORTS
// ============================================================================

export const milestoneCalendarSync = {
  syncToCalendar: syncMilestoneToCalendar,
  createCountdown: createMilestoneCountdown,
  getForBriefing: getMilestonesForDailyBriefing,
  injectToDaily: injectMilestoneCountdownToDaily,
  checkConflicts: checkMilestoneConflicts,
  generateCelebration: generateMilestoneCelebration,
  buildContext: buildMilestoneCalendarContext,
};

export default milestoneCalendarSync;
