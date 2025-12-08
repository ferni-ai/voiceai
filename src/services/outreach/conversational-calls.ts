// @ts-nocheck
/**
 * Conversational Outbound Calls
 *
 * The Big Idea: Instead of playing a pre-recorded message, the agent calls
 * and has a REAL conversation via LiveKit.
 *
 * Flow:
 * 1. Twilio initiates outbound call to user's phone
 * 2. When answered, Twilio bridges to LiveKit SIP
 * 3. LiveKit agent joins with full context about why we're calling
 * 4. Real conversation happens
 * 5. Graceful handling of voicemail, "bad timing", etc.
 *
 * This is what makes Ferni feel like a real friend calling, not a robocall.
 */

import { getLogger } from '../../utils/safe-logger.js';
import { EventEmitter } from 'events';
import type { AgentId } from '../agent-bus.js';
import type { OutreachTriggerType } from './decision-engine.js';

// ============================================================================
// TYPES
// ============================================================================

export type CallStatus =
  | 'initiating' // Starting the call
  | 'ringing' // Phone is ringing
  | 'answered' // User answered
  | 'voicemail' // Hit voicemail
  | 'conversation' // Active conversation
  | 'wrapping_up' // Ending conversation
  | 'completed' // Call finished
  | 'failed' // Call failed
  | 'no_answer' // No one picked up
  | 'busy' // Line busy
  | 'rejected'; // User rejected

export interface OutboundCallContext {
  // Why are we calling?
  trigger: {
    id: string;
    type: OutreachTriggerType;
    reason: string;
    urgency: 'low' | 'medium' | 'high' | 'urgent';
  };

  // Who are we calling?
  user: {
    id: string;
    name: string;
    preferredName?: string;
    phone: string;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    timezone?: string;
    localTime?: string;
  };

  // What do we know about them?
  context: {
    lastConversationSummary?: string;
    activeCommitments?: string[];
    recentWins?: string[];
    recentStruggles?: string[];
    upcomingEvents?: string[];
    emotionalState?: string;
    insideJokes?: string[];
    avoidTopics?: string[];
  };

  // How should we approach this?
  approach: {
    tone: 'celebratory' | 'supportive' | 'accountability' | 'casual' | 'urgent';
    primaryGoal: string;
    secondaryGoals?: string[];
    maxDuration?: number; // minutes
  };

  // Who's calling
  persona: AgentId;
}

export interface OutboundCall {
  id: string;
  context: OutboundCallContext;
  status: CallStatus;

  // Twilio data
  twilioCallSid?: string;

  // LiveKit data
  livekitRoomName?: string;
  livekitParticipantId?: string;

  // Timing
  initiatedAt: Date;
  answeredAt?: Date;
  completedAt?: Date;

  // Results
  conversationSummary?: string;
  followUpActions?: string[];
  userMood?: string;
  callDurationSeconds?: number;

  // Voicemail
  voicemailLeft?: boolean;
  voicemailMessage?: string;
}

export interface ConversationalCallConfig {
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
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: Partial<ConversationalCallConfig> = {
  maxRingSeconds: 30,
  voicemailDetectionEnabled: true,
  maxCallDurationMinutes: 15,
};

// ============================================================================
// STORAGE
// ============================================================================

const activeCallsStore = new Map<string, OutboundCall>();
const callHistoryStore = new Map<string, OutboundCall[]>(); // userId -> calls

// ============================================================================
// CONVERSATIONAL CALL SERVICE
// ============================================================================

const log = getLogger().child({ service: 'conversational-calls' });

class ConversationalCallService extends EventEmitter {
  private config: ConversationalCallConfig;

  constructor(config: Partial<ConversationalCallConfig>) {
    super();

    // Merge with defaults and env vars
    this.config = {
      ...DEFAULT_CONFIG,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
      twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER || '',
      livekitUrl: process.env.LIVEKIT_URL || '',
      livekitApiKey: process.env.LIVEKIT_API_KEY || '',
      livekitApiSecret: process.env.LIVEKIT_API_SECRET || '',
      sipTrunkId: process.env.SIP_TRUNK_ID || '',
      webhookBaseUrl: process.env.WEBHOOK_BASE_URL || '',
      ...config,
    } as ConversationalCallConfig;

    log.info('📞 Conversational Call Service created');
  }

  // ============================================================================
  // CALL INITIATION
  // ============================================================================

  /**
   * Initiate an outbound conversational call
   *
   * This will:
   * 1. Create a LiveKit room for the conversation
   * 2. Initiate Twilio call to user
   * 3. Bridge to LiveKit when answered
   * 4. Join persona agent to the room
   */
  async initiateCall(context: OutboundCallContext): Promise<OutboundCall> {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    log.info(
      {
        callId,
        userId: context.user.id,
        phone: this.sanitizePhone(context.user.phone),
        persona: context.persona,
        triggerType: context.trigger.type,
      },
      '📞 Initiating conversational call'
    );

    const call: OutboundCall = {
      id: callId,
      context,
      status: 'initiating',
      initiatedAt: new Date(),
    };

    activeCallsStore.set(callId, call);

    try {
      // Step 1: Validate configuration
      if (!this.isConfigured()) {
        throw new Error('Twilio or LiveKit not configured');
      }

      // Step 2: Create LiveKit room for this call
      const roomName = await this.createLiveKitRoom(callId, context);
      call.livekitRoomName = roomName;

      // Step 3: Initiate Twilio call
      const { callSid } = await this.initiateTwilioCall(callId, context);
      call.twilioCallSid = callSid;
      call.status = 'ringing';

      this.emit('call-initiated', call);
      log.info({ callId, callSid, roomName }, '✅ Call initiated');

      return call;
    } catch (error) {
      call.status = 'failed';
      log.error({ error, callId }, '❌ Failed to initiate call');
      this.emit('call-failed', call, error);
      throw error;
    }
  }

  /**
   * Check if the service is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.twilioAccountSid &&
      this.config.twilioAuthToken &&
      this.config.twilioPhoneNumber &&
      this.config.livekitUrl
    );
  }

  // ============================================================================
  // LIVEKIT ROOM MANAGEMENT
  // ============================================================================

  /**
   * Create a LiveKit room for the call
   */
  private async createLiveKitRoom(
    callId: string,
    context: OutboundCallContext
  ): Promise<string> {
    const roomName = `outbound-${callId}`;

    // Store context in room metadata for the agent to access
    const metadata = JSON.stringify({
      type: 'outbound_call',
      callId,
      trigger: context.trigger,
      user: {
        id: context.user.id,
        name: context.user.name,
        preferredName: context.user.preferredName,
        relationshipStage: context.user.relationshipStage,
      },
      context: context.context,
      approach: context.approach,
      persona: context.persona,
    });

    try {
      // Create room via LiveKit API
      const { RoomServiceClient } = await import('livekit-server-sdk');

      const roomService = new RoomServiceClient(
        this.config.livekitUrl,
        this.config.livekitApiKey,
        this.config.livekitApiSecret
      );

      await roomService.createRoom({
        name: roomName,
        emptyTimeout: 300, // 5 minutes
        maxParticipants: 3, // Agent, user, possible observer
        metadata,
      });

      log.debug({ roomName, callId }, 'Created LiveKit room');
      return roomName;
    } catch (error) {
      log.error({ error, roomName }, 'Failed to create LiveKit room');
      throw error;
    }
  }

  /**
   * Join the persona agent to the call
   */
  private async joinAgentToRoom(
    roomName: string,
    context: OutboundCallContext
  ): Promise<void> {
    // This would dispatch to your agent service to join
    // The agent joins with full context about the call

    log.info(
      { roomName, persona: context.persona },
      '🤖 Agent joining call'
    );

    // Emit event for agent dispatcher to handle
    this.emit('agent-join-requested', {
      roomName,
      persona: context.persona,
      context,
    });
  }

  // ============================================================================
  // TWILIO CALL MANAGEMENT
  // ============================================================================

  /**
   * Initiate the Twilio call
   */
  private async initiateTwilioCall(
    callId: string,
    context: OutboundCallContext
  ): Promise<{ callSid: string }> {
    // Clean phone number
    const cleanPhone = context.user.phone.replace(/\D/g, '');
    const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

    // Generate TwiML that will bridge to LiveKit when answered
    const twiml = this.generateAnswerTwiml(callId, context);

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
          StatusCallback: `${this.config.webhookBaseUrl}/api/outbound-call/status/${callId}`,
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
    return { callSid: data.sid };
  }

  /**
   * Generate TwiML for when call is answered
   */
  private generateAnswerTwiml(callId: string, context: OutboundCallContext): string {
    // When answered, dial into LiveKit SIP
    const roomName = `outbound-${callId}`;

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

    // Fallback: Use TwiML with conference and stream
    // This connects Twilio to a conference that LiveKit agent can join
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://${new URL(this.config.livekitUrl).hostname}/twilio/${roomName}" />
  </Connect>
</Response>`;
  }

  /**
   * Generate TwiML for voicemail
   */
  private generateVoicemailTwiml(
    context: OutboundCallContext,
    voicemailMessage: string
  ): string {
    // Use persona's voice via Cartesia TTS if available
    // Otherwise fall back to Twilio's built-in voice
    const voiceId = this.getVoiceForPersona(context.persona);

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${voiceId}">${this.escapeXml(voicemailMessage)}</Say>
</Response>`;
  }

  private getVoiceForPersona(persona: AgentId): string {
    // Map personas to Twilio voices (fallback when Cartesia not available)
    const voiceMap: Record<string, string> = {
      ferni: 'Polly.Joanna',
      'maya-santos': 'Polly.Joanna',
      'peter-john': 'Polly.Matthew',
      'alex-chen': 'Polly.Matthew',
      'jordan-taylor': 'Polly.Joanna',
      nayan: 'Polly.Matthew',
    };

    return voiceMap[persona] || 'Polly.Joanna';
  }

  // ============================================================================
  // WEBHOOK HANDLERS
  // ============================================================================

  /**
   * Handle Twilio status callback
   */
  async handleStatusCallback(
    callId: string,
    status: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    twilioData: Record<string, any>
  ): Promise<void> {
    const call = activeCallsStore.get(callId);
    if (!call) {
      log.warn({ callId }, 'Status callback for unknown call');
      return;
    }

    log.debug({ callId, status, twilioData }, 'Call status update');

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

        // Join the agent to the room
        if (call.livekitRoomName) {
          await this.joinAgentToRoom(call.livekitRoomName, call.context);
        }
        break;

      case 'completed':
        call.status = 'completed';
        call.completedAt = new Date();
        if (call.answeredAt) {
          call.callDurationSeconds = Math.floor(
            (call.completedAt.getTime() - call.answeredAt.getTime()) / 1000
          );
        }
        this.completeCall(call);
        break;

      case 'busy':
        call.status = 'busy';
        this.completeCall(call);
        break;

      case 'no-answer':
        call.status = 'no_answer';
        this.completeCall(call);
        break;

      case 'canceled':
      case 'failed':
        call.status = 'failed';
        this.completeCall(call);
        break;
    }

    activeCallsStore.set(callId, call);
  }

  /**
   * Handle machine detection (voicemail)
   */
  async handleMachineDetection(
    callId: string,
    machineResult: 'human' | 'machine_start' | 'machine_end_beep' | 'machine_end_silence' | 'machine_end_other' | 'fax' | 'unknown'
  ): Promise<string | null> {
    const call = activeCallsStore.get(callId);
    if (!call) {
      return null;
    }

    log.info({ callId, machineResult }, 'Machine detection result');

    if (machineResult === 'human') {
      // Great! Proceed with conversation
      return null;
    }

    if (machineResult.startsWith('machine_')) {
      // It's voicemail - leave a message
      call.status = 'voicemail';
      call.voicemailLeft = true;

      // Generate voicemail message in persona voice
      const { generateVoicemailMessage } = await import('./persona-voice-generator.js');
      const voicemailMessage = generateVoicemailMessage(
        call.context.persona,
        {
          userId: call.context.user.id,
          userName: call.context.user.name,
          preferredName: call.context.user.preferredName,
          relationshipStage: call.context.user.relationshipStage,
          trigger: call.context.trigger,
          context: call.context.context,
        },
        call.context.approach.tone as 'celebratory' | 'supportive' | 'encouraging' | 'casual' | 'informative' | 'urgent'
      );

      call.voicemailMessage = voicemailMessage;
      activeCallsStore.set(callId, call);

      this.emit('voicemail-detected', call);

      return this.generateVoicemailTwiml(call.context, voicemailMessage);
    }

    return null;
  }

  // ============================================================================
  // CALL COMPLETION
  // ============================================================================

  /**
   * Complete a call and clean up
   */
  private completeCall(call: OutboundCall): void {
    // Move to history
    const history = callHistoryStore.get(call.context.user.id) || [];
    history.push(call);
    callHistoryStore.set(call.context.user.id, history);

    // Remove from active
    activeCallsStore.delete(call.id);

    log.info(
      {
        callId: call.id,
        status: call.status,
        duration: call.callDurationSeconds,
        voicemailLeft: call.voicemailLeft,
      },
      '📞 Call completed'
    );

    this.emit('call-completed', call);
  }

  /**
   * End an active call
   */
  async endCall(callId: string, reason?: string): Promise<void> {
    const call = activeCallsStore.get(callId);
    if (!call || !call.twilioCallSid) {
      return;
    }

    log.info({ callId, reason }, 'Ending call');

    try {
      await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.config.twilioAccountSid}/Calls/${call.twilioCallSid}.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            Status: 'completed',
          }),
        }
      );
    } catch (error) {
      log.error({ error, callId }, 'Failed to end call via Twilio');
    }
  }

  // ============================================================================
  // QUERIES
  // ============================================================================

  /**
   * Get an active call by ID
   */
  getActiveCall(callId: string): OutboundCall | undefined {
    return activeCallsStore.get(callId);
  }

  /**
   * Get all active calls
   */
  getActiveCalls(): OutboundCall[] {
    return Array.from(activeCallsStore.values());
  }

  /**
   * Get call history for a user
   */
  getCallHistory(userId: string, limit = 20): OutboundCall[] {
    const history = callHistoryStore.get(userId) || [];
    return history.slice(-limit);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private sanitizePhone(phone: string): string {
    // Return masked phone for logging
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

let serviceInstance: ConversationalCallService | null = null;

export function getConversationalCallService(
  config?: Partial<ConversationalCallConfig>
): ConversationalCallService {
  if (!serviceInstance) {
    serviceInstance = new ConversationalCallService(config || {});
  }
  return serviceInstance;
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Make a conversational outbound call
 *
 * @example
 * ```typescript
 * const call = await makeConversationalCall({
 *   trigger: {
 *     id: 'trigger_123',
 *     type: 'commitment_check',
 *     reason: 'User committed to working out',
 *     urgency: 'medium',
 *   },
 *   user: {
 *     id: 'user_456',
 *     name: 'Sarah',
 *     phone: '+15551234567',
 *     relationshipStage: 'established',
 *   },
 *   context: {
 *     activeCommitments: ['morning workout'],
 *   },
 *   approach: {
 *     tone: 'encouraging',
 *     primaryGoal: 'Check in on workout commitment',
 *   },
 *   persona: 'ferni',
 * });
 * ```
 */
export async function makeConversationalCall(
  context: OutboundCallContext
): Promise<OutboundCall> {
  const service = getConversationalCallService();
  return service.initiateCall(context);
}

/**
 * Check if conversational calls are configured
 */
export function isConversationalCallsConfigured(): boolean {
  const service = getConversationalCallService();
  return service.isConfigured();
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  ConversationalCallService,
};

export type {
  CallStatus,
  OutboundCallContext,
  OutboundCall,
  ConversationalCallConfig,
};

export default {
  getConversationalCallService,
  makeConversationalCall,
  isConversationalCallsConfigured,
};

