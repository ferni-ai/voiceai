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
 */

import { getLogger } from '../utils/safe-logger.js';
import { EventEmitter } from 'events';
import { getAgentBus } from './agent-bus.js';
import { createReminder } from './reminder-scheduler.js';

// ============================================================================
// TYPES
// ============================================================================

export interface TrackedAppointment {
  id: string;
  userId: string;
  type: 'restaurant' | 'service' | 'life_event';

  // Business info
  businessName: string;
  businessPhone?: string;

  // Requested time
  requestedDateTime: Date;
  confirmedDateTime?: Date;

  // Status tracking
  status: 'pending' | 'calling' | 'awaiting_callback' | 'confirmed' | 'failed' | 'cancelled';
  callAttempts: number;
  maxCallAttempts: number;
  lastCallAt?: Date;
  nextFollowUpAt?: Date;

  // Context
  linkedMilestoneId?: string;
  linkedEventName?: string;
  partySize?: number;
  specialRequests?: string;

  // Results
  confirmationNumber?: string;
  notes: string[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

export interface FollowUpConfig {
  maxCallAttempts: number;
  retryDelayMinutes: number;
  escalateAfterAttempts: number;
  notifyUserAfterAttempts: number;
}

const DEFAULT_CONFIG: FollowUpConfig = {
  maxCallAttempts: 3,
  retryDelayMinutes: 30,
  escalateAfterAttempts: 2,
  notifyUserAfterAttempts: 1,
};

// ============================================================================
// FOLLOW-UP SERVICE
// ============================================================================

class AppointmentFollowUpService extends EventEmitter {
  private appointments: Map<string, TrackedAppointment> = new Map();
  private followUpTimers: Map<string, NodeJS.Timeout> = new Map();
  private config: FollowUpConfig;
  private isRunning: boolean = false;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<FollowUpConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the follow-up service
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;

    // Check for appointments needing follow-up every 5 minutes
    this.checkInterval = setInterval(
      () => {
        this.checkPendingAppointments();
      },
      5 * 60 * 1000
    );

    getLogger().info('📞 Appointment follow-up service started');
  }

  /**
   * Stop the follow-up service
   */
  stop(): void {
    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    // Clear all timers
    for (const timer of this.followUpTimers.values()) {
      clearTimeout(timer);
    }
    this.followUpTimers.clear();

    getLogger().info('📞 Appointment follow-up service stopped');
  }

  /**
   * Track a new appointment for follow-up
   */
  trackAppointment(
    appointment: Omit<TrackedAppointment, 'createdAt' | 'updatedAt' | 'notes' | 'callAttempts'>
  ): TrackedAppointment {
    const tracked: TrackedAppointment = {
      ...appointment,
      callAttempts: 0,
      maxCallAttempts: this.config.maxCallAttempts,
      notes: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.appointments.set(tracked.id, tracked);

    getLogger().info(
      {
        id: tracked.id,
        business: tracked.businessName,
        status: tracked.status,
      },
      '📞 Tracking appointment for follow-up'
    );

    // If already in calling status, schedule follow-up
    if (tracked.status === 'calling' || tracked.status === 'pending') {
      this.scheduleFollowUp(tracked.id);
    }

    return tracked;
  }

  /**
   * Update appointment status
   */
  updateStatus(
    id: string,
    status: TrackedAppointment['status'],
    additionalInfo?: {
      confirmationNumber?: string;
      confirmedDateTime?: Date;
      note?: string;
    }
  ): TrackedAppointment | null {
    const appointment = this.appointments.get(id);
    if (!appointment) return null;

    appointment.status = status;
    appointment.updatedAt = new Date();

    if (additionalInfo?.confirmationNumber) {
      appointment.confirmationNumber = additionalInfo.confirmationNumber;
    }
    if (additionalInfo?.confirmedDateTime) {
      appointment.confirmedDateTime = additionalInfo.confirmedDateTime;
    }
    if (additionalInfo?.note) {
      appointment.notes.push(`[${new Date().toISOString()}] ${additionalInfo.note}`);
    }

    this.appointments.set(id, appointment);

    // Cancel any pending follow-up if resolved
    if (['confirmed', 'failed', 'cancelled'].includes(status)) {
      this.cancelFollowUp(id);
      this.emit('appointment_resolved', appointment);
    }

    // Notify relevant parties
    this.notifyStatusChange(appointment);

    getLogger().info(
      {
        id,
        business: appointment.businessName,
        status,
      },
      '📞 Appointment status updated'
    );

    return appointment;
  }

  /**
   * Record a call attempt
   */
  recordCallAttempt(
    id: string,
    result: 'no_answer' | 'busy' | 'voicemail' | 'connected' | 'error'
  ): void {
    const appointment = this.appointments.get(id);
    if (!appointment) return;

    appointment.callAttempts++;
    appointment.lastCallAt = new Date();
    appointment.notes.push(
      `[${new Date().toISOString()}] Call attempt ${appointment.callAttempts}: ${result}`
    );
    appointment.updatedAt = new Date();

    if (result === 'connected') {
      appointment.status = 'awaiting_callback';
      this.emit('call_connected', appointment);
    } else if (appointment.callAttempts >= appointment.maxCallAttempts) {
      appointment.status = 'failed';
      appointment.notes.push(`Max call attempts (${appointment.maxCallAttempts}) reached`);
      this.emit('max_attempts_reached', appointment);
      this.notifyMaxAttemptsReached(appointment);
    } else {
      // Schedule retry
      this.scheduleFollowUp(id);

      // Notify user if threshold reached
      if (appointment.callAttempts >= this.config.notifyUserAfterAttempts) {
        this.notifyUserOfDelay(appointment);
      }
    }

    this.appointments.set(id, appointment);
  }

  /**
   * Schedule a follow-up call
   */
  private scheduleFollowUp(id: string): void {
    const appointment = this.appointments.get(id);
    if (!appointment) return;

    // Cancel existing timer
    this.cancelFollowUp(id);

    const delayMs = this.config.retryDelayMinutes * 60 * 1000;
    appointment.nextFollowUpAt = new Date(Date.now() + delayMs);

    const timer = setTimeout(() => {
      this.executeFollowUp(id);
    }, delayMs);

    this.followUpTimers.set(id, timer);

    getLogger().debug(
      {
        id,
        nextFollowUp: appointment.nextFollowUpAt.toISOString(),
      },
      'Follow-up scheduled'
    );
  }

  /**
   * Cancel a scheduled follow-up
   */
  private cancelFollowUp(id: string): void {
    const timer = this.followUpTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.followUpTimers.delete(id);
    }
  }

  /**
   * Execute a follow-up action
   */
  private executeFollowUp(id: string): void {
    const appointment = this.appointments.get(id);
    if (!appointment || appointment.status === 'confirmed' || appointment.status === 'cancelled') {
      return;
    }

    getLogger().info(
      {
        id,
        business: appointment.businessName,
        attempt: appointment.callAttempts + 1,
      },
      '📞 Executing follow-up'
    );

    // Emit event for the voice agent to handle
    this.emit('follow_up_needed', appointment);
  }

  /**
   * Check all pending appointments
   */
  private checkPendingAppointments(): void {
    const now = new Date();

    for (const appointment of this.appointments.values()) {
      // Skip resolved appointments
      if (['confirmed', 'failed', 'cancelled'].includes(appointment.status)) {
        continue;
      }

      // Check if follow-up is overdue
      if (appointment.nextFollowUpAt && appointment.nextFollowUpAt < now) {
        this.executeFollowUp(appointment.id);
      }

      // Check if appointment date has passed without confirmation
      if (appointment.requestedDateTime < now && appointment.status !== 'confirmed') {
        appointment.notes.push('Appointment date passed without confirmation');
        this.updateStatus(appointment.id, 'failed', {
          note: 'Appointment time passed without confirmation',
        });
      }
    }
  }

  /**
   * Notify relevant parties of status change
   */
  private notifyStatusChange(appointment: TrackedAppointment): void {
    // Notify Jordan if this is a life event appointment
    if (appointment.linkedMilestoneId || appointment.type === 'life_event') {
      getAgentBus().notify(
        'alex',
        'jordan',
        'appointment_status_update',
        {
          appointmentId: appointment.id,
          eventName: appointment.linkedEventName,
          vendor: appointment.businessName,
          status: appointment.status,
          confirmationNumber: appointment.confirmationNumber,
          confirmedDateTime: appointment.confirmedDateTime?.toISOString(),
        },
        appointment.userId
      );
    }
  }

  /**
   * Notify user of delay in booking
   */
  private async notifyUserOfDelay(appointment: TrackedAppointment): Promise<void> {
    // Note: In production, we'd look up the user's phone from their profile
    // For now, we log the notification intent
    getLogger().info(
      {
        userId: appointment.userId,
        business: appointment.businessName,
        attempts: appointment.callAttempts,
      },
      '📱 Would notify user of booking delay'
    );
  }

  /**
   * Notify user that max attempts reached
   */
  private async notifyMaxAttemptsReached(appointment: TrackedAppointment): Promise<void> {
    // Note: In production, we'd look up the user's phone from their profile
    getLogger().info(
      {
        userId: appointment.userId,
        business: appointment.businessName,
        attempts: appointment.callAttempts,
      },
      '📱 Would notify user of max attempts reached'
    );

    // Also notify Jordan if life event
    if (appointment.linkedMilestoneId) {
      getAgentBus().notify(
        'alex',
        'jordan',
        'appointment_needs_help',
        {
          appointmentId: appointment.id,
          eventName: appointment.linkedEventName,
          vendor: appointment.businessName,
          attempts: appointment.callAttempts,
          message: `Couldn't reach ${appointment.businessName} for the ${appointment.linkedEventName}. User has been notified.`,
        },
        appointment.userId
      );
    }
  }

  /**
   * Get all appointments for a user
   */
  getAppointments(userId: string): TrackedAppointment[] {
    return Array.from(this.appointments.values()).filter((a) => a.userId === userId);
  }

  /**
   * Get pending appointments needing attention
   */
  getPendingAppointments(): TrackedAppointment[] {
    return Array.from(this.appointments.values()).filter((a) =>
      ['pending', 'calling', 'awaiting_callback'].includes(a.status)
    );
  }

  /**
   * Get appointment by ID
   */
  getAppointment(id: string): TrackedAppointment | undefined {
    return this.appointments.get(id);
  }

  /**
   * Clean up old resolved appointments (older than 30 days)
   */
  cleanup(): void {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const [id, appointment] of this.appointments.entries()) {
      if (
        ['confirmed', 'failed', 'cancelled'].includes(appointment.status) &&
        appointment.updatedAt < thirtyDaysAgo
      ) {
        this.appointments.delete(id);
      }
    }
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let followUpService: AppointmentFollowUpService | null = null;

export function getAppointmentFollowUpService(): AppointmentFollowUpService {
  if (!followUpService) {
    followUpService = new AppointmentFollowUpService();
  }
  return followUpService;
}

export function startAppointmentFollowUp(): void {
  getAppointmentFollowUpService().start();
}

export function stopAppointmentFollowUp(): void {
  if (followUpService) {
    followUpService.stop();
    followUpService = null;
  }
}

export default AppointmentFollowUpService;
