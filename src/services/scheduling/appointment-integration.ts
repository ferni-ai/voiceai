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
import { getLogger } from '../../utils/safe-logger.js';
import { getAppointmentFollowUpService, type TrackedAppointment } from './appointment-followup.js';
import {
  generateAppointmentTwiML,
  getTwilioWebhookService,
  type CallTrackingEntry,
} from '../twilio-webhooks.js';
import type { AppointmentRequest, AppointmentResult } from './appointment-integration-types.js';
import {
  PENDING_REQUESTS_COLLECTION,
  getFirestore,
  removePendingRequest,
  savePendingRequest,
} from './appointment-integration-store.js';
import {
  analyzeTranscription,
  createCalendarEventForAppointment,
  getTwilioConfig,
  isTwilioConfigured,
  notifyUserOfConfirmation,
  notifyUserOfDelay,
  notifyUserOfFailure,
  parseRequestedDateTime,
} from './appointment-integration-helpers.js';

// Re-exports: moved to sibling modules, kept here for backward-compatible imports
export type { AppointmentRequest, AppointmentResult } from './appointment-integration-types.js';

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
    const parsedDate = parseRequestedDateTime(request.requestedDate, request.requestedTime);

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
    void savePendingRequest(appointmentId, request);

    // Check if Twilio is configured
    if (!isTwilioConfigured()) {
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
          const confirmedDate = parseRequestedDateTime(
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
          createCalendarEventForAppointment(appointmentId, request, confirmedDate).catch((err) =>
            getLogger().warn({ err, appointmentId }, 'Calendar event creation failed')
          );

          // Notify user (non-blocking)
          notifyUserOfConfirmation(appointmentId, request, confirmationNumber, confirmedDate).catch(
            (err) => getLogger().warn({ err, appointmentId }, 'User notification failed')
          );

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
        await notifyUserOfDelay(entry.appointmentId, request, entry.status);
      }
    } else if (entry.status === 'failed') {
      // Call failed - notify user
      followUpService.updateStatus(entry.appointmentId, 'failed', {
        note: `Call failed: ${entry.error?.message || 'Unknown error'}`,
      });

      await notifyUserOfFailure(entry.appointmentId, request);
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
    const outcome = analyzeTranscription(entry.transcription);

    const followUpService = getAppointmentFollowUpService();

    if (outcome.confirmed) {
      // Appointment confirmed!
      const confirmedDate =
        outcome.confirmedDateTime ||
        parseRequestedDateTime(request.requestedDate, request.requestedTime);

      const confirmationNumber =
        outcome.confirmationNumber || `CONF-${Date.now().toString().slice(-6)}`;

      followUpService.updateStatus(entry.appointmentId, 'confirmed', {
        confirmationNumber,
        confirmedDateTime: confirmedDate,
        note: `Confirmed via call. Business response: "${entry.transcription.slice(0, 200)}..."`,
      });

      // Create calendar event
      await createCalendarEventForAppointment(entry.appointmentId, request, confirmedDate);

      // Notify user
      await notifyUserOfConfirmation(
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
    void removePendingRequest(appointmentId);

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
