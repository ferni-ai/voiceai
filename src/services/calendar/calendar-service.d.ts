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
    reminders?: Array<{
        method: 'email' | 'popup';
        minutes: number;
    }>;
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
    busiestDay: {
        day: string;
        meetings: number;
    } | null;
    lightestDay: {
        day: string;
        meetings: number;
    } | null;
    backToBackDays: string[];
    averageMeetingsPerDay: number;
}
export type CalendarMode = 'google' | 'local' | 'none';
/**
 * Determine which calendar mode to use for a user
 *
 * Priority:
 * 1. Google Calendar if connected
 * 2. Local calendar if has events
 * 3. Local calendar (default - always available)
 */
export declare function getCalendarMode(userId: string): Promise<CalendarMode>;
/**
 * Check if calendar is available for a user
 *
 * NOTE: With local fallback, calendar is ALWAYS available.
 * This function now returns true if either Google or local is usable.
 */
export declare function isConnected(userId: string): Promise<boolean>;
/**
 * Check if Google Calendar specifically is connected
 */
export declare function isGoogleCalendarConnected(userId: string): Promise<boolean>;
/**
 * Get events for a specific day
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export declare function getEventsForDay(userId: string, date?: Date, calendarId?: string): Promise<CalendarEvent[]>;
/**
 * Get events for the current week
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export declare function getEventsForWeek(userId: string, startDate?: Date, calendarId?: string): Promise<CalendarEvent[]>;
/**
 * Create a new calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export declare function createEvent(userId: string, event: CreateEventInput, calendarId?: string): Promise<CalendarEvent | null>;
/**
 * Update an existing calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export declare function updateEvent(userId: string, eventId: string, updates: Partial<CreateEventInput>, calendarId?: string): Promise<CalendarEvent | null>;
/**
 * Delete a calendar event
 *
 * Uses Google Calendar if connected, otherwise local storage.
 */
export declare function deleteEvent(userId: string, eventId: string, calendarId?: string): Promise<boolean>;
/**
 * Find free time slots on a given day
 */
export declare function findFreeTimeSlots(userId: string, date: Date, options?: {
    minDurationMinutes?: number;
    workDayOnly?: boolean;
    calendarId?: string;
}): Promise<TimeSlot[]>;
/**
 * Check if a specific time slot is available
 */
export declare function isTimeSlotAvailable(userId: string, startTime: Date, endTime: Date, calendarId?: string): Promise<boolean>;
/**
 * Find the next available slot of given duration
 */
export declare function findNextAvailableSlot(userId: string, options: {
    durationMinutes: number;
    startFrom?: Date;
    withinDays?: number;
    preferredHours?: {
        start: number;
        end: number;
    };
}): Promise<TimeSlot | null>;
/**
 * Get an overview of a specific day
 */
export declare function getDayOverview(userId: string, date?: Date): Promise<DayOverview>;
/**
 * Get an overview of the week
 */
export declare function getWeekOverview(userId: string, startDate?: Date): Promise<WeekOverview>;
/**
 * Format event for speech output
 * Accepts both old CalendarEvent and new unified CalendarEvent
 */
export declare function formatEventForSpeech(event: Pick<CalendarEvent, 'title' | 'startTime' | 'endTime' | 'location' | 'attendees'>): string;
/**
 * Format day overview for speech
 * Accepts both old DayOverview and new unified DayOverview
 */
export declare function formatDayOverviewForSpeech(overview: {
    date: Date;
    totalMeetings: number;
    firstEvent?: CalendarEvent | {
        startTime: Date;
        title: string;
    };
    isOverloaded?: boolean;
    freeTimeMinutes?: number;
    hasBackToBack?: boolean;
}): string;
declare const _default: {
    isConnected: typeof isConnected;
    isGoogleCalendarConnected: typeof isGoogleCalendarConnected;
    getCalendarMode: typeof getCalendarMode;
    getEventsForDay: typeof getEventsForDay;
    getEventsForWeek: typeof getEventsForWeek;
    createEvent: typeof createEvent;
    updateEvent: typeof updateEvent;
    deleteEvent: typeof deleteEvent;
    findFreeTimeSlots: typeof findFreeTimeSlots;
    isTimeSlotAvailable: typeof isTimeSlotAvailable;
    findNextAvailableSlot: typeof findNextAvailableSlot;
    getDayOverview: typeof getDayOverview;
    getWeekOverview: typeof getWeekOverview;
    formatEventForSpeech: typeof formatEventForSpeech;
    formatDayOverviewForSpeech: typeof formatDayOverviewForSpeech;
};
export default _default;
//# sourceMappingURL=calendar-service.d.ts.map