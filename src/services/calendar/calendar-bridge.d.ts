/**
 * Calendar Bridge Service
 *
 * Unified bridge that ensures ALL schedulable items appear on the user's calendar.
 * This is a "Better than Human" capability - no human assistant could consistently
 * sync reminders, tasks, appointments, and scheduled messages to a single calendar view.
 *
 * Supported item types:
 * - Reminders (from reminder-scheduler)
 * - Scheduled messages (text, email, call)
 * - Appointments (doctor, dentist, salon, etc.)
 * - Tasks (high-priority only)
 *
 * Each item creates a calendar event with appropriate:
 * - Title prefix (🔔 Reminder, 📱 Text, 📧 Email, 📞 Call, 🩺 Appointment, ✅ Task)
 * - Description with context
 * - Appropriate duration
 * - Category for filtering
 */
import { type TimeSlot } from './calendar-service.js';
/**
 * Schedulable item types that should sync to calendar
 */
export type SchedulableItemType = 'reminder' | 'scheduled_text' | 'scheduled_email' | 'scheduled_call' | 'appointment' | 'task' | 'medication' | 'bill_due' | 'goal_deadline' | 'milestone' | 'commitment' | 'travel' | 'habit';
/**
 * Input for creating a calendar-synced item
 */
export interface CalendarBridgeInput {
    /** User ID */
    userId: string;
    /** Type of schedulable item */
    type: SchedulableItemType;
    /** Title/message of the item */
    title: string;
    /** When the item is scheduled for */
    scheduledFor: Date;
    /** Duration in minutes (default: 15 for reminders/messages, 60 for appointments) */
    durationMinutes?: number;
    /** Additional context/description */
    description?: string;
    /** Contact name if applicable */
    contactName?: string;
    /** Location for appointments */
    location?: string;
    /** External reference ID (e.g., reminder ID, appointment ID) */
    externalId?: string;
    /** Which persona created this */
    createdBy?: string;
    /** Whether to check for conflicts first */
    checkConflicts?: boolean;
}
/**
 * Result of creating a calendar-bridged item
 */
export interface CalendarBridgeResult {
    success: boolean;
    calendarEventId?: string;
    externalId?: string;
    conflicts?: ConflictInfo[];
    error?: string;
}
/**
 * Information about a scheduling conflict
 */
export interface ConflictInfo {
    eventId: string;
    eventTitle: string;
    startTime: Date;
    endTime: Date;
    conflictType: 'overlap' | 'back_to_back' | 'busy_slot';
}
/**
 * Create a schedulable item and sync it to the calendar
 *
 * This is the main entry point for the calendar bridge.
 * Call this whenever creating a reminder, scheduled message, appointment, or task.
 */
export declare function createCalendarSyncedItem(input: CalendarBridgeInput): Promise<CalendarBridgeResult>;
/**
 * Remove a calendar event when the external item is cancelled/deleted
 */
export declare function removeCalendarSyncedItem(userId: string, externalId: string): Promise<boolean>;
/**
 * Update a calendar event when the external item is modified
 */
export declare function updateCalendarSyncedItem(userId: string, externalId: string, updates: {
    title?: string;
    scheduledFor?: Date;
    durationMinutes?: number;
    description?: string;
    location?: string;
}): Promise<boolean>;
/**
 * Detect scheduling conflicts for a proposed time slot
 */
export declare function detectConflicts(userId: string, startTime: Date, endTime: Date): Promise<ConflictInfo[]>;
/**
 * Find the next available slot that doesn't conflict
 */
export declare function findNonConflictingSlot(userId: string, preferredTime: Date, durationMinutes: number, options?: {
    maxDaysToSearch?: number;
    workHoursOnly?: boolean;
}): Promise<TimeSlot | null>;
/**
 * Sync a reminder to the calendar
 */
export declare function syncReminderToCalendar(userId: string, reminderId: string, message: string, scheduledFor: Date, createdBy?: string): Promise<CalendarBridgeResult>;
/**
 * Sync a scheduled text message to the calendar
 */
export declare function syncScheduledTextToCalendar(userId: string, messageId: string, contactName: string, message: string, scheduledFor: Date, createdBy?: string): Promise<CalendarBridgeResult>;
/**
 * Sync a scheduled email to the calendar
 */
export declare function syncScheduledEmailToCalendar(userId: string, emailId: string, contactName: string, subject: string, scheduledFor: Date, createdBy?: string): Promise<CalendarBridgeResult>;
/**
 * Sync a scheduled call to the calendar
 */
export declare function syncScheduledCallToCalendar(userId: string, callId: string, contactName: string, purpose: string, scheduledFor: Date, durationMinutes?: number, createdBy?: string): Promise<CalendarBridgeResult>;
/**
 * Sync an appointment to the calendar
 */
export declare function syncAppointmentToCalendar(userId: string, appointmentId: string, title: string, scheduledFor: Date, options?: {
    durationMinutes?: number;
    location?: string;
    contactName?: string;
    description?: string;
    createdBy?: string;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a task to the calendar (for high-priority tasks)
 */
export declare function syncTaskToCalendar(userId: string, taskId: string, taskTitle: string, scheduledFor: Date, durationMinutes?: number, createdBy?: string): Promise<CalendarBridgeResult>;
/**
 * Sync a medication reminder to the calendar
 */
export declare function syncMedicationToCalendar(userId: string, medicationId: string, medicationName: string, dosage: string, scheduledFor: Date, options?: {
    instructions?: string;
    isRecurring?: boolean;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a bill due date to the calendar
 */
export declare function syncBillToCalendar(userId: string, billId: string, billName: string, amount: number, dueDate: Date, options?: {
    payee?: string;
    isAutoPay?: boolean;
    reminderDaysBefore?: number;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a goal deadline to the calendar
 */
export declare function syncGoalToCalendar(userId: string, goalId: string, goalTitle: string, deadline: Date, options?: {
    description?: string;
    category?: string;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a life milestone to the calendar
 */
export declare function syncMilestoneToCalendar(userId: string, milestoneId: string, milestoneName: string, eventDate: Date, options?: {
    description?: string;
    isAllDay?: boolean;
    location?: string;
    category?: string;
    culturalType?: string;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a commitment/follow-up to the calendar
 */
export declare function syncCommitmentToCalendar(userId: string, commitmentId: string, commitmentTitle: string, targetDate: Date, options?: {
    description?: string;
    contactName?: string;
    type?: string;
    emotionalWeight?: number;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a travel plan to the calendar
 */
export declare function syncTravelToCalendar(userId: string, travelId: string, destination: string, startDate: Date, endDate: Date, options?: {
    tripName?: string;
    description?: string;
    notes?: string;
    budget?: number;
    flightInfo?: string;
    hotelInfo?: string;
}): Promise<CalendarBridgeResult>;
/**
 * Sync a habit reminder to the calendar
 */
export declare function syncHabitToCalendar(userId: string, habitId: string, habitName: string, scheduledFor: Date, options?: {
    isRecurring?: boolean;
    frequency?: string;
    category?: string;
    description?: string;
}): Promise<CalendarBridgeResult>;
declare const _default: {
    createCalendarSyncedItem: typeof createCalendarSyncedItem;
    removeCalendarSyncedItem: typeof removeCalendarSyncedItem;
    updateCalendarSyncedItem: typeof updateCalendarSyncedItem;
    detectConflicts: typeof detectConflicts;
    findNonConflictingSlot: typeof findNonConflictingSlot;
    syncReminderToCalendar: typeof syncReminderToCalendar;
    syncScheduledTextToCalendar: typeof syncScheduledTextToCalendar;
    syncScheduledEmailToCalendar: typeof syncScheduledEmailToCalendar;
    syncScheduledCallToCalendar: typeof syncScheduledCallToCalendar;
    syncAppointmentToCalendar: typeof syncAppointmentToCalendar;
    syncTaskToCalendar: typeof syncTaskToCalendar;
    syncMedicationToCalendar: typeof syncMedicationToCalendar;
    syncBillToCalendar: typeof syncBillToCalendar;
    syncGoalToCalendar: typeof syncGoalToCalendar;
    syncMilestoneToCalendar: typeof syncMilestoneToCalendar;
    syncCommitmentToCalendar: typeof syncCommitmentToCalendar;
    syncTravelToCalendar: typeof syncTravelToCalendar;
    syncHabitToCalendar: typeof syncHabitToCalendar;
};
export default _default;
//# sourceMappingURL=calendar-bridge.d.ts.map