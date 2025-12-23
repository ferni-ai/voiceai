/**
 * Appointment Integration Service
 *
 * Orchestrates the full appointment scheduling flow:
 * 1. User requests appointment
 * 2. Agent makes outbound call to business
 * 3. Call status is tracked via webhooks
 * 4. On confirmation, calendar event is created
 * 5. User is notified via preferred channel (SMS/email)
 *
 * This service integrates:
 * - Twilio (calls, SMS)
 * - Google Calendar (events)
 * - Appointment Follow-up Service (tracking)
 * - SendGrid (email notifications)
 *
 * PERSISTENCE: Pending appointment requests are persisted to Firestore.
 */

import { EventEmitter } from 'events';
import admin from 'firebase-admin';
import { getLogger } from '../../utils/safe-logger.js';
import { getAppointmentFollowUpService, type TrackedAppointment } from './appointment-followup.js';
import { sendEmail, sendSMS } from '../communication-service.js';
import { createAppointmentEvent, isCalendarConfigured } from '../identity/google-calendar-oauth.js';
import {
  generateAppointmentTwiML,
  getTwilioWebhookService,
  type CallTrackingEntry,
} from '../twilio-webhooks.js';

// ============================================================================
// FIRESTORE SETUP
// ============================================================================

const PENDING_REQUESTS_COLLECTION = 'pending_appointment_requests';

function getFirestore(): admin.firestore.Firestore | null {
  try {
    return admin.firestore();
  } catch {
    return null;
  }
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Read at runtime for testability
function getTwilioConfig() {
  return {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
    webhookBaseUrl: process.env.WEBHOOK_BASE_URL || 'https://api.ferni.ai/webhooks/twilio',
  };
}

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// APPOINTMENT INTEGRATION SERVICE
// ============================================================================

class AppointmentIntegrationService extends EventEmitter {
  private pendingAppointments = new Map<string, AppointmentRequest>();
  private initialized = false;

  constructor() {
    super();
    this.setupWebhookListeners();
  }

  /**
   * Initialize and load pending requests from Firestore
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const db = getFirestore();
    if (db) {
      try {
        const snapshot = await db.collection(PENDING_REQUESTS_COLLECTION).get();
        snapshot.forEach((doc) => {
          const data = doc.data() as AppointmentRequest;
          this.pendingAppointments.set(doc.id, data);
        });
        getLogger().info(
          { count: this.pendingAppointments.size },
          '📅 Loaded pending appointment requests'
        );
      } catch (error) {
        getLogger().error({ error }, 'Failed to load pending appointment requests');
      }
    }
    this.initialized = true;
  }

  /**
   * Save pending appointment request to Firestore
   */
  private async savePendingRequest(
    appointmentId: string,
    request: AppointmentRequest
  ): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db.collection(PENDING_REQUESTS_COLLECTION).doc(appointmentId).set(request);
    } catch (error) {
      getLogger().error({ error, appointmentId }, 'Failed to save pending request');
    }
  }

  /**
   * Remove pending appointment request from Firestore
   */
  private async removePendingRequest(appointmentId: string): Promise<void> {
    const db = getFirestore();
    if (!db) return;

    try {
      await db.collection(PENDING_REQUESTS_COLLECTION).doc(appointmentId).delete();
    } catch (error) {
      getLogger().error({ error, appointmentId }, 'Failed to remove pending request');
    }
  }

  /**
   * Set up listeners for Twilio webhook events
   */
  private setupWebhookListeners(): void {
    const webhookService = getTwilioWebhookService();

    // Handle call completion
    webhookService.on('call_complete', (entry: CallTrackingEntry) => {
      void this.handleCallComplete(entry);
    });

    // Handle voicemail detection
    webhookService.on('voicemail', (entry: CallTrackingEntry) => {
      void this.handleVoicemail(entry);
    });

    // Handle transcription (business response)
    webhookService.on('transcription', (entry: CallTrackingEntry) => {
      void this.handleTranscription(entry);
    });
  }

  /**
   * Schedule an appointment - main entry point
   */
  async scheduleAppointment(request: AppointmentRequest): Promise<AppointmentResult> {
    const appointmentId = `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    getLogger().info(
      {
        appointmentId,
        business: request.businessName,
        type: request.appointmentType,
      },
      '📅 Scheduling appointment'
    );

    // Track the appointment
    const followUpService = getAppointmentFollowUpService();
    const parsedDate = this.parseRequestedDateTime(request.requestedDate, request.requestedTime);

    const _trackedAppointment = followUpService.trackAppointment({
      id: appointmentId,
      userId: request.userId,
      type: request.appointmentType === 'restaurant' ? 'restaurant' : 'service',
      businessName: request.businessName,
      businessPhone: request.businessPhone,
      requestedDateTime: parsedDate,
      partySize: request.partySize,
      specialRequests: request.specialRequests,
      linkedMilestoneId: request.linkedMilestoneId,
      linkedEventName: request.linkedEventName,
      status: 'pending',
      maxCallAttempts: 3,
    });

    // Store the full request for later reference
    this.pendingAppointments.set(appointmentId, request);

    // Persist to Firestore
    void this.savePendingRequest(appointmentId, request);

    // Check if Twilio is configured
    if (!this.isTwilioConfigured()) {
      getLogger().warn('Twilio not configured - simulating appointment call');
      return this.simulateAppointmentCall(appointmentId, request);
    }

    // Make the actual call
    try {
      const callResult = await this.makeAppointmentCall(appointmentId, request);
      return callResult;
    } catch (error) {
      getLogger().error({ appointmentId, error }, 'Failed to initiate appointment call');

      followUpService.updateStatus(appointmentId, 'failed', {
        note: `Call initiation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      return {
        success: false,
        appointmentId,
        status: 'failed',
        message: `I couldn't reach ${request.businessName}. Want me to try again later?`,
      };
    }
  }

  /**
   * Make the outbound call to the business
   */
  private async makeAppointmentCall(
    appointmentId: string,
    request: AppointmentRequest
  ): Promise<AppointmentResult> {
    const config = getTwilioConfig();
    const twiml = generateAppointmentTwiML({
      businessName: request.businessName,
      requestedDate: request.requestedDate,
      requestedTime: request.requestedTime,
      partySize: request.partySize,
      specialRequests: request.specialRequests,
      callerName: 'my client',
      callbackUrl: config.webhookBaseUrl,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: request.businessPhone,
          From: config.phoneNumber,
          Twiml: twiml,
          StatusCallback: `${config.webhookBaseUrl}/call-status`,
          StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
          MachineDetection: 'DetectMessageEnd',
          AsyncAmd: 'true',
          AsyncAmdStatusCallback: `${config.webhookBaseUrl}/amd-status`,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio call failed: ${error}`);
    }

    const data = (await response.json()) as { sid: string; status: string };

    // Track the call
    const webhookService = getTwilioWebhookService();
    webhookService.trackCall(data.sid, request.businessPhone, config.phoneNumber, appointmentId);

    // Update appointment status
    const followUpService = getAppointmentFollowUpService();
    followUpService.updateStatus(appointmentId, 'calling', {
      note: `Call initiated - SID: ${data.sid}`,
    });

    getLogger().info(
      { appointmentId, callSid: data.sid, business: request.businessName },
      '📞 Appointment call initiated'
    );

    return {
      success: true,
      appointmentId,
      status: 'calling',
      message: `I'm calling ${request.businessName} now to schedule your ${request.appointmentType} appointment for ${request.requestedDate} around ${request.requestedTime}. I'll let you know once it's confirmed!`,
      callSid: data.sid,
    };
  }

  /**
   * Simulate appointment call when Twilio not configured
   */
  private simulateAppointmentCall(
    appointmentId: string,
    request: AppointmentRequest
  ): AppointmentResult {
    const followUpService = getAppointmentFollowUpService();

    // Simulate a successful call after a brief delay
    setTimeout(() => {
      void (async () => {
        try {
          // Simulate getting confirmation
          const confirmationNumber = `SIM-${Date.now().toString().slice(-6)}`;
          const confirmedDate = this.parseRequestedDateTime(
            request.requestedDate,
            request.requestedTime
          );

          getLogger().info({ appointmentId }, '🎭 Simulation: Processing confirmation');

          followUpService.recordCallAttempt(appointmentId, 'connected');
          followUpService.updateStatus(appointmentId, 'confirmed', {
            confirmationNumber,
            confirmedDateTime: confirmedDate,
            note: 'Simulated confirmation (Twilio not configured)',
          });

          getLogger().info({ appointmentId, status: 'confirmed' }, '🎭 Simulation: Status updated');

          // Create calendar event (non-blocking)
          this.createCalendarEventForAppointment(appointmentId, request, confirmedDate).catch(
            (err) => getLogger().warn({ err, appointmentId }, 'Calendar event creation failed')
          );

          // Notify user (non-blocking)
          this.notifyUserOfConfirmation(
            appointmentId,
            request,
            confirmationNumber,
            confirmedDate
          ).catch((err) => getLogger().warn({ err, appointmentId }, 'User notification failed'));

          this.emit('appointment_confirmed', { appointmentId, confirmationNumber, confirmedDate });
        } catch (error) {
          getLogger().error({ error, appointmentId }, '🎭 Simulation failed');
        }
      })();
    }, 2000);

    return {
      success: true,
      appointmentId,
      status: 'calling',
      message: `I'm calling ${request.businessName} now (simulated). I'll let you know once it's confirmed!`,
    };
  }

  /**
   * Handle call completion webhook
   */
  private async handleCallComplete(entry: CallTrackingEntry): Promise<void> {
    if (!entry.appointmentId) return;

    const request = this.pendingAppointments.get(entry.appointmentId);
    if (!request) return;

    const followUpService = getAppointmentFollowUpService();

    if (entry.status === 'completed' && entry.answeredBy === 'human') {
      // Call was answered by a person - wait for transcription to determine outcome
      getLogger().info(
        { appointmentId: entry.appointmentId },
        'Call answered, awaiting response analysis'
      );
    } else if (entry.status === 'no-answer' || entry.status === 'busy') {
      // Schedule retry
      getLogger().info(
        { appointmentId: entry.appointmentId, status: entry.status },
        'Call not answered, will retry'
      );

      // Notify user of delay if this isn't the first attempt
      const appointment = followUpService.getAppointment(entry.appointmentId);
      if (appointment && appointment.callAttempts > 1) {
        await this.notifyUserOfDelay(entry.appointmentId, request, entry.status);
      }
    } else if (entry.status === 'failed') {
      // Call failed - notify user
      followUpService.updateStatus(entry.appointmentId, 'failed', {
        note: `Call failed: ${entry.error?.message || 'Unknown error'}`,
      });

      await this.notifyUserOfFailure(entry.appointmentId, request);
    }
  }

  /**
   * Handle voicemail detection
   */
  private async handleVoicemail(entry: CallTrackingEntry): Promise<void> {
    if (!entry.appointmentId) return;

    getLogger().info(
      { appointmentId: entry.appointmentId, answeredBy: entry.answeredBy },
      'Voicemail detected - message will be left'
    );

    // The TwiML will leave a voicemail message
    // Mark as awaiting callback
    const followUpService = getAppointmentFollowUpService();
    followUpService.updateStatus(entry.appointmentId, 'awaiting_callback', {
      note: 'Voicemail message left, awaiting callback',
    });
  }

  /**
   * Handle transcription of business response
   */
  private async handleTranscription(entry: CallTrackingEntry): Promise<void> {
    if (!entry.appointmentId || !entry.transcription) return;

    const request = this.pendingAppointments.get(entry.appointmentId);
    if (!request) return;

    getLogger().info(
      { appointmentId: entry.appointmentId, transcription: entry.transcription.slice(0, 100) },
      'Received business response transcription'
    );

    // Analyze the transcription to determine outcome
    const outcome = this.analyzeTranscription(entry.transcription);

    const followUpService = getAppointmentFollowUpService();

    if (outcome.confirmed) {
      // Appointment confirmed!
      const confirmedDate =
        outcome.confirmedDateTime ||
        this.parseRequestedDateTime(request.requestedDate, request.requestedTime);

      const confirmationNumber =
        outcome.confirmationNumber || `CONF-${Date.now().toString().slice(-6)}`;

      followUpService.updateStatus(entry.appointmentId, 'confirmed', {
        confirmationNumber,
        confirmedDateTime: confirmedDate,
        note: `Confirmed via call. Business response: "${entry.transcription.slice(0, 200)}..."`,
      });

      // Create calendar event
      await this.createCalendarEventForAppointment(entry.appointmentId, request, confirmedDate);

      // Notify user
      await this.notifyUserOfConfirmation(
        entry.appointmentId,
        request,
        confirmationNumber,
        confirmedDate
      );

      this.emit('appointment_confirmed', {
        appointmentId: entry.appointmentId,
        confirmationNumber,
        confirmedDate,
      });
    } else if (outcome.needsCallback) {
      followUpService.updateStatus(entry.appointmentId, 'awaiting_callback', {
        note: `Business will call back. Response: "${entry.transcription.slice(0, 200)}..."`,
      });
    } else {
      // Unclear outcome - may need follow-up
      getLogger().warn(
        { appointmentId: entry.appointmentId, transcription: entry.transcription },
        'Unclear appointment outcome'
      );
    }
  }

  /**
   * Analyze transcription to determine appointment outcome
   */
  private analyzeTranscription(transcription: string): {
    confirmed: boolean;
    confirmedDateTime?: Date;
    confirmationNumber?: string;
    needsCallback: boolean;
  } {
    const lower = transcription.toLowerCase();

    // Check for confirmation indicators
    const confirmationPhrases = [
      'confirmed',
      'booked',
      'see you',
      'we have you down',
      'all set',
      'appointment is set',
      "you're scheduled",
    ];

    const confirmed = confirmationPhrases.some((phrase) => lower.includes(phrase));

    // Check for callback indicators
    const callbackPhrases = [
      'call you back',
      "we'll call",
      'give you a call',
      'check and call',
      'let you know',
    ];

    const needsCallback = callbackPhrases.some((phrase) => lower.includes(phrase));

    // Try to extract time from transcription
    let confirmedDateTime: Date | undefined;
    const timePatterns = [
      /(\d{1,2})\s*(am|pm)/i,
      /(\d{1,2}):(\d{2})\s*(am|pm)?/i,
      /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
    ];

    // Basic extraction - in production, use NLP
    for (const pattern of timePatterns) {
      const match = lower.match(pattern);
      if (match) {
        // Would parse properly in production
        break;
      }
    }

    // Try to extract confirmation number
    let confirmationNumber: string | undefined;
    const confMatch = transcription.match(
      /(?:confirmation|reference|booking)\s*(?:number|#|:)?\s*(\w+)/i
    );
    if (confMatch) {
      confirmationNumber = confMatch[1];
    }

    return {
      confirmed,
      confirmedDateTime,
      confirmationNumber,
      needsCallback: needsCallback && !confirmed,
    };
  }

  /**
   * Create calendar event for confirmed appointment
   */
  private async createCalendarEventForAppointment(
    appointmentId: string,
    request: AppointmentRequest,
    confirmedDate: Date
  ): Promise<string | null> {
    if (!(await isCalendarConfigured(request.userId))) {
      getLogger().debug({ userId: request.userId }, 'Calendar not configured for user');
      return null;
    }

    try {
      const event = await createAppointmentEvent(request.userId, {
        title: `${request.appointmentType.charAt(0).toUpperCase() + request.appointmentType.slice(1)} at ${request.businessName}`,
        description: request.specialRequests
          ? `Special requests: ${request.specialRequests}\n\nScheduled by Ferni`
          : 'Scheduled by Ferni',
        location: request.businessName,
        startTime: confirmedDate,
        durationMinutes: request.appointmentType === 'restaurant' ? 90 : 60,
        reminders: [
          { method: 'popup', minutes: 60 },
          { method: 'email', minutes: 24 * 60 }, // 1 day before
        ],
      });

      if (event?.id) {
        getLogger().info({ appointmentId, eventId: event.id }, '📅 Calendar event created');
        return event.id;
      }
    } catch (error) {
      getLogger().error({ appointmentId, error }, 'Failed to create calendar event');
    }

    return null;
  }

  /**
   * Notify user of confirmation
   */
  private async notifyUserOfConfirmation(
    appointmentId: string,
    request: AppointmentRequest,
    confirmationNumber: string,
    confirmedDate: Date
  ): Promise<void> {
    const dateStr = confirmedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

    const message = `✅ Your ${request.appointmentType} at ${request.businessName} is confirmed for ${dateStr}! Confirmation: ${confirmationNumber}`;

    if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
      if (request.notifyContact) {
        await sendSMS(request.notifyContact, message);
      }
    }

    if (request.notifyVia === 'email' || request.notifyVia === 'both') {
      if (request.notifyContact?.includes('@')) {
        await sendEmail(
          request.notifyContact,
          `✅ Appointment Confirmed - ${request.businessName}`,
          `${message}\n\n— Your Ferni assistant`
        );
      }
    }

    getLogger().info(
      { appointmentId, notifyVia: request.notifyVia },
      'User notified of confirmation'
    );
  }

  /**
   * Notify user of delay
   */
  private async notifyUserOfDelay(
    appointmentId: string,
    request: AppointmentRequest,
    reason: string
  ): Promise<void> {
    const message = `I'm still working on your ${request.appointmentType} appointment at ${request.businessName}. ${
      reason === 'no-answer' ? 'No answer yet' : 'Line was busy'
    } - I'll keep trying!`;

    if (request.notifyVia && request.notifyContact) {
      if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
        await sendSMS(request.notifyContact, message);
      }
    }
  }

  /**
   * Notify user of failure
   */
  private async notifyUserOfFailure(
    appointmentId: string,
    request: AppointmentRequest
  ): Promise<void> {
    const message = `I wasn't able to reach ${request.businessName} for your ${request.appointmentType} appointment. Would you like me to try again or do you want to call them directly at ${request.businessPhone}?`;

    if (request.notifyVia && request.notifyContact) {
      if (request.notifyVia === 'sms' || request.notifyVia === 'both') {
        await sendSMS(request.notifyContact, message);
      }
    }
  }

  /**
   * Parse natural language date/time into Date object
   */
  private parseRequestedDateTime(dateStr: string, timeStr: string): Date {
    const now = new Date();
    const targetDate = new Date(now);

    // Parse date
    const dateLower = dateStr.toLowerCase();
    if (dateLower.includes('tomorrow')) {
      targetDate.setDate(now.getDate() + 1);
    } else if (dateLower.includes('next week')) {
      targetDate.setDate(now.getDate() + 7);
    } else if (dateLower.includes('next')) {
      const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      for (let i = 0; i < days.length; i++) {
        if (dateLower.includes(days[i])) {
          const currentDay = now.getDay();
          const daysUntil = (i - currentDay + 7) % 7 || 7;
          targetDate.setDate(now.getDate() + daysUntil);
          break;
        }
      }
    }

    // Parse time
    const timeLower = timeStr.toLowerCase();
    const timeMatch = timeLower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
      const ampm = timeMatch[3];

      if (ampm === 'pm' && hours !== 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;

      targetDate.setHours(hours, minutes, 0, 0);
    } else {
      // Default to noon
      targetDate.setHours(12, 0, 0, 0);
    }

    return targetDate;
  }

  /**
   * Check if Twilio is configured
   */
  private isTwilioConfigured(): boolean {
    const config = getTwilioConfig();
    return !!(config.accountSid && config.authToken && config.phoneNumber);
  }

  /**
   * Get appointment status
   */
  getAppointmentStatus(appointmentId: string): TrackedAppointment | undefined {
    return getAppointmentFollowUpService().getAppointment(appointmentId);
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(appointmentId: string): Promise<boolean> {
    const followUpService = getAppointmentFollowUpService();
    const appointment = followUpService.getAppointment(appointmentId);

    if (!appointment) return false;

    followUpService.updateStatus(appointmentId, 'cancelled', {
      note: 'Cancelled by user',
    });

    this.pendingAppointments.delete(appointmentId);

    // Remove from Firestore
    void this.removePendingRequest(appointmentId);

    getLogger().info({ appointmentId }, 'Appointment cancelled');
    return true;
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let integrationService: AppointmentIntegrationService | null = null;

export function getAppointmentIntegrationService(): AppointmentIntegrationService {
  if (!integrationService) {
    integrationService = new AppointmentIntegrationService();
  }
  return integrationService;
}

export default AppointmentIntegrationService;
