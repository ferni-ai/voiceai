/**
 * Scheduling Types and Interfaces
 *
 * Shared types for appointment scheduling, delivery, and contacts.
 */
export type AppointmentType = 'restaurant' | 'doctor' | 'dentist' | 'salon' | 'spa' | 'vet' | 'veterinary' | 'service' | 'general_service' | 'consultation' | 'meeting' | 'other';
export type AppointmentStatus = 'pending' | 'calling' | 'confirmed' | 'waitlist' | 'cancelled' | 'completed' | 'no_answer';
export interface ScheduledAppointment {
    id: string;
    userId: string;
    type: AppointmentType;
    businessName: string;
    businessPhone?: string;
    address?: string;
    requestedDateTime: Date;
    confirmedDateTime?: Date;
    duration?: number;
    partySize?: number;
    forPerson?: string;
    specialRequests?: string;
    status: AppointmentStatus;
    callAttempts: number;
    lastCallAt?: Date;
    confirmationNumber?: string;
    notes: string[];
    linkedMilestoneId?: string;
    linkedEventName?: string;
    createdAt: Date;
    updatedAt: Date;
}
//# sourceMappingURL=types.d.ts.map