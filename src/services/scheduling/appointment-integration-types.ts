/**
 * Appointment integration types. Extracted from appointment-integration.ts.
 */

export interface AppointmentRequest {
  userId: string;
  businessName: string;
  businessPhone: string;
  appointmentType: 'doctor' | 'dentist' | 'salon' | 'restaurant' | 'service' | 'other';
  requestedDate: string; // e.g., "next Tuesday"
  requestedTime: string; // e.g., "around 2pm"
  partySize?: number;
  specialRequests?: string;
  linkedMilestoneId?: string;
  linkedEventName?: string;
  notifyVia?: 'sms' | 'email' | 'both';
  notifyContact?: string; // phone or email
}

export interface AppointmentResult {
  success: boolean;
  appointmentId: string;
  status: 'calling' | 'confirmed' | 'failed' | 'needs_callback';
  message: string;
  callSid?: string;
  confirmationNumber?: string;
  confirmedDateTime?: Date;
  calendarEventId?: string;
}
