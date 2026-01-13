/**
 * Conversational Call Service - Two-Way AI Voice Calls
 *
 * Enables full two-way voice conversations where:
 * 1. Twilio makes the outbound call
 * 2. Audio streams via WebSocket to our bridge
 * 3. Bridge connects to LiveKit room with AI agent
 * 4. Agent responds in real-time using Cartesia TTS
 *
 * This is for INTERACTIVE calls where the recipient speaks back.
 * For one-way messages, use natural-call.service.ts instead.
 *
 * @module conversational-call.service
 */
import { EventEmitter } from 'events';
import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { createLogger } from '../../utils/safe-logger.js';
import { generateStreamTwiml, getTwilioStreamBridge } from './twilio-stream-bridge.js';
const log = createLogger({ module: 'conversational-call' });
// Environment
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '';
const STREAM_WEBHOOK_URL = process.env.TWILIO_STREAM_WEBHOOK_URL || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';
// ============================================================================
// CALL TRACKING
// ============================================================================
const activeCalls = new Map();
const callEmitter = new EventEmitter();
/**
 * Get an active call session
 */
export function getCallSession(callId) {
    return activeCalls.get(callId);
}
/**
 * Get all active calls
 */
export function getActiveCalls() {
    return Array.from(activeCalls.values()).filter((c) => c.status !== 'ended' && c.status !== 'failed');
}
/**
 * Subscribe to call events
 */
export function onCallEvent(event, callback) {
    callEmitter.on(event, callback);
}
// ============================================================================
// CONFIGURATION CHECK
// ============================================================================
/**
 * Check if conversational calling is properly configured
 */
export function isConversationalCallingConfigured() {
    const missing = [];
    if (!TWILIO_ACCOUNT_SID)
        missing.push('TWILIO_ACCOUNT_SID');
    if (!TWILIO_AUTH_TOKEN)
        missing.push('TWILIO_AUTH_TOKEN');
    if (!TWILIO_PHONE_NUMBER)
        missing.push('TWILIO_PHONE_NUMBER');
    if (!STREAM_WEBHOOK_URL)
        missing.push('TWILIO_STREAM_WEBHOOK_URL');
    if (!LIVEKIT_URL)
        missing.push('LIVEKIT_URL');
    if (!LIVEKIT_API_KEY)
        missing.push('LIVEKIT_API_KEY');
    if (!LIVEKIT_API_SECRET)
        missing.push('LIVEKIT_API_SECRET');
    return {
        configured: missing.length === 0,
        missing,
    };
}
// ============================================================================
// MAIN SERVICE
// ============================================================================
/**
 * Make a two-way conversational call
 *
 * The call flow:
 * 1. Create LiveKit room with agent context
 * 2. Initiate Twilio call with Stream TwiML
 * 3. Twilio streams audio to our WebSocket bridge
 * 4. Bridge connects audio to LiveKit room
 * 5. AI agent handles the conversation
 * 6. Results are captured and returned
 */
export async function makeConversationalCall(request) {
    const config = isConversationalCallingConfigured();
    if (!config.configured) {
        return {
            success: false,
            message: `Conversational calling not configured. Missing: ${config.missing.join(', ')}`,
            error: 'CONFIGURATION_ERROR',
        };
    }
    const personaId = request.personaId || 'ferni';
    const personaName = getPersonaDisplayName(personaId);
    const callId = generateCallId();
    const roomName = `call_${callId}`;
    log.info({
        callId,
        phone: maskPhone(request.phone),
        personaId,
        purpose: request.purpose,
        callType: request.callType || 'general',
    }, `📞 Initiating conversational call as ${personaName}`);
    try {
        // 1. Initialize the stream bridge if not already running
        const bridge = getTwilioStreamBridge({
            livekitUrl: LIVEKIT_URL,
            livekitApiKey: LIVEKIT_API_KEY,
            livekitApiSecret: LIVEKIT_API_SECRET,
        });
        // 2. Create LiveKit room with agent context (agent will be dispatched separately)
        const { RoomServiceClient } = await import('livekit-server-sdk');
        const roomService = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
        const roomMetadata = JSON.stringify({
            type: 'conversational_call',
            callId,
            userId: request.userId,
            personaId,
            recipientName: request.recipientName,
            purpose: request.purpose,
            objective: request.objective,
            callType: request.callType || 'general',
            context: request.context,
        });
        await roomService.createRoom({
            name: roomName,
            emptyTimeout: request.timeoutSeconds || 300,
            maxParticipants: 10,
            metadata: roomMetadata,
        });
        log.debug({ roomName, metadataLength: roomMetadata.length }, 'Created LiveKit room');
        // 3. Generate TwiML to start the stream
        // IMPORTANT: NO greeting in TwiML! The agent will speak through the stream.
        // This ensures proper two-way audio (track="both_tracks").
        const twiml = generateStreamTwiml({
            websocketUrl: STREAM_WEBHOOK_URL,
            roomName,
            customParameters: {
                callId,
                userId: request.userId,
                userName: request.context?.userName || 'User',
                recipientName: request.recipientName,
                purpose: request.purpose,
                objective: request.objective || 'Have a conversation',
                callType: request.callType || 'general',
                personaId,
            },
        });
        // 4. Initiate the Twilio call
        const cleanPhone = request.phone.replace(/\D/g, '');
        const e164Phone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Calls.json`, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                To: e164Phone,
                From: TWILIO_PHONE_NUMBER,
                Twiml: twiml,
                MachineDetection: 'Enable', // Detect answering machines
                MachineDetectionTimeout: '5',
                StatusCallback: `${STREAM_WEBHOOK_URL.replace('/stream', '/status')}`,
                StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
            }),
            signal: AbortSignal.timeout(15000),
        });
        if (!response.ok) {
            const error = await response.text();
            log.error({ error, callId }, 'Failed to initiate Twilio call');
            return {
                success: false,
                message: `Call failed: ${error}`,
                error: 'TWILIO_ERROR',
            };
        }
        const callData = (await response.json());
        // 5. Track the call
        const session = {
            callId,
            callSid: callData.sid,
            roomName,
            phone: e164Phone,
            recipientName: request.recipientName,
            userId: request.userId,
            personaId,
            purpose: request.purpose,
            objective: request.objective,
            callType: request.callType || 'general',
            status: 'initiating',
            startedAt: new Date(),
        };
        activeCalls.set(callId, session);
        // Set up call event handlers
        bridge.on('callStarted', (event) => {
            if (event.roomName === roomName) {
                session.status = 'connected';
                session.connectedAt = new Date();
                callEmitter.emit('connected', session);
                log.info({ callId, callSid: event.callSid }, '✅ Call connected');
            }
        });
        bridge.on('callEnded', (event) => {
            if (session.callSid === event.callSid) {
                session.status = 'ended';
                session.endedAt = new Date();
                if (session.connectedAt) {
                    session.duration = Math.round((session.endedAt.getTime() - session.connectedAt.getTime()) / 1000);
                }
                callEmitter.emit('ended', session);
                log.info({ callId, duration: session.duration }, '📴 Call ended');
                // Clean up after delay
                setTimeout(() => activeCalls.delete(callId), 60000);
            }
        });
        log.info({ callId, callSid: callData.sid, roomName }, `✅ Conversational call initiated as ${personaName}`);
        return {
            success: true,
            message: `Call initiated. Room: ${roomName}`,
            callSid: callData.sid,
            roomName,
        };
    }
    catch (error) {
        log.error({ error: String(error), callId }, '❌ Conversational call error');
        return {
            success: false,
            message: `Failed to initiate call: ${error}`,
            error: 'SYSTEM_ERROR',
        };
    }
}
/**
 * Record the outcome of a call (called by agent when conversation ends)
 */
export function recordCallOutcome(callId, outcome) {
    const session = activeCalls.get(callId);
    if (!session) {
        log.warn({ callId }, 'Attempted to record outcome for unknown call');
        return;
    }
    session.outcome = outcome;
    callEmitter.emit('outcome', session);
    log.info({ callId, success: outcome.success, summary: outcome.summary?.slice(0, 100) }, '📝 Call outcome recorded');
}
// ============================================================================
// UTILITIES
// ============================================================================
function generateCallId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}_${random}`;
}
function maskPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4)
        return '****';
    return `***${digits.slice(-4)}`;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    makeConversationalCall,
    recordCallOutcome,
    getCallSession,
    getActiveCalls,
    isConversationalCallingConfigured,
    onCallEvent,
};
//# sourceMappingURL=conversational-call.service.js.map