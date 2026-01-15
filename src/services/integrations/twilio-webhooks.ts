/**
 * Twilio Webhook Handlers
 *
 * Handles incoming webhooks from Twilio for:
 * - Call status updates (initiated, ringing, answered, completed)
 * - SMS delivery status
 * - Voice recording completion
 * - Voicemail transcription
 *
 * These webhooks enable real-time tracking of appointment calls
 * and communication delivery status.
 *
 * PERSISTENCE: Call tracking uses Redis for ephemeral session data.
 */

import { EventEmitter } from 'events';
import { getRedisCache } from '../../memory/redis-cache.js';
import { getLogger } from '../../utils/safe-logger.js';
import { getAppointmentFollowUpService } from './scheduling/appointment-followup.js';

// Redis TTL for call tracking (1 hour - calls should complete by then)
const CALL_TTL_SECONDS = 3600;
const SMS_TTL_SECONDS = 86400; // 24 hours for SMS status

// ============================================================================
// TYPES
// ============================================================================

export interface TwilioCallStatus {
  CallSid: string;
  AccountSid: string;
  From: string;
  To: string;
  CallStatus:
    | 'queued'
    | 'ringing'
    | 'in-progress'
    | 'completed'
    | 'busy'
    | 'failed'
    | 'no-answer'
    | 'canceled';
  CallDuration?: string;
  Direction: 'inbound' | 'outbound-api' | 'outbound-dial';
  Timestamp?: string;
  // Recording fields (if enabled)
  RecordingUrl?: string;
  RecordingSid?: string;
  RecordingDuration?: string;
  // Transcription fields
  TranscriptionText?: string;
  TranscriptionStatus?: string;
  // Error fields
  ErrorCode?: string;
  ErrorMessage?: string;
  // Answering Machine Detection
  AnsweredBy?:
    | 'human'
    | 'machine_start'
    | 'machine_end_beep'
    | 'machine_end_silence'
    | 'machine_end_other'
    | 'fax'
    | 'unknown';
}

export interface TwilioSMSStatus {
  MessageSid: string;
  AccountSid: string;
  From: string;
  To: string;
  MessageStatus:
    | 'accepted'
    | 'queued'
    | 'sending'
    | 'sent'
    | 'delivered'
    | 'undelivered'
    | 'failed';
  ErrorCode?: string;
  ErrorMessage?: string;
}

export interface CallTrackingEntry {
  callSid: string;
  appointmentId?: string;
  status: TwilioCallStatus['CallStatus'];
  to: string;
  from: string;
  startedAt: Date;
  endedAt?: Date;
  duration?: number;
  recording?: {
    url: string;
    sid: string;
    duration: number;
  };
  transcription?: string;
  answeredBy?: TwilioCallStatus['AnsweredBy'];
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// CALL TRACKING SERVICE
// ============================================================================

class TwilioWebhookService extends EventEmitter {
  // In-memory fallback for when Redis is unavailable
  private activeCallsMemory = new Map<string, CallTrackingEntry>();
  private smsStatusMemory = new Map<string, TwilioSMSStatus>();

  constructor() {
    super();
  }

  // ============================================================================
  // REDIS PERSISTENCE HELPERS
  // ============================================================================

  private async getCallFromRedis(callSid: string): Promise<CallTrackingEntry | null> {
    const redis = getRedisCache();
    if (!redis) return this.activeCallsMemory.get(callSid) || null;

    try {
      const data = await redis.get<CallTrackingEntry>(`twilio:call:${callSid}`);
      if (data) {
        // Rehydrate dates
        return {
          ...data,
          startedAt: new Date(data.startedAt),
          endedAt: data.endedAt ? new Date(data.endedAt) : undefined,
        };
      }
    } catch (error) {
      getLogger().warn({ error, callSid }, 'Redis call fetch failed');
    }
    return this.activeCallsMemory.get(callSid) || null;
  }

  private async setCallInRedis(callSid: string, entry: CallTrackingEntry): Promise<void> {
    this.activeCallsMemory.set(callSid, entry);

    const redis = getRedisCache();
    if (!redis) return;

    try {
      await redis.set(`twilio:call:${callSid}`, entry, CALL_TTL_SECONDS);
    } catch (error) {
      getLogger().warn({ error, callSid }, 'Redis call store failed');
    }
  }

  private async getSmsFromRedis(messageSid: string): Promise<TwilioSMSStatus | null> {
    const redis = getRedisCache();
    if (!redis) return this.smsStatusMemory.get(messageSid) || null;

    try {
      return await redis.get<TwilioSMSStatus>(`twilio:sms:${messageSid}`);
    } catch (error) {
      getLogger().warn({ error, messageSid }, 'Redis SMS fetch failed');
    }
    return this.smsStatusMemory.get(messageSid) || null;
  }

  private async setSmsInRedis(messageSid: string, status: TwilioSMSStatus): Promise<void> {
    this.smsStatusMemory.set(messageSid, status);

    const redis = getRedisCache();
    if (!redis) return;

    try {
      await redis.set(`twilio:sms:${messageSid}`, status, SMS_TTL_SECONDS);
    } catch (error) {
      getLogger().warn({ error, messageSid }, 'Redis SMS store failed');
    }
  }

  // ============================================================================
  // CALL TRACKING
  // ============================================================================

  /**
   * Track a new outbound call
   */
  trackCall(callSid: string, to: string, from: string, appointmentId?: string): CallTrackingEntry {
    const entry: CallTrackingEntry = {
      callSid,
      appointmentId,
      status: 'queued',
      to,
      from,
      startedAt: new Date(),
    };

    // Store in Redis (fire-and-forget)
    void this.setCallInRedis(callSid, entry);

    getLogger().info({ callSid, to, appointmentId }, '📞 Tracking new call');

    return entry;
  }

  /**
   * Handle call status webhook from Twilio
   */
  async handleCallStatus(data: TwilioCallStatus): Promise<void> {
    const { CallSid, CallStatus, CallDuration, AnsweredBy, ErrorCode, ErrorMessage } = data;

    getLogger().info({ CallSid, CallStatus, AnsweredBy }, '📞 Call status update');

    let entry = await this.getCallFromRedis(CallSid);
    if (!entry) {
      // Create entry if we don't have it (might be from a different instance)
      entry = {
        callSid: CallSid,
        status: CallStatus,
        to: data.To,
        from: data.From,
        startedAt: new Date(),
      };
    }

    entry.status = CallStatus;
    entry.answeredBy = AnsweredBy;

    if (CallDuration) {
      entry.duration = parseInt(CallDuration, 10);
    }

    if (ErrorCode) {
      entry.error = { code: ErrorCode, message: ErrorMessage || '' };
    }

    // Handle terminal states
    if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(CallStatus)) {
      entry.endedAt = new Date();
      this.handleCallComplete(entry);
    }

    // Handle answering machine detection
    if (AnsweredBy && AnsweredBy.startsWith('machine')) {
      this.handleVoicemailDetected(entry);
    }

    // Save updated entry to Redis
    void this.setCallInRedis(CallSid, entry);

    // Emit event for listeners
    this.emit('call_status', entry);
  }

  /**
   * Handle recording webhook from Twilio
   */
  async handleRecording(data: {
    CallSid: string;
    RecordingUrl: string;
    RecordingSid: string;
    RecordingDuration: string;
  }): Promise<void> {
    const entry = await this.getCallFromRedis(data.CallSid);
    if (!entry) return;

    entry.recording = {
      url: data.RecordingUrl,
      sid: data.RecordingSid,
      duration: parseInt(data.RecordingDuration, 10),
    };

    // Save updated entry
    void this.setCallInRedis(data.CallSid, entry);

    getLogger().info(
      { callSid: data.CallSid, duration: entry.recording.duration },
      '🎙️ Recording received'
    );
    this.emit('recording', entry);
  }

  /**
   * Handle transcription webhook from Twilio
   */
  async handleTranscription(data: {
    CallSid: string;
    TranscriptionText: string;
    TranscriptionStatus: string;
  }): Promise<void> {
    const entry = await this.getCallFromRedis(data.CallSid);
    if (!entry) return;

    if (data.TranscriptionStatus === 'completed') {
      entry.transcription = data.TranscriptionText;

      // Save updated entry
      void this.setCallInRedis(data.CallSid, entry);

      getLogger().info(
        { callSid: data.CallSid, text: data.TranscriptionText.slice(0, 100) },
        '📝 Transcription received'
      );
      this.emit('transcription', entry);
    }
  }

  /**
   * Handle SMS status webhook from Twilio
   */
  handleSMSStatus(data: TwilioSMSStatus): void {
    // Store in Redis
    void this.setSmsInRedis(data.MessageSid, data);

    getLogger().info(
      { MessageSid: data.MessageSid, MessageStatus: data.MessageStatus },
      '📱 SMS status update'
    );

    if (data.MessageStatus === 'failed' || data.MessageStatus === 'undelivered') {
      getLogger().error({ ...data }, '❌ SMS delivery failed');
    }

    this.emit('sms_status', data);
  }

  /**
   * Handle completed call
   */
  private handleCallComplete(entry: CallTrackingEntry): void {
    getLogger().info(
      {
        callSid: entry.callSid,
        status: entry.status,
        duration: entry.duration,
        answeredBy: entry.answeredBy,
      },
      '📞 Call completed'
    );

    // Update appointment follow-up service if this is an appointment call
    if (entry.appointmentId) {
      const followUpService = getAppointmentFollowUpService();

      if (entry.status === 'completed' && entry.answeredBy === 'human') {
        followUpService.recordCallAttempt(entry.appointmentId, 'connected');
      } else if (entry.status === 'no-answer') {
        followUpService.recordCallAttempt(entry.appointmentId, 'no_answer');
      } else if (entry.status === 'busy') {
        followUpService.recordCallAttempt(entry.appointmentId, 'busy');
      } else if (entry.answeredBy?.startsWith('machine')) {
        followUpService.recordCallAttempt(entry.appointmentId, 'voicemail');
      } else if (entry.status === 'failed') {
        followUpService.recordCallAttempt(entry.appointmentId, 'error');
      }
    }

    this.emit('call_complete', entry);
  }

  /**
   * Handle voicemail detection
   */
  private handleVoicemailDetected(entry: CallTrackingEntry): void {
    getLogger().info(
      { callSid: entry.callSid, answeredBy: entry.answeredBy },
      '📞 Voicemail detected'
    );
    this.emit('voicemail', entry);
  }

  /**
   * Get call by SID (sync - from memory cache)
   */
  getCall(callSid: string): CallTrackingEntry | undefined {
    return this.activeCallsMemory.get(callSid);
  }

  /**
   * Get call by SID (async - from Redis)
   */
  async getCallAsync(callSid: string): Promise<CallTrackingEntry | null> {
    return this.getCallFromRedis(callSid);
  }

  /**
   * Get all active calls (from memory cache)
   */
  getActiveCalls(): CallTrackingEntry[] {
    return Array.from(this.activeCallsMemory.values()).filter(
      (call) => !['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(call.status)
    );
  }

  /**
   * Get SMS status (sync - from memory cache)
   */
  getSMSStatus(messageSid: string): TwilioSMSStatus | undefined {
    return this.smsStatusMemory.get(messageSid);
  }

  /**
   * Get SMS status (async - from Redis)
   */
  async getSMSStatusAsync(messageSid: string): Promise<TwilioSMSStatus | null> {
    return this.getSmsFromRedis(messageSid);
  }

  /**
   * Clean up old entries (call this periodically)
   * Note: Redis handles TTL automatically, this cleans up memory cache
   */
  cleanup(): void {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const [sid, entry] of this.activeCallsMemory.entries()) {
      if (entry.endedAt && entry.endedAt.getTime() < oneDayAgo) {
        this.activeCallsMemory.delete(sid);
      }
    }

    // SMS status is less important, clear after an hour
    for (const [sid] of this.smsStatusMemory.entries()) {
      // Can't check time for SMS, just keep last 1000
      if (this.smsStatusMemory.size > 1000) {
        this.smsStatusMemory.delete(sid);
      }
    }
  }
}

// ============================================================================
// TWIML GENERATORS
// ============================================================================

/**
 * Generate TwiML for appointment scheduling call
 */
export function generateAppointmentTwiML(options: {
  businessName: string;
  requestedDate: string;
  requestedTime: string;
  partySize?: number;
  specialRequests?: string;
  callerName?: string;
  callbackUrl?: string;
}): string {
  const {
    businessName,
    requestedDate,
    requestedTime,
    partySize,
    specialRequests,
    callerName,
    callbackUrl,
  } = options;

  const script = [
    `Hello, I'm calling on behalf of ${callerName || 'a client'} to schedule an appointment.`,
    `We're looking for availability on ${requestedDate} around ${requestedTime}.`,
    partySize ? `This would be for ${partySize} ${partySize === 1 ? 'person' : 'people'}.` : '',
    specialRequests ? `They also mentioned: ${specialRequests}.` : '',
    `Could you please let me know what times are available?`,
    `I'll wait for your response.`,
  ]
    .filter(Boolean)
    .join(' ');

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${script}</Say>
  <Pause length="2"/>
  <Record maxLength="60" transcribe="true" ${callbackUrl ? `recordingStatusCallback="${callbackUrl}/recording" transcribeCallback="${callbackUrl}/transcription"` : ''} playBeep="false"/>
  <Say voice="Polly.Joanna">Thank you for that information. We'll follow up shortly. Goodbye!</Say>
  <Hangup/>
</Response>`;

  return twiml;
}

/**
 * Generate TwiML for a simple message delivery call
 */
export function generateMessageTwiML(message: string, voice = 'Polly.Joanna'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voice}">${message}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML for voicemail (when machine detected)
 */
export function generateVoicemailTwiML(options: {
  businessName: string;
  callbackNumber: string;
  message: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="2"/>
  <Say voice="Polly.Joanna">
    Hello, this is a message for ${options.businessName}. 
    ${options.message}
    Please call us back at ${options.callbackNumber}. 
    Thank you!
  </Say>
  <Hangup/>
</Response>`;
}

// ============================================================================
// SINGLETON
// ============================================================================

let webhookService: TwilioWebhookService | null = null;

export function getTwilioWebhookService(): TwilioWebhookService {
  if (!webhookService) {
    webhookService = new TwilioWebhookService();
  }
  return webhookService;
}

// ============================================================================
// EXPRESS ROUTE HANDLERS
// ============================================================================

/**
 * Express-compatible webhook handler for call status
 * Use: app.post('/webhooks/twilio/call-status', twilioCallStatusHandler)
 */
export function twilioCallStatusHandler(
  req: { body: TwilioCallStatus },
  res: { status: (code: number) => { send: (data: string) => void } }
): void {
  try {
    void getTwilioWebhookService().handleCallStatus(req.body);
    res.status(200).send('<Response></Response>');
  } catch (error) {
    getLogger().error({ error }, 'Error handling call status webhook');
    res.status(500).send('Error');
  }
}

/**
 * Express-compatible webhook handler for SMS status
 */
export function twilioSMSStatusHandler(
  req: { body: TwilioSMSStatus },
  res: { status: (code: number) => { send: (data: string) => void } }
): void {
  try {
    getTwilioWebhookService().handleSMSStatus(req.body);
    res.status(200).send('<Response></Response>');
  } catch (error) {
    getLogger().error({ error }, 'Error handling SMS status webhook');
    res.status(500).send('Error');
  }
}

/**
 * Express-compatible webhook handler for recordings
 */
export function twilioRecordingHandler(
  req: {
    body: {
      CallSid: string;
      RecordingUrl: string;
      RecordingSid: string;
      RecordingDuration: string;
    };
  },
  res: { status: (code: number) => { send: (data: string) => void } }
): void {
  try {
    void getTwilioWebhookService().handleRecording(req.body);
    res.status(200).send('<Response></Response>');
  } catch (error) {
    getLogger().error({ error }, 'Error handling recording webhook');
    res.status(500).send('Error');
  }
}

/**
 * Express-compatible webhook handler for transcriptions
 */
export function twilioTranscriptionHandler(
  req: { body: { CallSid: string; TranscriptionText: string; TranscriptionStatus: string } },
  res: { status: (code: number) => { send: (data: string) => void } }
): void {
  try {
    void getTwilioWebhookService().handleTranscription(req.body);
    res.status(200).send('<Response></Response>');
  } catch (error) {
    getLogger().error({ error }, 'Error handling transcription webhook');
    res.status(500).send('Error');
  }
}

export default TwilioWebhookService;
