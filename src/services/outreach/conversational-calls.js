/**
 * Conversational Voice Call Outreach
 *
 * > "We show up. Not because you asked. Because we noticed."
 *
 * Creates outbound voice calls where Ferni (or other personas) can:
 * - Deliver SSML-enhanced messages that sound human
 * - Have two-way conversations (not just voicemails)
 * - Handle user responses naturally
 *
 * Uses LiveKit + Twilio SIP integration for real voice calls.
 *
 * @module ConversationalCalls
 */
import { createLogger } from '../../utils/safe-logger.js';
import { cleanForFirestore } from '../../utils/firestore-utils.js';
const log = createLogger({ module: 'ConversationalCalls' });
// ============================================================================
// SSML ENHANCEMENT
// ============================================================================
/**
 * Enhance SSML for Cartesia TTS to sound natural
 *
 * Adds:
 * - Natural breathing pauses
 * - Emotional emphasis
 * - Conversational rhythm
 */
export function enhanceSSMLForCall(ssml, personaId) {
    let enhanced = ssml;
    // If not already wrapped in <speak>, wrap it
    if (!enhanced.startsWith('<speak>')) {
        enhanced = `<speak>${enhanced}</speak>`;
    }
    // Add Cartesia-specific voice settings based on persona
    const voiceSettings = getPersonaVoiceSettings(personaId);
    // Inject voice control at the start (after <speak>)
    const voiceControl = `<voice name="${voiceSettings.voiceId}"><prosody rate="${voiceSettings.rate}" pitch="${voiceSettings.pitch}">`;
    const voiceControlEnd = '</prosody></voice>';
    enhanced = enhanced.replace('<speak>', `<speak>${voiceControl}`);
    enhanced = enhanced.replace('</speak>', `${voiceControlEnd}</speak>`);
    // Add a greeting pause at the start (makes it feel less robotic)
    enhanced = enhanced.replace(voiceControl, `${voiceControl}<break time="400ms"/>`);
    // Add a closing pause (gives space before hanging up)
    enhanced = enhanced.replace(voiceControlEnd, `<break time="500ms"/>${voiceControlEnd}`);
    return enhanced;
}
function getPersonaVoiceSettings(personaId) {
    const settings = {
        ferni: { voiceId: 'nova', rate: '0.95', pitch: '+0%' },
        peter: { voiceId: 'alloy', rate: '1.0', pitch: '-2%' },
        maya: { voiceId: 'shimmer', rate: '0.98', pitch: '+3%' },
        alex: { voiceId: 'echo', rate: '1.02', pitch: '0%' },
        jordan: { voiceId: 'fable', rate: '0.97', pitch: '+2%' },
        nayan: { voiceId: 'onyx', rate: '0.9', pitch: '-3%' },
    };
    return settings[personaId] || settings['ferni'];
}
// ============================================================================
// CALL SCHEDULING
// ============================================================================
/**
 * Schedule a proactive outreach call
 */
export async function scheduleProactiveCall(request) {
    const { userId, phoneNumber, message, ssml, personaId, reason, scheduledFor = new Date(), maxDuration = 120, enableConversation = false, voicemailFallback = true, } = request;
    const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
        // Validate phone number format
        const normalizedPhone = normalizePhoneNumber(phoneNumber);
        if (!normalizedPhone) {
            return { success: false, error: 'Invalid phone number format' };
        }
        // Check quiet hours
        const inQuietHours = await isInQuietHours(userId);
        if (inQuietHours) {
            log.info({ userId, callId }, 'Call delayed due to quiet hours');
            // Reschedule for next available window
            const nextWindow = await getNextAvailableWindow(userId);
            return scheduleProactiveCall({
                ...request,
                scheduledFor: nextWindow,
            });
        }
        // Enhance SSML for natural delivery
        const enhancedSSML = enhanceSSMLForCall(ssml, personaId);
        // Store scheduled call in Firestore
        const scheduledCall = {
            id: callId,
            userId,
            phoneNumber: normalizedPhone,
            message,
            ssml: enhancedSSML,
            personaId,
            reason,
            scheduledFor: scheduledFor.toISOString(),
            status: 'pending',
            attempts: 0,
            maxAttempts: 3,
            createdAt: new Date().toISOString(),
        };
        await saveScheduledCall(scheduledCall);
        // If scheduled for now or past, initiate immediately
        if (scheduledFor.getTime() <= Date.now()) {
            return await initiateCall(scheduledCall, {
                maxDuration,
                enableConversation,
                voicemailFallback,
            });
        }
        log.info({ userId, callId, scheduledFor: scheduledFor.toISOString() }, 'Proactive call scheduled');
        return { success: true, callId, status: 'scheduled' };
    }
    catch (error) {
        log.error({ error: String(error), userId }, 'Failed to schedule proactive call');
        return { success: false, error: String(error) };
    }
}
/**
 * Initiate an outbound call using Twilio + LiveKit
 */
async function initiateCall(call, options) {
    try {
        // Update status
        await updateCallStatus(call.id, 'in_progress', { lastAttemptAt: new Date().toISOString() });
        // Check if Twilio is configured
        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioToken = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;
        if (!twilioSid || !twilioToken || !twilioPhone) {
            log.warn({ callId: call.id }, 'Twilio not configured - call simulated');
            // In development, simulate the call
            if (process.env.NODE_ENV === 'development') {
                await updateCallStatus(call.id, 'completed', {
                    completedAt: new Date().toISOString(),
                    outcome: 'simulated_dev',
                });
                return { success: true, callId: call.id, status: 'answered' };
            }
            return { success: false, callId: call.id, error: 'Twilio not configured' };
        }
        // Create Twilio call with TwiML that:
        // 1. Speaks the SSML message
        // 2. Optionally waits for response
        // 3. Handles voicemail detection
        const twilio = await import('twilio');
        const client = twilio.default(twilioSid, twilioToken);
        // Build TwiML
        const twiml = buildCallTwiML(call, options);
        // Create the call
        const twilioCall = await client.calls.create({
            to: call.phoneNumber,
            from: twilioPhone,
            twiml,
            machineDetection: options.voicemailFallback ? 'DetectMessageEnd' : 'Enable',
            machineDetectionTimeout: 3,
            timeout: 30, // Ring for 30 seconds max
            statusCallback: `${process.env.APP_URL || 'https://app.ferni.ai'}/api/outreach/call-status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        });
        // Update with Twilio SID
        await updateCallStatus(call.id, 'in_progress', {
            twilioSid: twilioCall.sid,
        });
        log.info({ userId: call.userId, callId: call.id, twilioSid: twilioCall.sid }, 'Outbound call initiated');
        return { success: true, callId: call.id, status: 'initiated' };
    }
    catch (error) {
        log.error({ error: String(error), callId: call.id }, 'Failed to initiate call');
        // Update attempt count
        const attempts = call.attempts + 1;
        if (attempts < call.maxAttempts) {
            await updateCallStatus(call.id, 'pending', { attempts });
        }
        else {
            await updateCallStatus(call.id, 'failed', {
                attempts,
                completedAt: new Date().toISOString(),
                outcome: 'max_attempts_reached',
            });
        }
        return { success: false, callId: call.id, error: String(error) };
    }
}
/**
 * Build TwiML for the outbound call
 */
function buildCallTwiML(call, options) {
    // Use Cartesia for natural TTS
    // Note: In production, this would integrate with LiveKit for the actual voice synthesis
    // For now, we use Twilio's <Say> with SSML
    let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';
    // Greeting with natural pause
    twiml += '<Pause length="1"/>';
    // Speak the message
    // Convert our SSML to Twilio's SSML format
    const twilioSsml = convertToTwilioSSML(call.ssml);
    twiml += `<Say voice="Polly.Joanna">${twilioSsml}</Say>`;
    if (options.enableConversation) {
        // Allow user to respond
        twiml += '<Gather input="speech" timeout="5" action="/api/outreach/call-response">';
        twiml += '<Say voice="Polly.Joanna">Is there anything you would like to share?</Say>';
        twiml += '</Gather>';
    }
    // Closing
    twiml += '<Pause length="1"/>';
    twiml += '<Say voice="Polly.Joanna">Take care. Talk soon.</Say>';
    twiml += '</Response>';
    return twiml;
}
/**
 * Convert our SSML to Twilio-compatible format
 */
function convertToTwilioSSML(ssml) {
    // Remove outer <speak> tags (Twilio adds its own)
    let converted = ssml.replace(/<speak>/g, '').replace(/<\/speak>/g, '');
    // Convert voice tags to prosody (Twilio doesn't support <voice>)
    converted = converted.replace(/<voice[^>]*>/g, '');
    converted = converted.replace(/<\/voice>/g, '');
    // Keep prosody and break tags (Twilio supports these)
    // Remove any unsupported tags
    return converted;
}
// ============================================================================
// FIRESTORE OPERATIONS
// ============================================================================
async function saveScheduledCall(call) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db)
            return;
        await db
            .collection('bogle_users')
            .doc(call.userId)
            .collection('scheduled_calls')
            .doc(call.id)
            .set(cleanForFirestore(call));
    }
    catch (error) {
        log.error({ error: String(error), callId: call.id }, 'Failed to save scheduled call');
    }
}
async function updateCallStatus(callId, status, updates) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db)
            return;
        // Find the call document (we don't have userId here, so query)
        const snapshot = await db
            .collectionGroup('scheduled_calls')
            .where('id', '==', callId)
            .limit(1)
            .get();
        if (!snapshot.empty) {
            await snapshot.docs[0].ref.update(cleanForFirestore({
                status,
                ...updates,
                updatedAt: new Date().toISOString(),
            }));
        }
    }
    catch (error) {
        log.warn({ error: String(error), callId }, 'Failed to update call status');
    }
}
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
function normalizePhoneNumber(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    // Validate length (US numbers: 10 or 11 with country code)
    if (digits.length === 10) {
        return `+1${digits}`;
    }
    else if (digits.length === 11 && digits.startsWith('1')) {
        return `+${digits}`;
    }
    else if (digits.length > 10) {
        // International number
        return `+${digits}`;
    }
    return null;
}
async function isInQuietHours(userId) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db)
            return false;
        const doc = await db.collection('bogle_users').doc(userId).get();
        if (!doc.exists)
            return false;
        const data = doc.data();
        const preferences = data?.outreachPreferences;
        if (!preferences?.quietHours?.enabled)
            return false;
        // Parse quiet hours (e.g., "22:00" to "08:00")
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        const currentTime = currentHour * 60 + currentMinute;
        const startParts = preferences.quietHours.start.split(':').map(Number);
        const endParts = preferences.quietHours.end.split(':').map(Number);
        const startTime = startParts[0] * 60 + startParts[1];
        const endTime = endParts[0] * 60 + endParts[1];
        // Handle overnight quiet hours (e.g., 22:00 to 08:00)
        if (startTime > endTime) {
            return currentTime >= startTime || currentTime < endTime;
        }
        return currentTime >= startTime && currentTime < endTime;
    }
    catch {
        return false;
    }
}
async function getNextAvailableWindow(userId) {
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db) {
            // Default: 9 AM tomorrow
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(9, 0, 0, 0);
            return tomorrow;
        }
        const doc = await db.collection('bogle_users').doc(userId).get();
        const preferences = doc.exists ? doc.data()?.outreachPreferences : null;
        // Default quiet hours end at 8 AM
        const endHour = preferences?.quietHours?.end
            ? parseInt(preferences.quietHours.end.split(':')[0], 10)
            : 8;
        const next = new Date();
        if (next.getHours() >= endHour) {
            next.setDate(next.getDate() + 1);
        }
        next.setHours(endHour, 0, 0, 0);
        return next;
    }
    catch {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        return tomorrow;
    }
}
/**
 * Handle Twilio status callback
 */
export async function handleCallStatusUpdate(update) {
    const { CallSid, CallStatus, CallDuration, AnsweredBy } = update;
    log.info({ twilioSid: CallSid, status: CallStatus, answeredBy: AnsweredBy }, 'Call status update');
    try {
        const { getFirestoreDb } = await import('../superhuman/firestore-utils.js');
        const db = getFirestoreDb();
        if (!db)
            return;
        // Find the call by Twilio SID
        const snapshot = await db
            .collectionGroup('scheduled_calls')
            .where('twilioSid', '==', CallSid)
            .limit(1)
            .get();
        if (snapshot.empty) {
            log.warn({ twilioSid: CallSid }, 'Call not found for status update');
            return;
        }
        const callDoc = snapshot.docs[0];
        const call = callDoc.data();
        // Map Twilio status to our status
        let newStatus = call.status;
        let outcome;
        switch (CallStatus) {
            case 'completed':
                newStatus = 'completed';
                outcome = AnsweredBy === 'human' ? 'answered' : `voicemail_${AnsweredBy}`;
                break;
            case 'busy':
            case 'no-answer':
            case 'failed':
                // Check if we should retry
                if (call.attempts < call.maxAttempts) {
                    newStatus = 'pending';
                    outcome = CallStatus;
                }
                else {
                    newStatus = 'failed';
                    outcome = CallStatus;
                }
                break;
        }
        await callDoc.ref.update(cleanForFirestore({
            status: newStatus,
            outcome,
            duration: CallDuration ? parseInt(CallDuration, 10) : undefined,
            answeredBy: AnsweredBy,
            completedAt: CallStatus === 'completed' ? new Date().toISOString() : undefined,
            updatedAt: new Date().toISOString(),
        }));
        log.info({ callId: call.id, newStatus, outcome }, 'Call status updated');
    }
    catch (error) {
        log.error({ error: String(error), twilioSid: CallSid }, 'Failed to handle call status update');
    }
}
let serviceInstance = null;
/**
 * Get the conversational call service instance
 * @deprecated Use conversationalCalls.scheduleProactiveCall directly
 */
// In-memory store for active calls (for development/testing)
const activeCalls = new Map();
export function getConversationalCallService() {
    if (!serviceInstance) {
        serviceInstance = {
            isConfigured: isConversationalCallsConfigured,
            makeCall: async (ctx) => {
                // Extract values with fallbacks
                const userId = ctx.userId || ctx.user?.id || '';
                const phoneNumber = ctx.phoneNumber || ctx.user?.phone || '';
                const message = ctx.message || ctx.approach?.primaryGoal || '';
                if (!userId || !phoneNumber || !message) {
                    return {
                        success: false,
                        error: 'Missing required fields: userId, phoneNumber, or message',
                    };
                }
                return scheduleProactiveCall({
                    userId,
                    phoneNumber,
                    message,
                    ssml: ctx.ssml || `<speak>${message}</speak>`,
                    personaId: ctx.personaId || ctx.persona || 'ferni',
                    reason: ctx.reason || ctx.trigger?.reason || 'outbound_call',
                    maxDuration: ctx.maxDuration || ctx.approach?.maxDuration,
                });
            },
            scheduleCall: scheduleProactiveCall,
            // Extended methods
            getActiveCall: async (callId) => {
                return activeCalls.get(callId) ?? null;
            },
            getActiveCalls: async () => {
                return Array.from(activeCalls.values());
            },
            endCall: async (callId, _reason) => {
                const call = activeCalls.get(callId);
                if (call) {
                    call.status = 'failed';
                    call.completedAt = new Date().toISOString();
                    activeCalls.delete(callId);
                }
            },
            updateCallSummary: async (callId, summary) => {
                const call = activeCalls.get(callId);
                if (call) {
                    call.conversationSummary = summary.conversationSummary;
                    call.followUpActions = summary.followUpActions;
                }
            },
            handleStatusCallback: async (callId, status, _data) => {
                const call = activeCalls.get(callId);
                if (call) {
                    call.status = status;
                    if (status === 'answered') {
                        call.answeredAt = new Date().toISOString();
                    }
                    else if (status === 'failed' || status === 'no_answer') {
                        call.completedAt = new Date().toISOString();
                    }
                }
            },
            handleMachineDetection: async (_callId, answeredBy) => {
                if (answeredBy && answeredBy !== 'human') {
                    // Return TwiML for voicemail
                    return `<Response><Say>Hi, this is Ferni leaving a quick message. Talk to you soon!</Say></Response>`;
                }
                return undefined;
            },
        };
    }
    return serviceInstance;
}
/**
 * Check if conversational calls are configured
 */
export function isConversationalCallsConfigured() {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}
/**
 * Make a conversational call (legacy API)
 * @deprecated Use conversationalCalls.scheduleProactiveCall directly
 */
export async function makeConversationalCall(context) {
    // Extract values with fallbacks
    const userId = context.userId || context.user?.id || '';
    const phoneNumber = context.phoneNumber || context.user?.phone || '';
    const message = context.message || context.approach?.primaryGoal || '';
    if (!userId || !phoneNumber || !message) {
        return { success: false, error: 'Missing required fields: userId, phoneNumber, or message' };
    }
    return scheduleProactiveCall({
        userId,
        phoneNumber,
        message,
        ssml: context.ssml || `<speak>${message}</speak>`,
        personaId: context.personaId || context.persona || 'ferni',
        reason: context.reason || context.trigger?.reason || 'outbound_call',
        maxDuration: context.maxDuration || context.approach?.maxDuration,
    });
}
/**
 * Format referral conversations for context injection
 * @deprecated Use dedicated context builder
 */
export function formatReferralConversationsForContext(_userId) {
    // Stub for backward compatibility
    return '';
}
// ============================================================================
// EXPORTS
// ============================================================================
export const conversationalCalls = {
    scheduleProactiveCall,
    handleCallStatusUpdate,
    enhanceSSMLForCall,
    isConfigured: isConversationalCallsConfigured,
    makeCall: makeConversationalCall,
};
export default conversationalCalls;
//# sourceMappingURL=conversational-calls.js.map