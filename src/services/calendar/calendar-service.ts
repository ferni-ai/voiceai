/**
 * Calendar Service
 *
 * High-level calendar operations for Alex (Communication Specialist).
 *
 * HYBRID APPROACH:
 * - Uses Google Calendar when connected (OAuth)
 * - Falls back to local Firestore storage when not
 * - Seamless experience either way
 *
 * Features:
 * - Get today's/week's events
 * - Create, update, delete events
 * - Find free time slots
 * - Check availability
 * - Smart scheduling suggestions
 *
 * @see ../google-calendar-oauth.ts for Google Calendar OAuth
 * @see ./local-calendar-store.ts for local Firestore fallback
 */

import { getLogger } from '../../utils/safe-logger.js';
import {
  getValidAccessToken,
  getEvents as getGoogleEvents,
  createEvent as createGoogleEvent,
  updateEvent as updateGoogleEvent,
  deleteEvent as deleteGoogleEvent,
  getFreeBusy,
  isCalendarConfigured,
  type CalendarEvent as GoogleCalendarEvent,
} from '../identity/google-calendar-oauth.js';
import {
  getEventsForDay as getUnifiedEventsForDay,
  getEvents as getUnifiedEvents,
  createEvent as createUnifiedEvent,
  updateEvent as updateUnifiedEvent,
  deleteEvent as deleteUnifiedEvent,
} from './unified-calendar-store.js';
import type {
  CalendarEvent as UnifiedCalendarEvent,
  CreateEventInput as UnifiedCreateEventInput,
  UpdateEventInput as UnifiedUpdateEventInput,
} from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  attendees: string[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  calendarId: string;
}

export interface TimeSlot {
  start: Date;
  end: Date;
  durationMinutes: number;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  startTime: Date;
  endTime?: Date;
  durationMinutes?: number;
  attendees?: string[];
  reminders?: Array<{ method: 'email' | 'popup'; minutes: number }>;
}

export interface DayOverview {
  date: Date;
  events: CalendarEvent[];
  totalMeetings: number;
  totalMeetingMinutes: number;
  freeTimeMinutes: number;
  firstEvent?: CalendarEvent;
  lastEvent?: CalendarEvent;
  isOverloaded: boolean;
  hasBackToBack: boolean;
}

export interface WeekOverview {
  startDate: Date;
  endDate: Date;
  days: DayOverview[];
  totalMeetings: number;
  busiestDay: { day: string; meetings: number } | null;
  lightestDay: { day: string; meetings: number } | null;
  backToBackDays: string[];
  averageMeetingsPerDay: number;
}

// ============================================================================
// ADAPTER FUNCTIONS (unified store <-> calendar-service types)
// ============================================================================

/**
 * Convert unified store event to calendar-service event type
 */
function unifiedToCalendarEvent(unified: UnifiedCalendarEvent, calendarId: string = 'ferni'): CalendarEvent {
  return {
    id: unified.id,
    title: unified.title,
    description: unified.description,
    location: unified.location,
    startTime: unified.startTime,
    endTime: unified.endTime,
    isAllDay: unified.isAllDay,
    attendees: unified.attendees,
    status: unified.status,
    calendarId: unified.externalCalendarId || calendarId,
  };
}

/**
 * Convert calendar-service CreateEventInput to unified store format
 */
function toUnifiedCreateInput(input: CreateEventInput): UnifiedCreateEventInput {
  const endTime = input.endTime ||
    (input.durationMinutes
      ? new Date(input.startTime.getTime() + input.durationMinutes * 60000)
      : new Date(input.startTime.getTime() + 60 * 60000));

  return {
    title: input.title,
    description: input.description,
    location: input.location,
    startTime: input.startTime,
    endTime,
    durationMinutes: input.durationMinutes,
    attendees: input.attendees,
    reminders: input.reminders?.map((r) => ({
      method: r.method,
      minutesBefore: r.minutes,
    })),
  };
}

/**
 * Convert partial update to unified update format
 */
function toUnifiedUpdateInput(updates: Partial<CreateEventInput>): UnifiedUpdateEventInput {
  const result: UnifiedUpdateEventInput = {};
  if (updates.title !== undefined) result.title = updates.title;
  if (updates.description !== undefined) result.description = updates.description;
  if (updates.location !== undefined) result.location = updates.location;
  if (updates.startTime !== undefined) result.startTime = updates.startTime;
  if (updates.endTime !== undefined) result.endTime = updates.endTime;
  if (updates.attendees !== undefined) result.attendees = updates.attendees;
  if (updates.reminders !== undefined) {
    result.reminders = updates.reminders.map((r) => ({
      method: r.method,
      minutesBefore: r.minutes,
    }));
  }
  return result;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEFAULT_CALENDAR_ID = 'primary';
const WORK_DAY_START_HOUR = 9;
const WORK_DAY_END_HOUR = 18;
const OVERLOAD_THRESHOLD_MINUTES = 360; // 6 hours of meetings = overloaded
const BACK_TO_BACK_GAP_MINUTES = 15; // Less than 15 min gap = back to back

// ============================================================================
// CONVERSION HELPERS
// ============================================================================

function googleEventToCalendarEvent(event: GoogleCalendarEvent, calendarId: string): CalendarEvent {
  const startDateTime = event.start.dateTime || event.start.date;
  const endDateTime = event.end.dateTime || event.end.date;

  return {
    id: event.id || '',
    title: event.summary || '(No title)',
    description: event.description,
    location: event.location,
    startTime: new Date(startDateTime || Date.now()),
    endTime: new Date(endDateTime || Date.now()),
    isAllDay: !event.start.dateTime,
    attendees: (event.attendees || []).map((a) => a.email),
    status: event.status || 'confirmed',
    calendarId,
  };
}

function calendarEventToGoogleEvent(event: CreateEventInput): GoogleCalendarEvent {
  const endTime =
    event.endTime ||
    new Date(event.startTime.getTime() + (event.durationMinutes || 60) * 60 * 1000);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    summary: event.title,
    description: event.description,
    location: event.location,
    start: {
      dateTime: event.startTime.toISOString(),
      timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone,
    },
    attendees: event.attendees?.map((email) => ({ email })),
    reminders: event.reminders
      ? { useDefault: false, overrides: event.reminders }
      : { useDefault: true },
  };
}

// ============================================================================
// CALENDAR MODE DETECTION
// ============================================================================

export type CalendarMode = 'google' | 'local' | 'none';

/**
 * Determine which calendar mode to use for a user
 *
 * Priority:
 * 1. Google Calendar if connected
 * 2. Local calendar if has events
 * 3. Local calendar (default - always available)
 */
export async function getCalendarMode(userId: string): Promise<CalendarMode> {
  // Check Google Calendar first
  const googleConnected = await isCalendarConfigured(userId);
  if (googleConnected) {
    return 'google';
  }

  // Always fall back to local - it's always available
  return 'local';
}

// ============================================================================
// CORE OPERATIONS
// ============================================================================

/**
 * Check if calendar is available for a user
 *
 * NOTE: With local fallback, calendar is ALWAYS available.
 * This function now returns true if either Google or local is usable.
 */
export async function isConnected(userId: string): Promise<boolean> {
  // Google connected = definitely connected
  const googleConnected = await isCalendarConfigured(userId);
  if (googleConnected) return true;

  // Local calendar is always available
  return true;
}

/**
 * Check if Google Calendar specifically is connected
 */
export async function isGoogleCalendarConnected(userId: string): Promise<boolean> {
  return isCalendarConfigured(userId);
}

/**
 * Get events for a specific day
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export async function getEventsForDay(
  userId: string,
  date: Date = new Date(),
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<CalendarEvent[]> {
  const mode = await getCalendarMode(userId);

  if (mode === 'google') {
    // Use Google Calendar
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.debug({ userId }, 'Google token expired, falling back to unified store');
      const unifiedEvents = await getUnifiedEventsForDay(userId, date);
      return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
    }

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const events = await getGoogleEvents(accessToken, calendarId, startOfDay, endOfDay);
      return events.map((e) => googleEventToCalendarEvent(e, calendarId));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Google Calendar failed, falling back to unified store');
      const unifiedEvents = await getUnifiedEventsForDay(userId, date);
      return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
    }
  }

  // Use unified Ferni calendar
  const unifiedEvents = await getUnifiedEventsForDay(userId, date);
  return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
}

/**
 * Get events for the current week
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export async function getEventsForWeek(
  userId: string,
  startDate?: Date,
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<CalendarEvent[]> {
  const mode = await getCalendarMode(userId);
  const weekStart = startDate || getStartOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  if (mode === 'google') {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.debug({ userId }, 'Google token expired, falling back to unified store');
      const unifiedEvents = await getUnifiedEvents(userId, weekStart, weekEnd);
      return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
    }

    try {
      const events = await getGoogleEvents(accessToken, calendarId, weekStart, weekEnd, 100);
      return events.map((e) => googleEventToCalendarEvent(e, calendarId));
    } catch (error) {
      log.error({ error: String(error), userId }, 'Google Calendar failed, falling back to unified store');
      const unifiedEvents = await getUnifiedEvents(userId, weekStart, weekEnd);
      return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
    }
  }

  // Use unified Ferni calendar
  const unifiedEvents = await getUnifiedEvents(userId, weekStart, weekEnd);
  return unifiedEvents.map((e) => unifiedToCalendarEvent(e, calendarId));
}

/**
 * Create a new calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export async function createEvent(
  userId: string,
  event: CreateEventInput,
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<CalendarEvent | null> {
  const mode = await getCalendarMode(userId);

  if (mode === 'google') {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'Google token expired, creating in unified store');
      const created = await createUnifiedEvent(userId, toUnifiedCreateInput(event));
      // Use 'local' when falling back from Google to unified store
      return unifiedToCalendarEvent(created, 'local');
    }

    try {
      const googleEvent = calendarEventToGoogleEvent(event);
      const created = await createGoogleEvent(accessToken, calendarId, googleEvent);
      log.info({ userId, eventTitle: event.title }, 'Google Calendar event created');
      return googleEventToCalendarEvent(created, calendarId);
    } catch (error) {
      log.error({ error: String(error), userId }, 'Google Calendar failed, creating in unified store');
      const created = await createUnifiedEvent(userId, toUnifiedCreateInput(event));
      // Use 'local' when falling back from Google to unified store
      return unifiedToCalendarEvent(created, 'local');
    }
  }

  // Use unified Ferni calendar
  const created = await createUnifiedEvent(userId, toUnifiedCreateInput(event));
  log.info({ userId, eventTitle: event.title }, 'Unified calendar event created');
  // Use 'local' for unified calendar events (not connected to external provider)
  return unifiedToCalendarEvent(created, 'local');
}

/**
 * Update an existing calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export async function updateEvent(
  userId: string,
  eventId: string,
  updates: Partial<CreateEventInput>,
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<CalendarEvent | null> {
  // Check if this is a local/unified event (starts with evt_ or local_)
  if (eventId.startsWith('local_') || eventId.startsWith('evt_')) {
    const updated = await updateUnifiedEvent(userId, eventId, toUnifiedUpdateInput(updates));
    if (updated) {
      log.info({ userId, eventId }, 'Unified calendar event updated');
      return unifiedToCalendarEvent(updated, calendarId);
    }
    return null;
  }

  // Try Google Calendar
  const mode = await getCalendarMode(userId);
  if (mode === 'google') {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'Cannot update Google event - no token');
      return null;
    }

    try {
      const googleUpdates: Partial<GoogleCalendarEvent> = {};

      if (updates.title) googleUpdates.summary = updates.title;
      if (updates.description) googleUpdates.description = updates.description;
      if (updates.location) googleUpdates.location = updates.location;
      if (updates.startTime) {
        googleUpdates.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      if (updates.endTime) {
        googleUpdates.end = {
          dateTime: updates.endTime.toISOString(),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }

      const updated = await updateGoogleEvent(accessToken, calendarId, eventId, googleUpdates);
      log.info({ userId, eventId }, 'Google Calendar event updated');
      return googleEventToCalendarEvent(updated, calendarId);
    } catch (error) {
      log.error({ error: String(error), userId, eventId }, 'Failed to update Google event');
      return null;
    }
  }

  return null;
}

/**
 * Delete a calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export async function deleteEvent(
  userId: string,
  eventId: string,
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<boolean> {
  // Check if this is a local/unified event (starts with evt_ or local_)
  if (eventId.startsWith('local_') || eventId.startsWith('evt_')) {
    const deleted = await deleteUnifiedEvent(userId, eventId);
    if (deleted) {
      log.info({ userId, eventId }, 'Unified calendar event deleted');
    }
    return deleted;
  }

  // Try Google Calendar
  const mode = await getCalendarMode(userId);
  if (mode === 'google') {
    const accessToken = await getValidAccessToken(userId);
    if (!accessToken) {
      log.warn({ userId }, 'Cannot delete Google event - no token');
      return false;
    }

    try {
      await deleteGoogleEvent(accessToken, calendarId, eventId);
      log.info({ userId, eventId }, 'Google Calendar event deleted');
      return true;
    } catch (error) {
      log.error({ error: String(error), userId, eventId }, 'Failed to delete Google event');
      return false;
    }
  }

  return false;
}

// ============================================================================
// AVAILABILITY & FREE TIME
// ============================================================================

/**
 * Find free time slots on a given day
 */
export async function findFreeTimeSlots(
  userId: string,
  date: Date,
  options: {
    minDurationMinutes?: number;
    workDayOnly?: boolean;
    calendarId?: string;
  } = {}
): Promise<TimeSlot[]> {
  const { minDurationMinutes = 30, workDayOnly = true, calendarId = DEFAULT_CALENDAR_ID } = options;

  const events = await getEventsForDay(userId, date, calendarId);
  if (events.length === 0) {
    // Entire day is free
    const dayStart = new Date(date);
    dayStart.setHours(workDayOnly ? WORK_DAY_START_HOUR : 0, 0, 0, 0);
    const dayEnd = new Date(date);
    dayEnd.setHours(workDayOnly ? WORK_DAY_END_HOUR : 23, 59, 59, 999);

    return [
      {
        start: dayStart,
        end: dayEnd,
        durationMinutes: Math.floor((dayEnd.getTime() - dayStart.getTime()) / 60000),
      },
    ];
  }

  // Sort events by start time
  const sortedEvents = events
    .filter((e) => !e.isAllDay)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const freeSlots: TimeSlot[] = [];

  // Define work day boundaries
  const dayStart = new Date(date);
  dayStart.setHours(workDayOnly ? WORK_DAY_START_HOUR : 0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(workDayOnly ? WORK_DAY_END_HOUR : 23, 59, 59, 999);

  let currentTime = dayStart;

  for (const event of sortedEvents) {
    // Skip if event is outside work hours
    if (workDayOnly) {
      if (event.endTime <= dayStart || event.startTime >= dayEnd) continue;
    }

    // Free slot before this event
    if (event.startTime > currentTime) {
      const slotEnd = event.startTime < dayEnd ? event.startTime : dayEnd;
      const durationMinutes = Math.floor((slotEnd.getTime() - currentTime.getTime()) / 60000);

      if (durationMinutes >= minDurationMinutes) {
        freeSlots.push({
          start: new Date(currentTime),
          end: slotEnd,
          durationMinutes,
        });
      }
    }

    // Move current time past this event
    if (event.endTime > currentTime) {
      currentTime = event.endTime;
    }
  }

  // Free slot after last event
  if (currentTime < dayEnd) {
    const durationMinutes = Math.floor((dayEnd.getTime() - currentTime.getTime()) / 60000);
    if (durationMinutes >= minDurationMinutes) {
      freeSlots.push({
        start: new Date(currentTime),
        end: dayEnd,
        durationMinutes,
      });
    }
  }

  return freeSlots;
}

/**
 * Check if a specific time slot is available
 */
export async function isTimeSlotAvailable(
  userId: string,
  startTime: Date,
  endTime: Date,
  calendarId: string = DEFAULT_CALENDAR_ID
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) {
    return false;
  }

  try {
    const busyTimes = await getFreeBusy(accessToken, [calendarId], startTime, endTime);
    const calendarBusy = busyTimes[calendarId] || [];
    return calendarBusy.length === 0;
  } catch (error) {
    log.error({ error: String(error), userId }, 'Failed to check availability');
    return false;
  }
}

/**
 * Find the next available slot of given duration
 */
export async function findNextAvailableSlot(
  userId: string,
  options: {
    durationMinutes: number;
    startFrom?: Date;
    withinDays?: number;
    preferredHours?: { start: number; end: number };
  }
): Promise<TimeSlot | null> {
  const {
    durationMinutes,
    startFrom = new Date(),
    withinDays = 7,
    preferredHours = { start: WORK_DAY_START_HOUR, end: WORK_DAY_END_HOUR },
  } = options;

  for (let dayOffset = 0; dayOffset < withinDays; dayOffset++) {
    const checkDate = new Date(startFrom);
    checkDate.setDate(checkDate.getDate() + dayOffset);

    // Skip weekends
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const freeSlots = await findFreeTimeSlots(userId, checkDate, {
      minDurationMinutes: durationMinutes,
      workDayOnly: true,
    });

    for (const slot of freeSlots) {
      // Check if slot is within preferred hours
      const slotStartHour = slot.start.getHours();
      const slotEndHour = slot.end.getHours();

      if (slotStartHour >= preferredHours.start && slotEndHour <= preferredHours.end) {
        return slot;
      }
    }
  }

  return null;
}

// ============================================================================
// OVERVIEW & ANALYSIS
// ============================================================================

/**
 * Get an overview of a specific day
 */
export async function getDayOverview(
  userId: string,
  date: Date = new Date()
): Promise<DayOverview> {
  const events = await getEventsForDay(userId, date);
  const nonAllDayEvents = events.filter((e) => !e.isAllDay);

  let totalMeetingMinutes = 0;
  let hasBackToBack = false;
  let prevEndTime: Date | null = null;

  for (const event of nonAllDayEvents) {
    const duration = (event.endTime.getTime() - event.startTime.getTime()) / 60000;
    totalMeetingMinutes += duration;

    if (prevEndTime) {
      const gap = (event.startTime.getTime() - prevEndTime.getTime()) / 60000;
      if (gap < BACK_TO_BACK_GAP_MINUTES) {
        hasBackToBack = true;
      }
    }
    prevEndTime = event.endTime;
  }

  // Calculate free time (work day hours minus meetings)
  const workDayMinutes = (WORK_DAY_END_HOUR - WORK_DAY_START_HOUR) * 60;
  const freeTimeMinutes = Math.max(0, workDayMinutes - totalMeetingMinutes);

  return {
    date,
    events,
    totalMeetings: nonAllDayEvents.length,
    totalMeetingMinutes,
    freeTimeMinutes,
    firstEvent: nonAllDayEvents[0],
    lastEvent: nonAllDayEvents[nonAllDayEvents.length - 1],
    isOverloaded: totalMeetingMinutes >= OVERLOAD_THRESHOLD_MINUTES,
    hasBackToBack,
  };
}

/**
 * Get an overview of the week
 */
export async function getWeekOverview(userId: string, startDate?: Date): Promise<WeekOverview> {
  const weekStart = startDate || getStartOfWeek(new Date());
  const days: DayOverview[] = [];
  const backToBackDays: string[] = [];

  let totalMeetings = 0;
  let busiestDay: { day: string; meetings: number } | null = null;
  let lightestDay: { day: string; meetings: number } | null = null;

  for (let i = 0; i < 7; i++) {
    const dayDate = new Date(weekStart);
    dayDate.setDate(dayDate.getDate() + i);

    const overview = await getDayOverview(userId, dayDate);
    days.push(overview);

    const dayName = dayDate.toLocaleDateString('en-US', { weekday: 'long' });

    // Skip weekends for busyness analysis
    const dayOfWeek = dayDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      totalMeetings += overview.totalMeetings;

      if (!busiestDay || overview.totalMeetings > busiestDay.meetings) {
        busiestDay = { day: dayName, meetings: overview.totalMeetings };
      }
      if (!lightestDay || overview.totalMeetings < lightestDay.meetings) {
        lightestDay = { day: dayName, meetings: overview.totalMeetings };
      }
      if (overview.hasBackToBack) {
        backToBackDays.push(dayName);
      }
    }
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  return {
    startDate: weekStart,
    endDate: weekEnd,
    days,
    totalMeetings,
    busiestDay,
    lightestDay,
    backToBackDays,
    averageMeetingsPerDay: totalMeetings / 5, // Exclude weekends
  };
}

// ============================================================================
// UTILITIES
// ============================================================================

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Format event for speech output
 * Accepts both old CalendarEvent and new unified CalendarEvent
 */
export function formatEventForSpeech(
  event: Pick<CalendarEvent, 'title' | 'startTime' | 'endTime' | 'location' | 'attendees'>
): string {
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const startTime = event.startTime.toLocaleTimeString('en-US', timeOptions);
  const endTime = event.endTime.toLocaleTimeString('en-US', timeOptions);

  let result = `${event.title} from ${startTime} to ${endTime}`;

  if (event.location) {
    result += ` at ${event.location}`;
  }

  if (event.attendees.length > 0) {
    const attendeeCount = event.attendees.length;
    result += ` with ${attendeeCount} ${attendeeCount === 1 ? 'attendee' : 'attendees'}`;
  }

  return result;
}

/**
 * Format day overview for speech
 * Accepts both old DayOverview and new unified DayOverview
 */
export function formatDayOverviewForSpeech(overview: {
  date: Date;
  totalMeetings: number;
  firstEvent?: CalendarEvent | { startTime: Date; title: string };
  isOverloaded?: boolean;
  freeTimeMinutes?: number;
  hasBackToBack?: boolean;
}): string {
  const dayName = overview.date.toLocaleDateString('en-US', { weekday: 'long' });

  if (overview.totalMeetings === 0) {
    return `${dayName} is clear. No meetings scheduled.`;
  }

  let result = `${dayName}: ${overview.totalMeetings} meeting${overview.totalMeetings !== 1 ? 's' : ''}`;

  if (overview.firstEvent) {
    const firstTime = overview.firstEvent.startTime.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    result += `. First at ${firstTime}`;
  }

  if (overview.isOverloaded) {
    result += '. Heavy day.';
  }

  if (overview.hasBackToBack) {
    result += ' Some back-to-back.';
  }

  return result;
}

export default {
  // Connection status
  isConnected,
  isGoogleCalendarConnected,
  getCalendarMode,
  // CRUD operations
  getEventsForDay,
  getEventsForWeek,
  createEvent,
  updateEvent,
  deleteEvent,
  // Availability
  findFreeTimeSlots,
  isTimeSlotAvailable,
  findNextAvailableSlot,
  // Overviews
  getDayOverview,
  getWeekOverview,
  // Formatting
  formatEventForSpeech,
  formatDayOverviewForSpeech,
};
