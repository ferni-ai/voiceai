/**
 * Appointment Core Functions
 *
 * Core appointment management functions including creation, status updates, and calling.
 */
import type { AppointmentType, AppointmentStatus, ScheduledAppointment } from './types.js';
/**
 * Create a new appointment request and track it for follow-up
 */
export declare function createAppointmentRequest(params: {
    userId: string;
    type: AppointmentType;
    businessName: string;
    businessPhone?: string;
    requestedDateTime: Date;
    partySize?: number;
    forPerson?: string;
    specialRequests?: string;
    linkedMilestoneId?: string;
    linkedEventName?: string;
}): Promise<ScheduledAppointment>;
/**
 * Update appointment status
 */
export declare function updateAppointmentStatus(id: string, status: AppointmentStatus, note?: string, confirmedDateTime?: Date, confirmationNumber?: string): Promise<ScheduledAppointment | null>;
/**
 * Get an appointment by ID
 */
export declare function getAppointment(id: string): ScheduledAppointment | undefined;
/**
 * Get all appointments for a user
 */
export declare function getUserAppointments(userId: string): ScheduledAppointment[];
/**
 * Generate a call script for making an appointment
 */
export declare function generateCallScript(apt: ScheduledAppointment): string;
/**
 * Make an outbound call to schedule an appointment
 */
export declare function makeAppointmentCall(apt: ScheduledAppointment): Promise<string>;
//# sourceMappingURL=appointment-core.d.ts.map