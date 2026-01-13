/**
 * Reminder Scheduler Service
 *
 * Handles persistent storage and scheduled delivery of reminders.
 * Supports SMS, email, phone calls, and voice messages.
 *
 * Storage: Firestore
 * Scheduling: In-memory polling (production would use Cloud Tasks/Scheduler)
 */
export type ReminderDeliveryMethod = 'sms' | 'email' | 'call' | 'voice_message';
export interface ScheduledReminder {
    id: string;
    userId: string;
    message: string;
    subject?: string;
    context?: string;
    scheduledFor: Date;
    timezone: string;
    deliveryMethod: ReminderDeliveryMethod;
    deliveryAddress: string;
    /** If this reminder is about reaching out to a contact, track their ID */
    contactId?: string;
    /** Name of the contact for display purposes */
    contactName?: string;
    /** Whether this is a direct message TO the contact (vs. reminder to self about contact) */
    isDirectToContact?: boolean;
    /**
     * Sponsored identity ID if this reminder was created by a family phone caller.
     * When set, Ferni will attribute the reminder: "Your mom wanted me to remind you..."
     */
    sourceIdentityId?: string;
    /** Display name of the source for attribution (e.g., "Mom") */
    sourceIdentityName?: string;
    /** Relationship of source to user (e.g., "mother") */
    sourceRelationship?: string;
    status: 'pending' | 'delivered' | 'failed' | 'cancelled';
    attempts: number;
    lastAttempt?: Date;
    error?: string;
    createdAt: Date;
    createdBy: string;
    /** Persona ID for voice/formatting - defaults to createdBy if not set */
    personaId?: string;
}
export interface VoiceMessage {
    id: string;
    userId: string;
    message: string;
    voiceId?: string;
    audioUrl?: string;
    deliveredAt?: Date;
    status: 'generating' | 'ready' | 'sent' | 'failed';
}
/**
 * Create and schedule a new reminder
 */
export declare function createReminder(params: {
    userId: string;
    message: string;
    subject?: string;
    context?: string;
    scheduledFor: Date;
    timezone?: string;
    deliveryMethod: ReminderDeliveryMethod;
    deliveryAddress: string;
    createdBy?: string;
    personaId?: string;
    contactId?: string;
    contactName?: string;
    isDirectToContact?: boolean;
    sourceIdentityId?: string;
    sourceIdentityName?: string;
    sourceRelationship?: string;
}): Promise<ScheduledReminder>;
/**
 * Get all pending reminders for a user (from memory and Firestore)
 */
export declare function getPendingReminders(userId: string): ScheduledReminder[];
/**
 * Load pending reminders from Firestore into memory (call on startup)
 */
export declare function loadRemindersFromFirestore(userId?: string): Promise<number>;
/**
 * Get all reminders that are due for delivery
 */
export declare function getDueReminders(): ScheduledReminder[];
/**
 * Cancel a reminder
 */
export declare function cancelReminder(reminderId: string): Promise<boolean>;
/**
 * Deliver a reminder via the appropriate channel
 */
export declare function deliverReminder(reminder: ScheduledReminder): Promise<boolean>;
/**
 * Create a voice message using TTS
 * Actually generates audio using Cartesia TTS and uploads to GCS
 */
export declare function createVoiceMessage(params: {
    userId: string;
    message: string;
    voiceId?: string;
}): Promise<VoiceMessage>;
/**
 * Send a voice message via MMS (with audio) or SMS (text fallback)
 */
export declare function sendVoiceMessage(voiceMessageId: string, toPhone: string): Promise<string>;
/**
 * Start the reminder scheduler
 * Checks for due reminders every minute
 * Runs cleanup every hour to prevent memory leaks
 */
export declare function startReminderScheduler(intervalMs?: number): void;
/**
 * Stop the reminder scheduler
 */
export declare function stopReminderScheduler(): void;
/**
 * Clean up old reminders and voice messages to prevent memory leaks.
 * Removes items that are either:
 * - Delivered/failed/cancelled and older than maxAgeMs
 * - Voice messages older than maxAgeMs
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 7 days)
 */
export declare function cleanupOldReminders(maxAgeMs?: number): number;
/**
 * Parse natural language time expressions
 */
export declare function parseNaturalTime(expression: string, timezone?: string): Date | null;
declare const _default: {
    createReminder: typeof createReminder;
    getPendingReminders: typeof getPendingReminders;
    getDueReminders: typeof getDueReminders;
    cancelReminder: typeof cancelReminder;
    deliverReminder: typeof deliverReminder;
    createVoiceMessage: typeof createVoiceMessage;
    sendVoiceMessage: typeof sendVoiceMessage;
    startReminderScheduler: typeof startReminderScheduler;
    stopReminderScheduler: typeof stopReminderScheduler;
    cleanupOldReminders: typeof cleanupOldReminders;
    parseNaturalTime: typeof parseNaturalTime;
    loadRemindersFromFirestore: typeof loadRemindersFromFirestore;
};
export default _default;
//# sourceMappingURL=reminder-scheduler.d.ts.map