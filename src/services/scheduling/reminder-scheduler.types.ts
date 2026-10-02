/**
 * Reminder Scheduler Types
 *
 * Reminder and voice-message shapes for reminder-scheduler.ts.
 */

// ============================================================================
// TYPES
// ============================================================================

export type ReminderDeliveryMethod = 'sms' | 'email' | 'call' | 'voice_message' | 'in_app';

export interface ScheduledReminder {
  id: string;
  userId: string;

  // Content
  message: string;
  subject?: string; // For emails
  context?: string; // Additional context

  // Scheduling
  scheduledFor: Date;
  timezone: string;

  // Delivery
  deliveryMethod: ReminderDeliveryMethod;
  deliveryAddress: string; // Phone or email

  // Contact tracking (for ML timing learning)
  /** If this reminder is about reaching out to a contact, track their ID */
  contactId?: string;
  /** Name of the contact for display purposes */
  contactName?: string;
  /** Whether this is a direct message TO the contact (vs. reminder to self about contact) */
  isDirectToContact?: boolean;

  // Family coordination (for family-created reminders)
  /**
   * Sponsored identity ID if this reminder was created by a family phone caller.
   * When set, Ferni will attribute the reminder: "Your mom wanted me to remind you..."
   */
  sourceIdentityId?: string;
  /** Display name of the source for attribution (e.g., "Mom") */
  sourceIdentityName?: string;
  /** Relationship of source to user (e.g., "mother") */
  sourceRelationship?: string;

  // Status
  /** 'sending' = claimed by the delivery job; 'missed' = found too late to be useful. */
  status: 'pending' | 'sending' | 'delivered' | 'failed' | 'cancelled' | 'missed';
  attempts: number;
  lastAttempt?: Date;
  error?: string;

  // Metadata
  createdAt: Date;
  createdBy: string; // Which persona created it (alex-chen, maya-santos, ferni, etc.)
  /** Persona ID for voice/formatting - defaults to createdBy if not set */
  personaId?: string;
}

export interface VoiceMessage {
  id: string;
  userId: string;
  message: string;
  voiceId?: string; // TTS voice to use
  audioUrl?: string; // Generated audio URL
  deliveredAt?: Date;
  status: 'generating' | 'ready' | 'sent' | 'failed';
}
