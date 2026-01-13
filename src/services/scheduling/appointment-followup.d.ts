/**
 * Appointment Follow-up Service
 *
 * Manages follow-up on appointments that are in "calling" status:
 * - Tracks call attempts
 * - Schedules retry calls
 * - Sends status updates to users
 * - Coordinates with Jordan for life event appointments
 *
 * This ensures no appointment request falls through the cracks.
 *
 * PERSISTENCE: Appointments are persisted to Firestore to survive server restarts.
 */
import { EventEmitter } from 'events';
export interface TrackedAppointment {
    id: string;
    userId: string;
    type: 'restaurant' | 'service' | 'life_event';
    businessName: string;
    businessPhone?: string;
    requestedDateTime: Date;
    confirmedDateTime?: Date;
    status: 'pending' | 'calling' | 'awaiting_callback' | 'confirmed' | 'failed' | 'cancelled';
    callAttempts: number;
    maxCallAttempts: number;
    lastCallAt?: Date;
    nextFollowUpAt?: Date;
    linkedMilestoneId?: string;
    linkedEventName?: string;
    partySize?: number;
    specialRequests?: string;
    confirmationNumber?: string;
    notes: string[];
    createdAt: Date;
    updatedAt: Date;
}
export interface FollowUpConfig {
    maxCallAttempts: number;
    retryDelayMinutes: number;
    escalateAfterAttempts: number;
    notifyUserAfterAttempts: number;
}
declare class AppointmentFollowUpService extends EventEmitter {
    private appointments;
    private followUpTimers;
    private config;
    private isRunning;
    private checkInterval;
    private initialized;
    constructor(config?: Partial<FollowUpConfig>);
    /**
     * Initialize and load pending appointments from Firestore
     */
    initialize(): Promise<void>;
    /**
     * Save appointment to Firestore
     */
    private saveAppointment;
    /**
     * Start the follow-up service
     */
    start(): Promise<void>;
    /**
     * Stop the follow-up service
     */
    stop(): void;
    /**
     * Track a new appointment for follow-up
     */
    trackAppointment(appointment: Omit<TrackedAppointment, 'createdAt' | 'updatedAt' | 'notes' | 'callAttempts'>): TrackedAppointment;
    /**
     * Update appointment status
     */
    updateStatus(id: string, status: TrackedAppointment['status'], additionalInfo?: {
        confirmationNumber?: string;
        confirmedDateTime?: Date;
        note?: string;
    }): TrackedAppointment | null;
    /**
     * Record a call attempt
     */
    recordCallAttempt(id: string, result: 'no_answer' | 'busy' | 'voicemail' | 'connected' | 'error'): void;
    /**
     * Schedule a follow-up call
     */
    private scheduleFollowUp;
    /**
     * Cancel a scheduled follow-up
     */
    private cancelFollowUp;
    /**
     * Execute a follow-up action
     */
    private executeFollowUp;
    /**
     * Check all pending appointments
     */
    private checkPendingAppointments;
    /**
     * Notify relevant parties of status change
     */
    private notifyStatusChange;
    /**
     * Notify user of delay in booking
     */
    private notifyUserOfDelay;
    /**
     * Notify user that max attempts reached
     */
    private notifyMaxAttemptsReached;
    /**
     * Get all appointments for a user
     */
    getAppointments(userId: string): TrackedAppointment[];
    /**
     * Get pending appointments needing attention
     */
    getPendingAppointments(): TrackedAppointment[];
    /**
     * Get appointment by ID
     */
    getAppointment(id: string): TrackedAppointment | undefined;
    /**
     * Clean up old resolved appointments (older than 30 days)
     */
    cleanup(): void;
}
export declare function getAppointmentFollowUpService(): AppointmentFollowUpService;
export declare function startAppointmentFollowUp(): void;
export declare function stopAppointmentFollowUp(): void;
export default AppointmentFollowUpService;
//# sourceMappingURL=appointment-followup.d.ts.map