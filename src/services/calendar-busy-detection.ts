/**
 * Calendar Busy Detection Service
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates with Google Calendar to detect when users are busy,
 * enabling smarter outreach timing. A good friend doesn't call
 * when you're in a meeting.
 *
 * Features:
 * - Free/busy time detection
 * - Upcoming event awareness
 * - Auto-detection of "never during" times
 * - Caching to minimize API calls
 */

import { createLogger } from '../utils/safe-logger.js';
import {
  getUserTokens,
  getFreeBusy,
  getEvents,
  refreshAccessToken,
  isCalendarConfigured,
  type CalendarEvent,
} from './google-calendar-oauth.js';
import {
  addBusyPeriod,
  addNeverDuringRule,
  type BusyPeriod,
  type NeverDuringRule,
} from './outreach/timing-intelligence.js';

const log = createLogger({ module: 'CalendarBusyDetection' });

// ============================================================================
// TYPES
// ============================================================================

export interface BusySlot {
  start: Date;
  end: Date;
  eventTitle?: string;
  isAllDay: boolean;
}

export interface CalendarBusyProfile {
  userId: string;

  /** Current busy status */
  currentlyBusy: boolean;
  currentEvent?: string;
  busyUntil?: Date;

  /** Today's remaining busy slots */
  todayBusySlots: BusySlot[];

  /** Detected patterns (e.g., recurring meetings) */
  recurringBusyTimes: NeverDuringRule[];

  /** Next window for outreach */
  nextFreeWindow?: {
    start: Date;
    end: Date;
    duration: number; // minutes
  };

  /** Last sync time */
  lastSynced: Date;
}

// ============================================================================
// CACHE
// ============================================================================

const busyProfileCache = new Map<string, CalendarBusyProfile>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if the user is currently busy
 */
export async function isUserBusy(userId: string): Promise<{
  isBusy: boolean;
  reason?: string;
  busyUntil?: Date;
}> {
  try {
    const profile = await getCalendarBusyProfile(userId);

    if (profile.currentlyBusy) {
      return {
        isBusy: true,
        reason: profile.currentEvent || 'Calendar event',
        busyUntil: profile.busyUntil,
      };
    }

    return { isBusy: false };
  } catch (error) {
    log.debug({ error, userId }, 'Could not check calendar busy status');
    return { isBusy: false }; // Fail open - don't block outreach on calendar errors
  }
}

/**
 * Get the next good time for outreach
 */
export async function getNextOutreachWindow(
  userId: string,
  minDurationMinutes = 15
): Promise<{ start: Date; end: Date } | null> {
  try {
    const profile = await getCalendarBusyProfile(userId);

    if (profile.nextFreeWindow && profile.nextFreeWindow.duration >= minDurationMinutes) {
      return {
        start: profile.nextFreeWindow.start,
        end: profile.nextFreeWindow.end,
      };
    }

    return null;
  } catch (error) {
    log.debug({ error, userId }, 'Could not get next outreach window');
    return null;
  }
}

/**
 * Get full calendar busy profile
 */
export async function getCalendarBusyProfile(userId: string): Promise<CalendarBusyProfile> {
  // Check cache first
  const cached = busyProfileCache.get(userId);
  if (cached && Date.now() - cached.lastSynced.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  // Check if calendar is configured
  if (!(await isCalendarConfigured(userId))) {
    return createEmptyProfile(userId);
  }

  // Get user's tokens
  const tokens = await getUserTokens(userId);
  if (!tokens) {
    return createEmptyProfile(userId);
  }

  // Refresh token if needed
  let accessToken = tokens.access_token;
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    if (!tokens.refresh_token) {
      return createEmptyProfile(userId);
    }
    const refreshed = await refreshAccessToken(tokens.refresh_token);
    if (!refreshed) {
      return createEmptyProfile(userId);
    }
    accessToken = refreshed.access_token;
  }

  // Get busy times for today and tomorrow
  const now = new Date();
  const endOfTomorrow = new Date(now);
  endOfTomorrow.setDate(endOfTomorrow.getDate() + 2);
  endOfTomorrow.setHours(0, 0, 0, 0);

  try {
    // Get free/busy info
    const freeBusyData = await getFreeBusy(accessToken, ['primary'], now, endOfTomorrow);
    const busySlots: BusySlot[] = [];

    for (const [_calId, slots] of Object.entries(freeBusyData)) {
      for (const slot of slots) {
        busySlots.push({
          start: new Date(slot.start),
          end: new Date(slot.end),
          isAllDay: false,
        });
      }
    }

    // Get actual events for more detail
    const events = await getEvents(accessToken, 'primary', now, endOfTomorrow);

    // Enrich busy slots with event names
    for (const slot of busySlots) {
      const matchingEvent = events.find((e) => {
        const eventStart = e.start.dateTime ? new Date(e.start.dateTime) : null;
        if (!eventStart) return false;
        return Math.abs(eventStart.getTime() - slot.start.getTime()) < 60000;
      });
      if (matchingEvent) {
        slot.eventTitle = matchingEvent.summary;
      }
    }

    // Detect current busy status
    const currentSlot = busySlots.find((s) => s.start <= now && s.end > now);
    const currentlyBusy = !!currentSlot;

    // Find today's remaining busy slots
    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);
    const todayBusySlots = busySlots.filter((s) => s.start <= todayEnd);

    // Find next free window
    const nextFreeWindow = findNextFreeWindow(now, busySlots, 15);

    // Detect recurring patterns (e.g., daily standup)
    const recurringBusyTimes = detectRecurringPatterns(events);

    const profile: CalendarBusyProfile = {
      userId,
      currentlyBusy,
      currentEvent: currentSlot?.eventTitle,
      busyUntil: currentSlot?.end,
      todayBusySlots,
      recurringBusyTimes,
      nextFreeWindow,
      lastSynced: new Date(),
    };

    busyProfileCache.set(userId, profile);

    log.debug(
      {
        userId,
        currentlyBusy,
        busySlotsToday: todayBusySlots.length,
        nextFreeIn: nextFreeWindow
          ? `${Math.round((nextFreeWindow.start.getTime() - now.getTime()) / 60000)}min`
          : 'none',
      },
      '📅 Calendar busy profile updated'
    );

    return profile;
  } catch (error) {
    log.warn({ error, userId }, 'Failed to fetch calendar busy status');
    return createEmptyProfile(userId);
  }
}

/**
 * Sync user's recurring calendar patterns to outreach timing
 */
export async function syncCalendarToOutreach(userId: string): Promise<{
  busyPeriodsAdded: number;
  rulesAdded: number;
}> {
  let busyPeriodsAdded = 0;
  let rulesAdded = 0;

  try {
    const profile = await getCalendarBusyProfile(userId);

    // Add today's specific busy slots as temporary busy periods
    for (const slot of profile.todayBusySlots) {
      const period: BusyPeriod = {
        id: `cal_${slot.start.getTime()}`,
        description: slot.eventTitle || 'Calendar event',
        startDate: slot.start,
        endDate: slot.end,
        urgentOnly: true, // Only urgent messages during meetings
      };
      addBusyPeriod(userId, period);
      busyPeriodsAdded++;
    }

    // Add recurring patterns as "never during" rules
    for (const rule of profile.recurringBusyTimes) {
      addNeverDuringRule(userId, rule);
      rulesAdded++;
    }

    log.info({ userId, busyPeriodsAdded, rulesAdded }, '📅 Calendar synced to outreach timing');

    return { busyPeriodsAdded, rulesAdded };
  } catch (error) {
    log.error({ error, userId }, 'Failed to sync calendar to outreach');
    return { busyPeriodsAdded: 0, rulesAdded: 0 };
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createEmptyProfile(userId: string): CalendarBusyProfile {
  return {
    userId,
    currentlyBusy: false,
    todayBusySlots: [],
    recurringBusyTimes: [],
    lastSynced: new Date(),
  };
}

function findNextFreeWindow(
  from: Date,
  busySlots: BusySlot[],
  minDurationMinutes: number
): { start: Date; end: Date; duration: number } | undefined {
  // Sort busy slots by start time
  const sorted = [...busySlots].sort((a, b) => a.start.getTime() - b.start.getTime());

  let searchStart = new Date(from);

  // Look for gaps between busy slots
  for (const slot of sorted) {
    if (slot.start > searchStart) {
      const gapMinutes = (slot.start.getTime() - searchStart.getTime()) / 60000;
      if (gapMinutes >= minDurationMinutes) {
        return {
          start: searchStart,
          end: slot.start,
          duration: gapMinutes,
        };
      }
    }
    searchStart = new Date(Math.max(searchStart.getTime(), slot.end.getTime()));
  }

  // After all slots, the rest of the day is free
  const endOfDay = new Date(from);
  endOfDay.setHours(22, 0, 0, 0); // Consider 10 PM as practical end of day

  if (searchStart < endOfDay) {
    const remainingMinutes = (endOfDay.getTime() - searchStart.getTime()) / 60000;
    if (remainingMinutes >= minDurationMinutes) {
      return {
        start: searchStart,
        end: endOfDay,
        duration: remainingMinutes,
      };
    }
  }

  return undefined;
}

function detectRecurringPatterns(events: CalendarEvent[]): NeverDuringRule[] {
  const rules: NeverDuringRule[] = [];
  const eventTimes = new Map<string, number[]>(); // time -> day occurrences

  // Group events by their start time
  for (const event of events) {
    if (!event.start.dateTime) continue;

    const start = new Date(event.start.dateTime);
    const timeKey = `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;
    const day = start.getDay();

    if (!eventTimes.has(timeKey)) {
      eventTimes.set(timeKey, []);
    }
    eventTimes.get(timeKey)!.push(day);
  }

  // Find patterns (same time on multiple days)
  for (const [time, days] of eventTimes.entries()) {
    if (days.length >= 2) {
      const uniqueDays = [...new Set(days)];

      // Parse time
      const [hours, minutes] = time.split(':').map(Number);
      const endTime = new Date();
      endTime.setHours(hours + 1, minutes, 0, 0); // Assume 1 hour duration

      rules.push({
        description: `Recurring event at ${time}`,
        startTime: time,
        endTime: `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`,
        days: uniqueDays,
        isRecurring: true,
      });
    }
  }

  return rules;
}

/**
 * Clear cached profile for a user
 */
export function clearBusyProfileCache(userId: string): void {
  busyProfileCache.delete(userId);
}

/**
 * Clear all cached profiles
 */
export function clearAllBusyProfileCaches(): void {
  busyProfileCache.clear();
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  isUserBusy,
  getNextOutreachWindow,
  getCalendarBusyProfile,
  syncCalendarToOutreach,
  clearBusyProfileCache,
  clearAllBusyProfileCaches,
};
