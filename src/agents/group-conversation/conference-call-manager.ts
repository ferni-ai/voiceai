/**
 * Conference Call Manager
 *
 * Manages adding external participants (via phone) to a Ferni conversation.
 * Bridges Twilio/SIP calls into the current LiveKit room.
 *
 * "Call my partner - we need to discuss our budget together"
 *
 * @module agents/group-conversation/conference-call-manager
 */

import { EventEmitter } from 'events';
import type { Room } from '@livekit/rtc-node';
import { getLogger } from '../../utils/safe-logger.js';
import { diag } from '../../services/diagnostic-logger.js';
import { GroupConversationManager } from './group-conversation-manager.js';
import { createExternalParticipant } from './participant-registry.js';
import type {
  GroupParticipant,
  AddParticipantRequest,
  AddParticipantResult,
  ConferenceCallState,
  GroupAgentConfig,
  AttributedUtterance,
} from './types.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

export interface ConferenceCallConfig {
  /** LiveKit room */
  room: Room;

  /** Session ID */
  sessionId: string;

  /** User ID */
  userId: string;

  /** Webhook base URL for Twilio callbacks */
  webhookBaseUrl: string;

  /** Twilio credentials */
  twilio?: {
    accountSid: string;
    authToken: string;
    phoneNumber: string;
  };

  /** LiveKit SIP configuration */
  sip?: {
    domain: string;
    trunkNumber: string;
  };

  /** The group conversation manager (if joining existing conversation) */
  manager?: GroupConversationManager;

  /** How the agent should behave when external people are present */
  agentBehavior?: GroupAgentConfig;
}

export interface ExternalParticipantInfo {
  /** Participant ID */
  id: string;

  /** Phone number */
  phoneNumber: string;

  /** Display name */
  name: string;

  /** Relationship to user */
  relationship?: string;

  /** Twilio call SID */
  callSid: string;

  /** Current call status */
  status: 'dialing' | 'ringing' | 'connected' | 'disconnected' | 'failed';

  /** When they connected */
  connectedAt?: Date;
}

export interface ConferenceCallResult {
  /** The conference call manager */
  conferenceCall: ConferenceCallManager;

  /** Cleanup function */
  cleanup: () => Promise<void>;
}

// ============================================================================
// DEFAULT AGENT BEHAVIOR
// ============================================================================

const DEFAULT_AGENT_BEHAVIOR: GroupAgentConfig = {
  role: 'facilitator',
  speakingMode: 'on_request', // Don't dominate when humans are talking
  tracking: {
    takeNotes: true,
    trackActionItems: true,
    monitorEmotions: true,
    flagMoments: true,
  },
  interjectWhen: {
    emotionalEscalation: true,
    missedPoint: false,
    factualError: true,
    directlyAddressed: true,
    awkwardSilence: true,
  },
};

// ============================================================================
// CONFERENCE CALL MANAGER
// ============================================================================

/**
 * ConferenceCallManager
 *
 * Handles adding external participants to a Ferni conversation via phone.
 * Provides a bridge between Twilio/SIP and the LiveKit room.
 */
export class ConferenceCallManager extends EventEmitter {
  private readonly config: ConferenceCallConfig;
  private readonly manager: GroupConversationManager;
  private readonly externalParticipants = new Map<string, ExternalParticipantInfo>();
  private readonly agentBehavior: GroupAgentConfig;

  private state: ConferenceCallState = {
    activeCalls: new Map(),
    totalPhoneTimeMs: 0,
  };

  private isActive = false;

  constructor(config: ConferenceCallConfig) {
    super();
    this.config = config;
    this.agentBehavior = config.agentBehavior ?? DEFAULT_AGENT_BEHAVIOR;

    // Use existing manager or create new one
    if (config.manager) {
      this.manager = config.manager;
    } else {
      this.manager = new GroupConversationManager({
        room: config.room,
        userParticipant: {} as any, // Will be set when conversation starts
        sessionId: config.sessionId,
        userId: config.userId,
        mode: 'conference_call',
        onUtterance: this.handleUtterance.bind(this),
      });
    }

    log.info(
      {
        sessionId: config.sessionId,
        hasTwilio: !!config.twilio,
        hasSip: !!config.sip,
      },
      '📞 ConferenceCallManager created'
    );
  }

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Add an external participant to the conversation
   */
  async addParticipant(request: AddParticipantRequest): Promise<AddParticipantResult> {
    const { phoneNumber, name, relationship, introduction, announceToRoom } = request;

    // Validate phone number
    const e164 = this.formatE164(phoneNumber);
    if (!e164) {
      return { success: false, error: 'Invalid phone number format' };
    }

    // Check if already in call
    const existing = this.findParticipantByPhone(e164);
    if (existing) {
      return { success: false, error: `${name} is already in the call` };
    }

    log.info({ phoneNumber: e164, name, relationship }, '📞 Adding participant to conference');

    // Announce to room if requested
    if (announceToRoom) {
      this.emit('announcement', {
        type: 'adding_participant',
        message: `Calling ${name}...`,
      });
    }

    try {
      // Generate a unique call ID
      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // In a real implementation, this would:
      // 1. Use Twilio to dial out
      // 2. Connect to LiveKit via SIP when answered
      // For now, we simulate the call

      const result = await this.initiateCall(callId, e164, name, relationship, introduction);

      if (!result.success) {
        return { success: false, error: result.error };
      }

      // Create participant entry
      const participantInfo: ExternalParticipantInfo = {
        id: `ext_${callId}`,
        phoneNumber: e164,
        name,
        relationship,
        callSid: result.callSid!,
        status: 'dialing',
      };

      this.externalParticipants.set(participantInfo.id, participantInfo);

      // Add to conversation manager
      const participant = createExternalParticipant(e164, result.callSid!, name, relationship);

      this.emit('participant_calling', { participant: participantInfo });

      log.info(
        { participantId: participantInfo.id, name, callSid: result.callSid },
        '📞 Call initiated'
      );

      return {
        success: true,
        participantId: participantInfo.id,
        callSid: result.callSid,
      };
    } catch (error) {
      log.error({ error: String(error), phoneNumber: e164, name }, '📞 Failed to add participant');
      return { success: false, error: 'Failed to initiate call' };
    }
  }

  /**
   * Remove an external participant from the conversation
   */
  async removeParticipant(participantId: string, reason?: string): Promise<boolean> {
    const participant = this.externalParticipants.get(participantId);
    if (!participant) {
      log.warn({ participantId }, '📞 Participant not found');
      return false;
    }

    log.info(
      { participantId, name: participant.name, reason },
      '📞 Removing participant from conference'
    );

    // Hang up the call
    await this.hangupCall(participant.callSid);

    // Update status
    participant.status = 'disconnected';

    // Remove from conversation
    this.manager.removeParticipant(participantId, reason);
    this.externalParticipants.delete(participantId);

    this.emit('participant_removed', { participantId, name: participant.name, reason });

    return true;
  }

  /**
   * Handle call status updates from Twilio webhook
   */
  handleCallStatusUpdate(callSid: string, status: string): void {
    const participant = this.findParticipantByCallSid(callSid);
    if (!participant) {
      log.warn({ callSid, status }, '📞 Status update for unknown call');
      return;
    }

    log.info({ callSid, status, name: participant.name }, '📞 Call status update');

    switch (status) {
      case 'ringing':
        participant.status = 'ringing';
        this.emit('participant_ringing', { participant });
        break;

      case 'in-progress':
      case 'answered':
        participant.status = 'connected';
        participant.connectedAt = new Date();

        // Add to conversation manager now that they're connected
        const groupParticipant = createExternalParticipant(
          participant.phoneNumber,
          participant.callSid,
          participant.name,
          participant.relationship
        );
        this.manager.getConversation().participants.set(groupParticipant.id, groupParticipant);

        this.emit('participant_connected', { participant });
        break;

      case 'completed':
      case 'busy':
      case 'no-answer':
      case 'failed':
        participant.status = status === 'completed' ? 'disconnected' : 'failed';

        // Calculate phone time
        if (participant.connectedAt) {
          const duration = Date.now() - participant.connectedAt.getTime();
          this.state.totalPhoneTimeMs += duration;
        }

        this.externalParticipants.delete(participant.id);
        this.manager.removeParticipant(participant.id, status);

        this.emit('participant_disconnected', { participant, reason: status });
        break;
    }
  }

  /**
   * Get all external participants
   */
  getExternalParticipants(): ExternalParticipantInfo[] {
    return Array.from(this.externalParticipants.values());
  }

  /**
   * Get connected participants only
   */
  getConnectedParticipants(): ExternalParticipantInfo[] {
    return this.getExternalParticipants().filter((p) => p.status === 'connected');
  }

  /**
   * Check if any external participants are connected
   */
  hasExternalParticipants(): boolean {
    return this.getConnectedParticipants().length > 0;
  }

  /**
   * Get the agent behavior configuration
   */
  getAgentBehavior(): GroupAgentConfig {
    return this.agentBehavior;
  }

  /**
   * Check if agent should speak based on behavior config and context
   */
  shouldAgentSpeak(context: { lastUtterance?: string; silenceDurationMs?: number }): boolean {
    const { speakingMode, interjectWhen } = this.agentBehavior;

    // Silent mode - never speak unless addressed
    if (speakingMode === 'silent') {
      return false;
    }

    // Check if directly addressed
    if (context.lastUtterance && this.wasAgentAddressed(context.lastUtterance)) {
      return true;
    }

    // On-request mode - only speak if addressed
    if (speakingMode === 'on_request') {
      return false;
    }

    // Minimal mode - only essential interjections
    if (speakingMode === 'minimal') {
      if (interjectWhen.awkwardSilence && (context.silenceDurationMs ?? 0) > 5000) {
        return true;
      }
      return false;
    }

    // Proactive mode - can interject more freely
    if (interjectWhen.awkwardSilence && (context.silenceDurationMs ?? 0) > 3000) {
      return true;
    }

    return false;
  }

  /**
   * Get total phone time (for billing)
   */
  getTotalPhoneTimeMs(): number {
    let total = this.state.totalPhoneTimeMs;

    // Add ongoing call time
    for (const participant of this.externalParticipants.values()) {
      if (participant.status === 'connected' && participant.connectedAt) {
        total += Date.now() - participant.connectedAt.getTime();
      }
    }

    return total;
  }

  /**
   * End all external calls and cleanup
   */
  async endAllCalls(reason?: string): Promise<void> {
    log.info({ sessionId: this.config.sessionId, reason }, '📞 Ending all conference calls');

    const participants = Array.from(this.externalParticipants.values());

    for (const participant of participants) {
      await this.removeParticipant(participant.id, reason);
    }

    this.emit('conference_ended', {
      reason,
      totalPhoneTimeMs: this.state.totalPhoneTimeMs,
    });
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    await this.endAllCalls('cleanup');
    this.removeAllListeners();

    log.debug({ sessionId: this.config.sessionId }, '📞 ConferenceCallManager cleaned up');
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Format phone number to E.164
   */
  private formatE164(phoneNumber: string): string | null {
    const cleaned = phoneNumber.replace(/\D/g, '');

    if (cleaned.length < 10) {
      return null;
    }

    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }

    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    }

    if (cleaned.startsWith('1') || cleaned.length > 11) {
      return `+${cleaned}`;
    }

    return `+1${cleaned}`;
  }

  /**
   * Find participant by phone number
   */
  private findParticipantByPhone(phoneNumber: string): ExternalParticipantInfo | undefined {
    for (const participant of this.externalParticipants.values()) {
      if (participant.phoneNumber === phoneNumber) {
        return participant;
      }
    }
    return undefined;
  }

  /**
   * Find participant by call SID
   */
  private findParticipantByCallSid(callSid: string): ExternalParticipantInfo | undefined {
    for (const participant of this.externalParticipants.values()) {
      if (participant.callSid === callSid) {
        return participant;
      }
    }
    return undefined;
  }

  /**
   * Initiate an outbound call
   */
  private async initiateCall(
    callId: string,
    phoneNumber: string,
    name: string,
    relationship?: string,
    introduction?: string
  ): Promise<{ success: boolean; callSid?: string; error?: string }> {
    // Check if Twilio is configured
    if (!this.config.twilio) {
      log.warn('📞 Twilio not configured - simulating call');
      return this.simulateCall(callId, phoneNumber, name);
    }

    try {
      // Build TwiML URL for when they answer
      const twimlUrl = this.buildAnswerTwimlUrl(name, introduction);

      // TODO: Use actual Twilio client to make the call
      // For now, simulate
      return this.simulateCall(callId, phoneNumber, name);
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Simulate a call (for development/testing)
   */
  private async simulateCall(
    callId: string,
    phoneNumber: string,
    name: string
  ): Promise<{ success: boolean; callSid?: string; error?: string }> {
    const callSid = `sim_${callId}`;

    // Simulate ringing
    setTimeout(() => {
      this.handleCallStatusUpdate(callSid, 'ringing');
    }, 500);

    // Simulate answering
    setTimeout(() => {
      this.handleCallStatusUpdate(callSid, 'in-progress');
    }, 2000);

    return { success: true, callSid };
  }

  /**
   * Hang up a call
   */
  private async hangupCall(callSid: string): Promise<void> {
    if (callSid.startsWith('sim_')) {
      // Simulated call - just mark as completed
      this.handleCallStatusUpdate(callSid, 'completed');
      return;
    }

    // TODO: Use actual Twilio client to hang up
    // await twilioClient.calls(callSid).update({ status: 'completed' });
  }

  /**
   * Build TwiML URL for answering
   */
  private buildAnswerTwimlUrl(name: string, introduction?: string): string {
    const { webhookBaseUrl, sessionId } = this.config;
    const roomName = this.config.room.name;
    const intro = introduction ?? `Hi! You've been added to a conversation. Connecting you now.`;

    return `${webhookBaseUrl}/api/group/call/answer?roomName=${encodeURIComponent(roomName ?? '')}&name=${encodeURIComponent(name)}&intro=${encodeURIComponent(intro)}`;
  }

  /**
   * Check if the agent was directly addressed
   */
  private wasAgentAddressed(utterance: string): boolean {
    const lowerUtterance = utterance.toLowerCase();
    return (
      lowerUtterance.includes('ferni') ||
      lowerUtterance.includes('hey ferni') ||
      lowerUtterance.includes('what do you think') ||
      lowerUtterance.includes('your thoughts')
    );
  }

  /**
   * Handle new utterances for analysis
   */
  private handleUtterance(utterance: AttributedUtterance): void {
    // Track utterances for note-taking if enabled
    if (this.agentBehavior.tracking.takeNotes) {
      this.emit('note', {
        speaker: utterance.speakerName,
        text: utterance.text,
        timestamp: utterance.timestamp,
      });
    }

    // Check for action items
    if (this.agentBehavior.tracking.trackActionItems) {
      const actionItems = this.extractActionItems(utterance.text);
      if (actionItems.length > 0) {
        this.emit('action_items', { items: actionItems, from: utterance.speakerName });
      }
    }
  }

  /**
   * Extract potential action items from text
   */
  private extractActionItems(text: string): string[] {
    const actionPatterns = [
      /i('ll| will) (.+)/gi,
      /we should (.+)/gi,
      /let's (.+)/gi,
      /need to (.+)/gi,
      /have to (.+)/gi,
    ];

    const items: string[] = [];
    for (const pattern of actionPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] || match[2]) {
          items.push(match[0]);
        }
      }
    }

    return items;
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a conference call manager
 */
export function createConferenceCallManager(config: ConferenceCallConfig): ConferenceCallManager {
  return new ConferenceCallManager(config);
}

/**
 * Generate TwiML for when external participant answers
 */
export function generateAnswerTwiml(params: {
  roomName: string;
  sipDomain: string;
  name: string;
  introduction?: string;
}): string {
  const { roomName, sipDomain, name, introduction } = params;

  const greeting =
    introduction ?? `Hi ${name}! You've been added to a conversation. Connecting you now.`;
  const sipUri = `sip:${roomName}@${sipDomain}`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${greeting}</Say>
  <Dial>
    <Sip>${sipUri};transport=tls</Sip>
  </Dial>
  <Say>The connection was lost. Goodbye!</Say>
  <Hangup/>
</Response>`;
}
