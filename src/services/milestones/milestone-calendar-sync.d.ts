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
import { type CalendarEvent } from '../calendar/calendar-service.js';
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
    countdownReminders: Array<{
        date: Date;
        eventId: string;
    }>;
    prepTimeBlocked: boolean;
    prepEventId?: string;
}
export interface MilestoneCountdown {
    milestone: Milestone;
    daysUntil: number;
    isUrgent: boolean;
    isImminent: boolean;
    message: string;
}
/**
 * Sync a milestone to the calendar
 *
 * Creates the main event and optionally prep time.
 */
export declare function syncMilestoneToCalendar(userId: string, milestone: Milestone): Promise<MilestoneCalendarSync>;
/**
 * Create countdown reminders for a milestone
 */
export declare function createMilestoneCountdown(userId: string, milestone: Milestone, reminderDaysBefore?: number[]): Promise<Array<{
    date: Date;
    eventId: string;
}>>;
/**
 * Get milestones that should be mentioned in today's briefing
 */
export declare function getMilestonesForDailyBriefing(userId: string, milestones: Milestone[]): Promise<MilestoneCountdown[]>;
/**
 * Inject milestone countdown into daily context
 */
export declare function injectMilestoneCountdownToDaily(userId: string, milestones: Milestone[]): Promise<string | null>;
/**
 * Check if milestone conflicts with calendar
 */
export declare function checkMilestoneConflicts(userId: string, milestone: Milestone): Promise<{
    hasConflict: boolean;
    conflictingEvents: CalendarEvent[];
    suggestion: string | null;
}>;
/**
 * Generate celebration suggestions for completed milestones
 */
export declare function generateMilestoneCelebration(milestone: Milestone): {
    message: string;
    celebrationSuggestion: string;
};
/**
 * Convenience function that fetches user milestones and generates calendar context.
 * This is the main entry point for context builders that need milestone-calendar integration.
 */
export declare function buildMilestoneCalendarContext(userId: string): Promise<string | null>;
export interface MilestoneTimeBuffer {
    milestoneId: string;
    milestoneName: string;
    targetDate: Date;
    totalBlockedHours: number;
    blockedEvents: Array<{
        eventId: string;
        title: string;
        date: Date;
        durationHours: number;
        purpose: 'prep' | 'focus' | 'review' | 'general';
    }>;
    estimatedHoursNeeded: number;
    coverage: 'adequate' | 'light' | 'heavy' | 'none';
    recommendation: string;
}
export interface CalendarMilestoneLink {
    eventId: string;
    milestoneId: string;
    linkType: 'main' | 'prep' | 'countdown' | 'focus';
    createdAt: Date;
}
/**
 * Detect calendar events that are related to milestones (bidirectional discovery)
 *
 * This scans calendar events and matches them to milestones based on:
 * 1. Direct references (event linked to milestone via calendarEventId)
 * 2. Keyword matching (event title mentions milestone name)
 * 3. Date proximity (events blocked near milestone dates)
 */
export declare function detectMilestoneRelatedEvents(userId: string, milestones: Milestone[], daysAhead?: number): Promise<Map<string, CalendarMilestoneLink[]>>;
/**
 * Calculate time buffers for milestones based on blocked calendar time
 *
 * This is the bidirectional sync: looking at what the user has blocked
 * and calculating if they have enough time for their milestones.
 */
export declare function calculateMilestoneTimeBuffers(userId: string, milestones: Milestone[]): Promise<MilestoneTimeBuffer[]>;
/**
 * Sync calendar event changes back to milestones
 *
 * Call this when a calendar event is updated to keep milestones in sync.
 */
export declare function syncCalendarEventToMilestone(userId: string, eventId: string, eventUpdate: {
    newDate?: Date;
    cancelled?: boolean;
    newTitle?: string;
}, milestones: Milestone[]): Promise<{
    updated: boolean;
    milestoneId?: string;
    changes?: string[];
}>;
/**
 * Get a summary of milestone-calendar sync status for the user
 */
export declare function getMilestoneCalendarSyncStatus(userId: string, milestones: Milestone[]): Promise<{
    syncedMilestones: number;
    unsyncedMilestones: number;
    milestonesNeedingTime: string[];
    upcomingConflicts: string[];
    recommendation: string;
}>;
export declare const milestoneCalendarSync: {
    syncToCalendar: typeof syncMilestoneToCalendar;
    createCountdown: typeof createMilestoneCountdown;
    getForBriefing: typeof getMilestonesForDailyBriefing;
    injectToDaily: typeof injectMilestoneCountdownToDaily;
    checkConflicts: typeof checkMilestoneConflicts;
    generateCelebration: typeof generateMilestoneCelebration;
    buildContext: typeof buildMilestoneCalendarContext;
    detectMilestoneEvents: typeof detectMilestoneRelatedEvents;
    calculateTimeBuffers: typeof calculateMilestoneTimeBuffers;
    syncEventToMilestone: typeof syncCalendarEventToMilestone;
    getSyncStatus: typeof getMilestoneCalendarSyncStatus;
};
export default milestoneCalendarSync;
//# sourceMappingURL=milestone-calendar-sync.d.ts.map