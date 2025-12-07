/**
 * Scheduling Types and Interfaces
 *
 * Shared types for appointment scheduling, delivery, and contacts.
 */

// ============================================================================
// TYPES
// ============================================================================

export type AppointmentType =
  | 'restaurant'
  | 'doctor'
  | 'dentist'
  | 'salon'
  | 'spa'
  | 'vet'
  | 'service'
  | 'consultation'
  | 'meeting'
  | 'other';

export type AppointmentStatus =
  | 'pending'
  | 'calling'
  | 'confirmed'
  | 'waitlist'
  | 'cancelled'
  | 'completed'
  | 'no_answer';

export interface ScheduledAppointment {
  id: string;
  userId: string;

  // What and where
  type: AppointmentType;
  businessName: string;
  businessPhone?: string;
  address?: string;

  // When
  requestedDateTime: Date;
  confirmedDateTime?: Date;
  duration?: number; // minutes

  // Who
  partySize?: number; // for reservations
  forPerson?: string; // name of person appointment is for
  specialRequests?: string;

  // Status
  status: AppointmentStatus;
  callAttempts: number;
  lastCallAt?: Date;
  confirmationNumber?: string;
  notes: string[];

  // Linked events (from Jordan)
  linkedMilestoneId?: string;
  linkedEventName?: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}
