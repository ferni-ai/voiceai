/**
 * Calendar & Scheduling Hooks
 *
 * Auto-indexing hooks for calendar and time-related data.
 * Enables semantic search over schedules, meetings, and time commitments.
 *
 * @module services/data-layer/hooks/calendar-hooks
 */
import type { CalendarEventEntity, MeetingMemoryEntity } from '../types.js';
/**
 * Track calendar events
 */
export declare const onCalendarEventChange: import("../hook-generator.js").DomainHook<CalendarEventEntity>;
/**
 * Track meeting outcomes and action items
 */
export declare const onMeetingMemoryChange: import("../hook-generator.js").DomainHook<MeetingMemoryEntity>;
interface RecurringCommitmentEntity {
    commitment: string;
    frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
    dayOfWeek?: string;
    time?: string;
    importance: 'low' | 'medium' | 'high';
    notes?: string;
}
/**
 * Track recurring time commitments
 */
export declare const onRecurringCommitmentChange: import("../hook-generator.js").DomainHook<RecurringCommitmentEntity>;
interface CalendarConflictEntity {
    events: string[];
    date: string;
    resolution?: string;
    status: 'unresolved' | 'resolved';
}
/**
 * Track scheduling conflicts
 */
export declare const onCalendarConflictChange: import("../hook-generator.js").DomainHook<CalendarConflictEntity>;
interface MeetingPrepEntity {
    meetingTitle: string;
    date: string;
    prepNotes: string;
    objectives: string[];
    concerns?: string[];
}
/**
 * Track meeting preparation
 */
export declare const onMeetingPrepChange: import("../hook-generator.js").DomainHook<MeetingPrepEntity>;
interface AvailabilityPatternEntity {
    pattern: string;
    dayType: 'weekday' | 'weekend' | 'specific';
    specificDays?: string[];
    timeRange?: string;
    notes?: string;
}
/**
 * Track availability patterns
 */
export declare const onAvailabilityPatternChange: import("../hook-generator.js").DomainHook<AvailabilityPatternEntity>;
interface TimeBlockEntity {
    purpose: string;
    date: string;
    startTime: string;
    endTime: string;
    recurring?: boolean;
    category?: 'focus' | 'meeting' | 'personal' | 'admin';
}
/**
 * Track time blocks for focus/protection
 */
export declare const onTimeBlockChange: import("../hook-generator.js").DomainHook<TimeBlockEntity>;
interface DeadlineEntity {
    title: string;
    date: string;
    project?: string;
    importance: 'low' | 'medium' | 'high' | 'critical';
    status: 'upcoming' | 'near' | 'overdue' | 'completed';
    notes?: string;
}
/**
 * Track important deadlines
 */
export declare const onDeadlineChange: import("../hook-generator.js").DomainHook<DeadlineEntity>;
export declare const calendarHooks: {
    onCalendarEventChange: import("../hook-generator.js").DomainHook<CalendarEventEntity>;
    onMeetingMemoryChange: import("../hook-generator.js").DomainHook<MeetingMemoryEntity>;
    onRecurringCommitmentChange: import("../hook-generator.js").DomainHook<RecurringCommitmentEntity>;
    onCalendarConflictChange: import("../hook-generator.js").DomainHook<CalendarConflictEntity>;
    onMeetingPrepChange: import("../hook-generator.js").DomainHook<MeetingPrepEntity>;
    onAvailabilityPatternChange: import("../hook-generator.js").DomainHook<AvailabilityPatternEntity>;
    onTimeBlockChange: import("../hook-generator.js").DomainHook<TimeBlockEntity>;
    onDeadlineChange: import("../hook-generator.js").DomainHook<DeadlineEntity>;
};
export default calendarHooks;
//# sourceMappingURL=calendar-hooks.d.ts.map