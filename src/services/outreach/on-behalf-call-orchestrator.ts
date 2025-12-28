/**
 * On-Behalf Call Orchestrator
 *
 * Orchestrates phone calls made ON BEHALF of users to third parties.
 * Handles the full lifecycle: room creation, agent spawning, Twilio bridging,
 * and result capture.
 *
 * @module services/outreach/on-behalf-call-orchestrator
 */

import { EventEmitter } from 'events';
import { getLogger } from '../../utils/safe-logger.js';
import type {
  OnBehalfCallRequest,
  CallOutcome,
  ResolvedContact,
} from '../../tools/domains/telephony/call-on-behalf.js';
import { selectScript, buildCallScript } from '../../tools/domains/telephony/scripts/index.js';
import {
  checkCallCompliance,
  generateComplianceScript,
} from '../../tools/domains/telephony/compliance.js';
import { trackOutboundCall } from '../../servers/api/routes/twilio-call-status.js';
import { enrichMessage, enrichVoicemailMessage } from './message-enrichment.js';
import type { EnrichedMessage, EnrichmentContext } from './message-enrichment.js';

const log = getLogger().child({ service: 'on-behalf-call-orchestrator' });

// ============================================================================
// TYPES
// ============================================================================

export type OnBehalfCallStatus =
  | 'pending' // Waiting to start
  | 'initiating' // Starting the call
  | 'ringing' // Phone is ringing
  | 'answered' // Recipient answered
  | 'in_progress' // Conversation happening
  | 'wrapping_up' // Ending conversation
  | 'completed' // Call finished successfully
  | 'voicemail' // Hit voicemail
  | 'no_answer' // No one picked up
  | 'busy' // Line busy
  | 'failed'; // Call failed

export interface OnBehalfCall {
  id: string;
  request: OnBehalfCallRequest;
  status: OnBehalfCallStatus;

  // Call metadata
  script: string;
  complianceScript: string;
  enrichedMessage?: EnrichedMessage;

  // Twilio data
  twilioCallSid?: string;

  // LiveKit data
  livekitRoomName?: string;
  agentParticipantId?: string;

  // Timing
  createdAt: Date;
  initiatedAt?: Date;
  answeredAt?: Date;
  completedAt?: Date;

  // Outcome
  outcome?: CallOutcome;
}

export interface OnBehalfCallConfig {
  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;

  // LiveKit
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  sipTrunkId?: string;

  // Call settings
  maxRingSeconds: number;
  voicemailDetectionEnabled: boolean;
  maxCallDurationMinutes: number;

  // Callbacks
  webhookBaseUrl: string;
}

// ============================================================================
// STORAGE
// ============================================================================

const activeCallsStore = new Map<string, OnBehalfCall>();
const callContextStore = new Map<string, OnBehalfCallRequest>();

// ============================================================================
// ORCHESTRATOR
// ============================================================================

class OnBehalfCallOrchestrator extends EventEmitter {
  private config: OnBehalfCallConfig;

  constructor(config: Partial<OnBehalfCallConfig> = {}) {
    super();

    this.config = {
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      livekitUrl: process.env.LIVEKIT_URL || '',
      livekitApiKey: process.env.LIVEKIT_API_KEY || '',
      livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
      sipTrunkId: process.env.SIP_TRUNK_ID || '',
      webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
      maxRingSeconds: 30,
      voicemailDetectionEnabled: true,
      maxCallDurationMinutes: 15,
      ...config,
    };

    log.info('On-behalf call orchestrator initialized');
  }

  // =========================================================================
  // CALL INITIATION
  // =========================================================================

  /**
   * Initiate a call on behalf of the user
   */
  async initiateCall(request: OnBehalfCallRequest): Promise<string> {
    const callId = `onbehalf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    log.info(
      {
        callId,
        userId: request.userId,
        contactName: request.resolvedContact?.name,
        purpose: request.purpose,
        callType: request.callType,
      },
      'Initiating on-behalf call'
    );

    // Validate contact
    if (!request.resolvedContact?.phone) {
      throw new Error('No phone number available for contact');
    }

    const contact = request.resolvedContact;

    // ==========================================================================
    // MESSAGE ENRICHMENT - "Better Than Human"
    // Transform short requests like "say good morning" into warm, natural messages
    // ==========================================================================
    let enrichedMessage: EnrichedMessage | undefined;

    // Only enrich for personal calls with brief purposes
    if (request.callType === 'personal' && this.shouldEnrichMessage(request.purpose)) {
      log.info({ purpose: request.purpose }, 'Enriching message for better-than-human delivery');

      const enrichmentContext: EnrichmentContext = {
        originalMessage: request.purpose,
        relationship: {
          contactName: contact.name,
          relationship: contact.relationship || 'friend',
        },
        sender: {
          userName: request.userName,
        },
        settings: {
          isVoicemail: false,
          maxLength: 'medium',
        },
      };

      enrichedMessage = await enrichMessage(enrichmentContext);
      log.info(
        {
          original: request.purpose,
          enriched: enrichedMessage.message.slice(0, 100) + '...',
          type: enrichedMessage.metadata.enrichmentType,
        },
        'Message enriched successfully'
      );
    }

    // Build script with enriched or original purpose
    const effectivePurpose = enrichedMessage?.message || request.purpose;
    const { script: scriptTemplate, type: scriptType } = selectScript(contact, effectivePurpose);

    const script = buildCallScript(scriptTemplate, {
      agentName: 'Ferni',
      userName: request.userName,
      contactName: contact.name,
      purpose: effectivePurpose,
      objective: request.objective,
      additionalContext: request.userPreferences?.additionalContext,
      preferredTimes: request.userPreferences?.preferredTimes,
    });

    // Check compliance
    const compliance = checkCallCompliance(request);
    const complianceScript = generateComplianceScript(request, compliance);

    // Create call record
    const call: OnBehalfCall = {
      id: callId,
      request,
      status: 'pending',
      script,
      complianceScript,
      enrichedMessage,
      createdAt: new Date(),
    };

    activeCallsStore.set(callId, call);

    // Store context for the agent to access
    callContextStore.set(callId, request);

    try {
      // Step 1: Create LiveKit room
      const roomName = await this.createLiveKitRoom(callId, request, script);
      call.livekitRoomName = roomName;

      // Step 2: Spawn agent into the room
      await this.spawnOnBehalfAgent(roomName, callId, request, script);

      // Step 3: Initiate Twilio call
      call.status = 'initiating';
      call.initiatedAt = new Date();
      const { callSid } = await this.initiateTwilioCall(callId, request, roomName);
      call.twilioCallSid = callSid;
      call.status = 'ringing';

      activeCallsStore.set(callId, call);
      this.emit('call-initiated', call);

      log.info({ callId, roomName, callSid, scriptType }, 'On-behalf call initiated successfully');

      return callId;
    } catch (error) {
      call.status = 'failed';
      log.error({ error: String(error), callId }, 'Failed to initiate on-behalf call');
      this.emit('call-failed', call, error);
      throw error;
    }
  }

  // =========================================================================
  // LIVEKIT ROOM MANAGEMENT
  // =========================================================================

  private async createLiveKitRoom(
    callId: string,
    request: OnBehalfCallRequest,
    script: string
  ): Promise<string> {
    const roomName = `onbehalf-${callId}`;

    // Store rich metadata for the agent
    const metadata = JSON.stringify({
      type: 'on_behalf_call',
      callId,
      originalSessionId: request.originalSessionId,
      userId: request.userId,
      userName: request.userName,
      contact: {
        name: request.resolvedContact?.name,
        relationship: request.resolvedContact?.relationship,
      },
      purpose: request.purpose,
      objective: request.objective,
      callType: request.callType,
      scriptPreview: script.slice(0, 500), // First 500 chars for quick reference
    });

    try {
      const { RoomServiceClient } = await import('livekit-server-sdk');

      const roomService = new RoomServiceClient(
        this.config.livekitUrl,
        this.config.livekitApiKey,
        this.config.livekitApiSecret
      );

      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 3, // Agent, phone participant, possible observer
        metadata,
      });

      log.debug({ roomName, callId }, 'Created LiveKit room for on-behalf call');
      return roomName;
    } catch (error) {
      log.error({ error, roomName }, 'Failed to create LiveKit room');
      throw error;
    }
  }

  private async spawnOnBehalfAgent(
    roomName: string,
    callId: string,
    request: OnBehalfCallRequest,
    script: string
  ): Promise<void> {
    log.info(
      { roomName, callId, contactName: request.resolvedContact?.name },
      'Spawning on-behalf agent'
    );

    // Emit event for the agent dispatcher to handle
    // The voice-agent-entry will pick this up and join with on-behalf context
    this.emit('agent-join-requested', {
      roomName,
      callId,
      agentType: 'on-behalf-caller',
      userId: request.userId,
      metadata: {
        callId,
        purpose: request.purpose,
        callType: request.callType,
        contactName: request.resolvedContact?.name,
        script,
      },
    });
  }

  // =========================================================================
  // TWILIO CALL MANAGEMENT
  // =========================================================================

  private async initiateTwilioCall(
    callId: string,
    request: OnBehalfCallRequest,
    roomName: string
  ): Promise<{ callSid: string }> {
    const contact = request.resolvedContact!;

    // Normalize phone number
    const cleanPhone = contact.phone.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    // Generate TwiML for SIP bridge
    const twiml = this.generateSipBridgeTwiml(roomName);

    log.debug({ callId, to: this.maskPhone(e164Phone), roomName }, 'Initiating Twilio call');

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: e164Phone,
          From: this.config.twilioPhoneNumber,
          Twiml: twiml,
          // Use the centralized Twilio webhook handler
          StatusCallback: `${this.config.webhookBaseUrl}/api/webhooks/call-status`,
          StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
          StatusCallbackMethod: 'POST',
          MachineDetection: this.config.voicemailDetectionEnabled ? 'DetectMessageEnd' : 'Enable',
          MachineDetectionTimeout: '5',
          Timeout: this.config.maxRingSeconds.toString(),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Twilio error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as { sid: string };

    // Track the call so the webhook handler can link Twilio CallSid to our context
    trackOutboundCall(data.sid, {
      callId,
      userId: request.userId,
      contactName: request.resolvedContact?.name || 'Unknown',
      purpose: request.purpose,
      objective: request.objective,
      callType: request.callType,
      originalSessionId: request.originalSessionId,
      startedAt: new Date().toISOString(),
    });

    return { callSid: data.sid };
  }

  private generateSipBridgeTwiml(roomName: string): string {
    if (this.config.sipTrunkId && this.config.livekitUrl) {
      // Full SIP integration
      const sipUri = `sip:${roomName}@${new URL(this.config.livekitUrl).hostname}`;

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" callerId="${this.config.twilioPhoneNumber}">
    <Sip>${sipUri}</Sip>
  </Dial>
</Response>`;
    }

    // Fallback: Use WebSocket stream
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${new URL(this.config.livekitUrl).hostname}/twilio/${roomName}" />
  </Connect>
</Response>`;
  }

  // =========================================================================
  // STATUS CALLBACKS
  // =========================================================================

  /**
   * Handle Twilio status callback
   */
  async handleStatusCallback(
    callId: string,
    status: string,
    twilioData: Record<string, unknown>
  ): Promise<void> {
    const call = activeCallsStore.get(callId);
    if (!call) {
      log.warn({ callId }, 'Status callback for unknown on-behalf call');
      return;
    }

    log.debug({ callId, status }, 'On-behalf call status update');

    switch (status) {
      case 'ringing':
        call.status = 'ringing';
        this.emit('call-ringing', call);
        break;

      case 'in-progress':
      case 'answered':
        call.status = 'answered';
        call.answeredAt = new Date();
        this.emit('call-answered', call);
        break;

      case 'completed':
        call.status = 'completed';
        call.completedAt = new Date();
        await this.completeCall(call);
        break;

      case 'busy':
        call.status = 'busy';
        await this.completeCall(call);
        break;

      case 'no-answer':
        call.status = 'no_answer';
        await this.completeCall(call);
        break;

      case 'canceled':
      case 'failed':
        call.status = 'failed';
        await this.completeCall(call);
        break;
    }

    activeCallsStore.set(callId, call);
  }

  /**
   * Handle machine detection (voicemail)
   */
  async handleMachineDetection(callId: string, machineResult: string): Promise<string | null> {
    const call = activeCallsStore.get(callId);
    if (!call) {
      return null;
    }

    log.info({ callId, machineResult }, 'Machine detection result for on-behalf call');

    if (machineResult === 'human') {
      return null; // Continue with conversation
    }

    if (machineResult.startsWith('machine_')) {
      call.status = 'voicemail';
      activeCallsStore.set(callId, call);

      // Generate enriched voicemail message (async for LLM enrichment)
      const voicemailMessage = await this.generateVoicemailMessageAsync(call);

      this.emit('voicemail-detected', call);

      return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${this.escapeXml(voicemailMessage)}</Say>
</Response>`;
    }

    return null;
  }

  /**
   * Generate voicemail message with "Better Than Human" enrichment
   *
   * Instead of a robotic template, we generate a warm, natural message
   * that sounds like it came from someone who truly cares.
   */
  private async generateVoicemailMessageAsync(call: OnBehalfCall): Promise<string> {
    const contact = call.request.resolvedContact!;

    // If we already have an enriched message with components, use those
    if (call.enrichedMessage?.components) {
      const { opening, personalContext, mainMessage, close } = call.enrichedMessage.components;
      const parts = [opening];
      if (personalContext) parts.push(personalContext);
      parts.push(mainMessage);
      parts.push(close);
      return parts.join(' ');
    }

    // Otherwise, enrich specifically for voicemail
    try {
      const enrichmentContext: EnrichmentContext = {
        originalMessage: call.request.purpose,
        relationship: {
          contactName: contact.name,
          relationship: contact.relationship || 'friend',
        },
        sender: {
          userName: call.request.userName,
        },
        settings: {
          isVoicemail: true,
          maxLength: 'medium',
        },
      };

      const enrichedVoicemail = await enrichVoicemailMessage(enrichmentContext);
      return enrichedVoicemail.message;
    } catch (error) {
      log.warn({ error: String(error) }, 'Voicemail enrichment failed, using fallback');
      return this.generateVoicemailMessageFallback(call);
    }
  }

  /**
   * Fallback voicemail for when enrichment fails
   * Still warmer than the old template, but doesn't require LLM
   */
  private generateVoicemailMessageFallback(call: OnBehalfCall): string {
    const contact = call.request.resolvedContact!;
    const purpose = call.request.purpose;
    const userName = call.request.userName;

    // Determine relationship depth for tone
    const relationship = (contact.relationship || '').toLowerCase();
    const isClose = [
      'mother',
      'mom',
      'father',
      'dad',
      'spouse',
      'wife',
      'husband',
      'partner',
    ].includes(relationship);

    if (isClose) {
      return (
        `Hey ${contact.name}, it's Ferni calling for ${userName}. ` +
        `${userName} wanted me to ${purpose}... ` +
        `Just know they're thinking of you. ` +
        `Love you. Bye.`
      );
    }

    return (
      `Hi ${contact.name}, this is Ferni, calling on behalf of ${userName}. ` +
      `${userName} wanted me to ${purpose}. ` +
      `They wanted to make sure you got this message. ` +
      `Take care, and talk soon.`
    );
  }

  /**
   * Sync wrapper for compatibility - fires async enrichment
   */
  private generateVoicemailMessage(call: OnBehalfCall): string {
    // For now, use fallback synchronously
    // The async version will be used when we refactor the voicemail detection flow
    return this.generateVoicemailMessageFallback(call);
  }

  // =========================================================================
  // CALL COMPLETION
  // =========================================================================

  private async completeCall(call: OnBehalfCall): Promise<void> {
    log.info(
      {
        callId: call.id,
        status: call.status,
        contactName: call.request.resolvedContact?.name,
      },
      'On-behalf call completed'
    );

    // Notify the original session
    await this.notifyOriginalSession(call);

    // Clean up
    callContextStore.delete(call.id);
    activeCallsStore.delete(call.id);

    this.emit('call-completed', call);
  }

  private async notifyOriginalSession(call: OnBehalfCall): Promise<void> {
    try {
      // Dynamic import to avoid circular dependencies
      const { captureCallResult } = await import('./call-result-capture.js');

      const outcome: CallOutcome = {
        callId: call.id,
        status: call.status as CallOutcome['status'],
        objectiveAchieved: call.status === 'completed',
        outcome: this.generateOutcomeSummary(call),
        callbackRequired: call.status === 'no_answer' || call.status === 'busy',
      };

      await captureCallResult(call.id, outcome, call.request);

      log.info({ callId: call.id }, 'Notified original session of call result');
    } catch (error) {
      log.error({ error: String(error), callId: call.id }, 'Failed to notify original session');
    }
  }

  private generateOutcomeSummary(call: OnBehalfCall): string {
    const contact = call.request.resolvedContact!;

    switch (call.status) {
      case 'completed':
        return `Successfully called ${contact.name} about ${call.request.purpose}.`;
      case 'voicemail':
        return `Left a voicemail for ${contact.name} about ${call.request.purpose}.`;
      case 'no_answer':
        return `${contact.name} didn't answer. Would you like me to try again later?`;
      case 'busy':
        return `${contact.name}'s line was busy. Should I try again?`;
      case 'failed':
        return `Couldn't reach ${contact.name}. Would you like me to try a different number?`;
      default:
        return `Call to ${contact.name} ended.`;
    }
  }

  // =========================================================================
  // QUERIES
  // =========================================================================

  /**
   * Get an active call by ID
   */
  getActiveCall(callId: string): OnBehalfCall | undefined {
    return activeCallsStore.get(callId);
  }

  /**
   * Get call context for the agent
   */
  getCallContext(callId: string): OnBehalfCallRequest | undefined {
    return callContextStore.get(callId);
  }

  /**
   * Check if the service is configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.twilioAccountSid &&
      this.config.twilioAuthToken &&
      this.config.twilioPhoneNumber &&
      this.config.livekitUrl
    );
  }

  // =========================================================================
  // HELPERS
  // =========================================================================

  /**
   * Determine if a message purpose should be enriched via LLM
   *
   * We enrich brief, simple messages that would benefit from expansion.
   * We skip enrichment for:
   * - Already detailed messages (50+ words)
   * - Specific business requests (reschedule, cancel, etc.)
   * - Messages with technical/appointment details
   */
  private shouldEnrichMessage(purpose: string): boolean {
    const wordCount = purpose.split(/\s+/).length;

    // Already detailed enough
    if (wordCount > 25) return false;

    // Check for brief personal messages that need enrichment
    const enrichmentTriggers = [
      /^say\s+(good\s*)?(morning|night|hi|hello|goodbye|bye)/i,
      /^(wish|tell|let)\s+(them|her|him)\s/i,
      /thinking\s*of\s*(you|them|her|him)/i,
      /^check\s*in/i,
      /^just\s+say\s+/i,
      /^(say|tell)\s+(that\s+)?i\s+(love|miss|care)/i,
      /good\s*(morning|night|evening|afternoon)/i,
      /miss\s*(you|them|her|him)/i,
      /love\s*(you|them|her|him)/i,
    ];

    const needsEnrichment = enrichmentTriggers.some((pattern) => pattern.test(purpose));

    // Also enrich very short messages (less than 8 words)
    if (wordCount < 8 && !this.isBusinessPurpose(purpose)) {
      return true;
    }

    return needsEnrichment;
  }

  /**
   * Check if purpose sounds like a business/transactional request
   * (these should NOT be enriched)
   */
  private isBusinessPurpose(purpose: string): boolean {
    const businessPatterns = [
      /reschedule/i,
      /cancel/i,
      /appointment/i,
      /confirm/i,
      /reservation/i,
      /schedule/i,
      /book\s+a/i,
      /order/i,
      /delivery/i,
      /prescription/i,
      /refill/i,
    ];
    return businessPatterns.some((pattern) => pattern.test(purpose));
  }

  private maskPhone(phone: string): string {
    return phone.replace(/.(?=.{4})/g, '*');
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let orchestratorInstance: OnBehalfCallOrchestrator | null = null;

export function getOnBehalfCallOrchestrator(
  config?: Partial<OnBehalfCallConfig>
): OnBehalfCallOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new OnBehalfCallOrchestrator(config);
  }
  return orchestratorInstance;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Types are already exported inline above (lines 30, 43, 69)
