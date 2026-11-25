/**
 * Spoken due dates for the task tools ("today", "Friday", "in 3 days"), read on
 * the user's wall clock, and the calendar entry a dated task gets. Moved out of
 * tasks.ts unchanged.
 *
 * @module tools/domains/productivity/task-due-date
 */

import { syncTaskToCalendar } from '../../../services/calendar/calendar-bridge.js';
import { getLogger } from '../../utils/tool-helpers.js';
import { WallClock } from '../../../utils/time-zone.js';

/**
 * Put a dated task on the user's calendar: at `dueTime` ("14:00") on its due day,
 * else 9am, for 30 minutes, on their wall clock. A failure is logged, never thrown.
 */
export async function putDueTaskOnCalendar(task: {
  userId: string;
  id: string;
  title: string;
  dueDate: Date;
  dueTime?: string;
  timeZone?: string;
}): Promise<void> {
  try {
    const scheduledFor = new WallClock(task.dueDate, task.timeZone);
    if (task.dueTime) {
      const [hours, minutes] = task.dueTime.split(':').map(Number);
      scheduledFor.setHours(hours, minutes, 0, 0);
    } else {
      scheduledFor.setHours(9, 0, 0, 0);
    }
    await syncTaskToCalendar(task.userId, task.id, task.title, scheduledFor.toDate(), 30);
  } catch (calendarError) {
    getLogger().warn({ error: calendarError, taskId: task.id }, 'Failed to sync task to calendar');
  }
}

/** A due date in the user's zone ("tomorrow" ends at 23:59 where they are); unknown zone = UTC. */
export function parseNaturalDueDate(
  expression: string,
  zone?: string,
  now = new Date()
): Date | null {
  const lower = expression.toLowerCase().trim();

  if (lower === 'today' || lower === 'tomorrow') {
    const day = new WallClock(now, zone);
    day.setDate(day.getDate() + (lower === 'tomorrow' ? 1 : 0));
    day.setHours(23, 59, 0, 0);
    return day.toDate();
  }

  if (lower === 'this week' || lower === 'end of week') {
    const endOfWeek = new WallClock(now, zone);
    const daysUntilSunday = 7 - endOfWeek.getDay();
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday);
    endOfWeek.setHours(23, 59, 0, 0);
    return endOfWeek.toDate();
  }

  if (lower === 'next week') {
    const nextWeek = new WallClock(now, zone);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toDate();
  }

  // Handle "in X days"
  const inDaysMatch = lower.match(/in\s+(\d+)\s+days?/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1]);
    const target = new WallClock(now, zone);
    target.setDate(target.getDate() + days);
    return target.toDate();
  }

  // Handle day names
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (lower.includes(days[i])) {
      const target = new WallClock(now, zone);
      const currentDay = target.getDay();
      const daysUntil = (i - currentDay + 7) % 7 || 7;
      target.setDate(target.getDate() + daysUntil);
      target.setHours(23, 59, 0, 0);
      return target.toDate();
    }
  }

  // Try parsing as date string
  const parsed = new Date(expression);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}
