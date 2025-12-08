/**
 * Twilio → LiveKit SIP Bridge
 *
 * Creates a bridge between Twilio outbound calls and LiveKit rooms
 * for real-time, two-way conversational AI calls.
 *
 * Flow:
 * 1. Twilio initiates outbound call
 * 2. When answered, Twilio dials into a SIP trunk connected to LiveKit
 * 3. LiveKit room is created with the appropriate persona agent
 * 4. User has a real conversation with the AI
 */

import { getLogger } from '../../utils/safe-logger.js';
import Twilio from 'twilio';

const log = getLogger().child({ module: 'sip-bridge' });

// ============================================================================
// TYPES
// ============================================================================

export interface SIPBridgeConfig {
  // Twilio
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  // LiveKit
  livekitHost: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  sipTrunkNumber: string;
  sipDomain: string;
}

export interface OutboundCallOptions {
  userId: string;
  toPhone: string;
  personaId: string;
  context: string;
  message: string;
  webhookBaseUrl: string;
}

export interface CallSession {
  callSid: string;
  userId: string;
  personaId: string;
  roomName: string;
  status: 'initiating' | 'ringing' | 'connected' | 'conversation' | 'completed' | 'failed';
  startedAt: Date;
  connectedAt?: Date;
  endedAt?: Date;
  duration?: number;
  voicemailDetected?: boolean;
}

// ============================================================================
// STATE
// ============================================================================

const activeSessions = new Map<string, CallSession>();
let config: SIPBridgeConfig | null = null;
let twilioClient: Twilio.Twilio | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the SIP bridge with Twilio and LiveKit credentials
 */
export function initializeSIPBridge(bridgeConfig: SIPBridgeConfig): void {
  config = bridgeConfig;

  twilioClient = Twilio(config.twilioAccountSid, config.twilioAuthToken);

  log.info('✅ SIP Bridge initialized');
}

/**
 * Check if SIP bridge is available
 */
export function isSIPBridgeAvailable(): boolean {
  return config !== null && twilioClient !== null;
}

// ============================================================================
// OUTBOUND CALLS
// ============================================================================

/**
 * Initiate an outbound conversational call
 * Uses Twilio to call the user, then bridges to LiveKit for AI conversation
 */
export async function initiateConversationalCall(
  options: OutboundCallOptions
): Promise<{ success: boolean; callSid?: string; roomName?: string; error?: string }> {
  if (!isSIPBridgeAvailable()) {
    return { success: false, error: 'SIP bridge not initialized' };
  }

  const { userId, toPhone, personaId, context, message, webhookBaseUrl } = options;

  try {
    // Generate a unique room name for this call
    const roomName = `outreach-${userId}-${Date.now()}`;

    // Create the initial session
    const session: CallSession = {
      callSid: '', // Will be set after Twilio call creation
      userId,
      personaId,
      roomName,
      status: 'initiating',
      startedAt: new Date(),
    };

    // Build TwiML URL that will handle the call flow
    const twimlUrl = `${webhookBaseUrl}/api/outreach/call/connect?roomName=${encodeURIComponent(roomName)}&personaId=${encodeURIComponent(personaId)}&context=${encodeURIComponent(context)}&message=${encodeURIComponent(message)}`;

    // Create the outbound call
    const call = await twilioClient!.calls.create({
      to: toPhone,
      from: config!.twilioPhoneNumber,
      url: twimlUrl,
      statusCallback: `${webhookBaseUrl}/api/outreach/call/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST',
      machineDetection: 'DetectMessageEnd',
      machineDetectionTimeout: 5,
      asyncAmd: 'true',
      asyncAmdStatusCallback: `${webhookBaseUrl}/api/outreach/call/machine`,
      asyncAmdStatusCallbackMethod: 'POST',
    });

    session.callSid = call.sid;
    activeSessions.set(call.sid, session);

    log.info({ callSid: call.sid, toPhone, personaId, roomName }, '📞 Initiated conversational call');

    return {
      success: true,
      callSid: call.sid,
      roomName,
    };
  } catch (error) {
    log.error({ error, userId, toPhone }, 'Failed to initiate call');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// TWIML GENERATION
// ============================================================================

/**
 * Generate TwiML for initial call connection
 * Called when the user answers the phone
 */
export function generateCallConnectTwiML(params: {
  roomName: string;
  personaId: string;
  context: string;
  message: string;
  voicemailDetected?: boolean;
}): string {
  const { roomName, personaId, context, message, voicemailDetected } = params;

  if (!config) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, there was a configuration error. Goodbye!</Say>
  <Hangup/>
</Response>`;
  }

  // If voicemail detected, leave a message
  if (voicemailDetected) {
    return generateVoicemailTwiML(personaId, message);
  }

  // Generate SIP URI to dial into LiveKit
  const sipUri = `sip:${roomName}@${config.sipDomain}`;

  // Build context headers to pass to LiveKit agent
  const contextHeader = Buffer.from(
    JSON.stringify({
      personaId,
      context,
      isOutbound: true,
      initiatingMessage: message,
    })
  ).toString('base64');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Matthew">Hi! This is ${getPersonaGreeting(personaId)}. One moment while I connect you.</Say>
  <Dial callerId="${config.twilioPhoneNumber}" timeout="30">
    <Sip>
      ${sipUri};transport=tls?X-Context=${contextHeader}
    </Sip>
  </Dial>
  <Say>I'm sorry, the connection was lost. I'll follow up with a text. Goodbye!</Say>
  <Hangup/>
</Response>`;
}

/**
 * Generate TwiML for leaving a voicemail
 */
export function generateVoicemailTwiML(personaId: string, message: string): string {
  // Use a short, personalized voicemail message
  const voicemailMessage = getVoicemailMessage(personaId, message);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="${getPersonaVoice(personaId)}">${voicemailMessage}</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>`;
}

// ============================================================================
// PERSONA HELPERS
// ============================================================================

function getPersonaGreeting(personaId: string): string {
  const greetings: Record<string, string> = {
    ferni: 'Ferni, your life coach',
    maya: 'Maya, your habits coach',
    peter: 'Peter, your research buddy',
    alex: 'Alex, your communications partner',
    jordan: 'Jordan, your events coordinator',
    nayan: 'Nayan',
  };
  return greetings[personaId] || 'Ferni';
}

function getPersonaVoice(personaId: string): string {
  // Twilio Polly voices for each persona
  const voices: Record<string, string> = {
    ferni: 'Polly.Matthew',
    maya: 'Polly.Joanna',
    peter: 'Polly.Brian',
    alex: 'Polly.Amy',
    jordan: 'Polly.Salli',
    nayan: 'Polly.Raveena',
  };
  return voices[personaId] || 'Polly.Matthew';
}

function getVoicemailMessage(personaId: string, originalMessage: string): string {
  // Generate a short, warm voicemail message
  const intros: Record<string, string> = {
    ferni: "Hey! It's Ferni. Just wanted to reach out",
    maya: "Hi! Maya here. Quick check-in",
    peter: "Hey! Peter here. Had something to share",
    alex: "Hi! It's Alex. Quick heads up",
    jordan: "Hey! Jordan here. Exciting news",
    nayan: "Hello, friend. Nayan here",
  };

  const intro = intros[personaId] || intros.ferni;
  const closings: Record<string, string> = {
    ferni: "I'll send you a text so you can respond when you have time. Take care!",
    maya: "I'll text you the details. You've got this!",
    peter: "I'll send the info over text. Talk soon!",
    alex: "I'll follow up via text. Best!",
    jordan: "I'll text you! Can't wait!",
    nayan: "I'll send you a message. With warmth.",
  };

  const closing = closings[personaId] || closings.ferni;

  // Keep voicemail short - truncate the original message
  const shortMessage = originalMessage.length > 100 
    ? originalMessage.substring(0, 100) + '...'
    : originalMessage;

  return `${intro}. ${shortMessage}. ${closing}`;
}

// ============================================================================
// CALL STATUS HANDLING
// ============================================================================

/**
 * Handle Twilio call status updates
 */
export function handleCallStatus(callSid: string, status: string, details?: Record<string, unknown>): void {
  const session = activeSessions.get(callSid);
  if (!session) {
    log.warn({ callSid, status }, 'Received status for unknown call');
    return;
  }

  const statusMap: Record<string, CallSession['status']> = {
    initiated: 'initiating',
    ringing: 'ringing',
    'in-progress': 'connected',
    answered: 'connected',
    completed: 'completed',
    busy: 'failed',
    'no-answer': 'failed',
    failed: 'failed',
    canceled: 'failed',
  };

  const newStatus = statusMap[status] || session.status;

  if (newStatus === 'connected' && !session.connectedAt) {
    session.connectedAt = new Date();
  }

  if (newStatus === 'completed' || newStatus === 'failed') {
    session.endedAt = new Date();
    if (session.connectedAt) {
      session.duration = Math.round((session.endedAt.getTime() - session.connectedAt.getTime()) / 1000);
    }
  }

  session.status = newStatus;
  activeSessions.set(callSid, session);

  log.info({ callSid, status: newStatus, duration: session.duration }, 'Call status updated');

  // Emit event for analytics
  if (newStatus === 'completed' || newStatus === 'failed') {
    // Clean up after a delay
    setTimeout(() => {
      activeSessions.delete(callSid);
    }, 60000);
  }
}

/**
 * Handle machine detection (voicemail) callback
 */
export function handleMachineDetection(
  callSid: string,
  answeredBy: string
): { isVoicemail: boolean } {
  const session = activeSessions.get(callSid);
  if (!session) {
    return { isVoicemail: false };
  }

  const isVoicemail = answeredBy === 'machine_end_other' || 
                      answeredBy === 'machine_end_beep' || 
                      answeredBy === 'machine_end_silence';

  session.voicemailDetected = isVoicemail;
  activeSessions.set(callSid, session);

  log.info({ callSid, answeredBy, isVoicemail }, 'Machine detection result');

  return { isVoicemail };
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Get active call session
 */
export function getCallSession(callSid: string): CallSession | undefined {
  return activeSessions.get(callSid);
}

/**
 * Get all active sessions
 */
export function getActiveSessions(): CallSession[] {
  return Array.from(activeSessions.values());
}

/**
 * Mark session as in conversation (LiveKit connected)
 */
export function markSessionInConversation(callSid: string): void {
  const session = activeSessions.get(callSid);
  if (session) {
    session.status = 'conversation';
    activeSessions.set(callSid, session);
    log.info({ callSid }, 'Call now in conversation with LiveKit');
  }
}

/**
 * End a call session
 */
export async function endCall(callSid: string): Promise<void> {
  if (!twilioClient) return;

  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
    log.info({ callSid }, 'Call ended');
  } catch (error) {
    log.error({ error, callSid }, 'Failed to end call');
  }
}

// ============================================================================
// LIVEKIT ROOM CREATION
// ============================================================================

/**
 * Create a LiveKit room for an outbound call
 * The agent will join this room when the call is connected
 */
export async function createOutboundCallRoom(params: {
  roomName: string;
  userId: string;
  personaId: string;
  context: string;
}): Promise<{ success: boolean; token?: string; error?: string }> {
  if (!config) {
    return { success: false, error: 'SIP bridge not configured' };
  }

  try {
    // Dynamic import for LiveKit SDK
    const { AccessToken } = await import('livekit-server-sdk');

    const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: `outbound-${params.userId}`,
      name: 'Outbound Caller',
      metadata: JSON.stringify({
        userId: params.userId,
        personaId: params.personaId,
        context: params.context,
        isOutbound: true,
      }),
    });

    token.addGrant({
      roomJoin: true,
      room: params.roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const tokenString = await token.toJwt();

    log.info({ roomName: params.roomName }, 'Created LiveKit room for outbound call');

    return {
      success: true,
      token: tokenString,
    };
  } catch (error) {
    log.error({ error }, 'Failed to create LiveKit room');
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export const sipBridge = {
  initialize: initializeSIPBridge,
  isAvailable: isSIPBridgeAvailable,
  initiateCall: initiateConversationalCall,
  generateConnectTwiML: generateCallConnectTwiML,
  generateVoicemailTwiML,
  handleStatus: handleCallStatus,
  handleMachineDetection,
  getSession: getCallSession,
  getActiveSessions,
  markInConversation: markSessionInConversation,
  endCall,
  createRoom: createOutboundCallRoom,
};

export default sipBridge;

