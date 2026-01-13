/**
 * Twilio Webhook Handlers
 *
 * Handles incoming webhooks from Twilio for:
 * - SMS status updates (queued, sent, delivered, failed)
 * - SMS replies (inbound messages)
 * - Call status updates (initiated, ringing, answered, completed)
 * - Voicemail detection
 */
import { createHmac } from 'crypto';
import { getDefaultStore } from '../../../memory/in-memory-store.js';
import { getLogger } from '../../../utils/safe-logger.js';
import { recordResponseEvent } from '../analytics.js';
import { getOutreachDecisionEngine } from '../decision-engine.js';
import { markResponded, updateDeliveryStatus } from '../delivery/delivery-tracker.js';
import { handleSMSStatus } from '../delivery/sms-delivery.js';
import { handleCallStatus, handleMachineDetection } from '../sip-bridge.js';
import { findContactByPhone, markContactResponded } from '../../contacts/optimal-timing.js';
// Bidirectional engagement - route replies to the right agent
import { handleInboundSMS as routeInboundSMS } from '../../conversation-thread/inbound-router.js';
const log = getLogger().child({ module: 'twilio-webhooks' });
// ============================================================================
// USER LOOKUP BY PHONE
// ============================================================================
/**
 * Find a user by their phone number
 * Searches all profiles for a matching phone in contactInfo
 */
async function findUserByPhone(phone) {
    try {
        const store = getDefaultStore();
        if (!store.isInitialized) {
            await store.initialize();
        }
        // Normalize phone number (E.164 format)
        const normalizedPhone = normalizePhoneNumber(phone);
        // List profiles and find matching phone
        // Note: In production, this should use a database index/query
        const profiles = await store.listProfiles({ limit: 1000 });
        for (const profile of profiles) {
            if (profile.contactInfo?.phone === normalizedPhone) {
                return profile;
            }
        }
        return null;
    }
    catch (error) {
        log.error({ error, phone }, 'Error looking up user by phone');
        return null;
    }
}
/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phone) {
    // Remove all non-digit characters except leading +
    let normalized = phone.replace(/[^\d+]/g, '');
    // Ensure it starts with + for international format
    if (!normalized.startsWith('+')) {
        // Assume US number if 10 digits
        if (normalized.length === 10) {
            normalized = `+1${normalized}`;
        }
        else if (normalized.length === 11 && normalized.startsWith('1')) {
            normalized = `+${normalized}`;
        }
    }
    return normalized;
}
/**
 * Update user's SMS opt-out status in outreach preferences
 */
async function updateSmsOptStatus(phone, optedIn) {
    try {
        const profile = await findUserByPhone(phone);
        if (!profile) {
            log.warn({ phone }, 'Cannot update SMS opt status - user not found by phone');
            return false;
        }
        const engine = getOutreachDecisionEngine();
        const state = engine.getUserState(profile.id);
        // Update allowedChannels
        let allowedChannels = state.allowedChannels || ['email', 'sms'];
        if (optedIn) {
            // Add SMS if not present
            if (!allowedChannels.includes('sms')) {
                allowedChannels = [...allowedChannels, 'sms'];
            }
        }
        else {
            // Remove SMS
            allowedChannels = allowedChannels.filter((c) => c !== 'sms');
        }
        engine.updateUserState(profile.id, { allowedChannels });
        log.info({
            userId: profile.id,
            phone,
            optedIn,
            allowedChannels,
        }, `📱 SMS opt-${optedIn ? 'in' : 'out'} status updated`);
        return true;
    }
    catch (error) {
        log.error({ error, phone, optedIn }, 'Error updating SMS opt status');
        return false;
    }
}
// ============================================================================
// STATE
// ============================================================================
let twilioAuthToken = null;
const inboundHandlers = [];
const recentInbound = new Map();
// ============================================================================
// INITIALIZATION
// ============================================================================
/**
 * Initialize webhook handlers with Twilio auth token
 */
export function initializeTwilioWebhooks(authToken) {
    twilioAuthToken = authToken;
    log.info('✅ Twilio webhook handlers initialized');
}
/**
 * Register handler for inbound messages
 */
export function onInboundMessage(handler) {
    inboundHandlers.push(handler);
}
// ============================================================================
// SIGNATURE VALIDATION
// ============================================================================
/**
 * Validate Twilio webhook signature
 * Uses HMAC-SHA1 as per Twilio's specification
 */
export function validateTwilioSignature(signature, url, params) {
    if (!twilioAuthToken) {
        log.warn('Cannot validate signature - auth token not set');
        return false;
    }
    try {
        // Build the data string: URL + sorted params concatenated
        const sortedKeys = Object.keys(params).sort();
        let data = url;
        for (const key of sortedKeys) {
            data += key + params[key];
        }
        // Create HMAC-SHA1 signature
        const expectedSignature = createHmac('sha1', twilioAuthToken).update(data).digest('base64');
        return signature === expectedSignature;
    }
    catch (error) {
        log.error({ error }, 'Signature validation error');
        return false;
    }
}
// ============================================================================
// SMS STATUS WEBHOOK
// ============================================================================
/**
 * Handle SMS status webhook from Twilio
 *
 * Statuses: queued, failed, sent, delivered, undelivered, receiving, received, read
 */
export async function handleSMSStatusWebhook(payload, signature, url) {
    // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
    const skipValidation = process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
    if (!skipValidation) {
        if (!signature || !url) {
            log.warn({ messageSid: payload.MessageSid }, 'Missing Twilio signature or URL');
            return { success: false };
        }
        const isValid = validateTwilioSignature(signature, url, payload);
        if (!isValid) {
            log.warn({ messageSid: payload.MessageSid }, 'Invalid Twilio signature');
            return { success: false };
        }
    }
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = payload;
    log.debug({ MessageSid, MessageStatus, ErrorCode }, 'SMS status webhook received');
    // Update SMS delivery service
    handleSMSStatus(MessageSid, MessageStatus, ErrorCode, ErrorMessage);
    // Update unified delivery tracker
    let deliveryStatus = 'sent';
    switch (MessageStatus) {
        case 'delivered':
        case 'read':
            deliveryStatus = 'delivered';
            break;
        case 'failed':
        case 'undelivered':
            deliveryStatus = 'failed';
            break;
    }
    updateDeliveryStatus(MessageSid, deliveryStatus, {
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
    });
    return { success: true };
}
// ============================================================================
// INBOUND SMS WEBHOOK
// ============================================================================
/**
 * Handle inbound SMS (user reply)
 */
export async function handleInboundSMSWebhook(payload, signature, url) {
    // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
    const skipValidation = process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
    if (!skipValidation) {
        if (!signature || !url) {
            log.warn({ messageSid: payload.MessageSid }, 'Missing Twilio signature or URL');
            return { success: false };
        }
        const isValid = validateTwilioSignature(signature, url, payload);
        if (!isValid) {
            log.warn({ messageSid: payload.MessageSid }, 'Invalid Twilio signature');
            return { success: false };
        }
    }
    const { MessageSid, Body, From, NumMedia } = payload;
    log.info({ MessageSid, From, bodyLength: Body.length }, '📥 Inbound SMS received');
    // Check for opt-out
    const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];
    const normalizedBody = Body.toLowerCase().trim();
    if (optOutKeywords.includes(normalizedBody)) {
        log.info({ From }, '🚫 User opted out via SMS');
        // Update user preferences to disable SMS outreach
        await updateSmsOptStatus(From, false);
        return {
            success: true,
            twiml: generateTwiML("You've been unsubscribed from Ferni messages. Reply START to resubscribe."),
        };
    }
    // Check for opt-in
    if (normalizedBody === 'start') {
        log.info({ From }, '✅ User opted back in via SMS');
        // Update user preferences to enable SMS outreach
        await updateSmsOptStatus(From, true);
        return {
            success: true,
            twiml: generateTwiML("Welcome back! You'll receive messages from Ferni again. 🌱"),
        };
    }
    // Collect media URLs
    const mediaUrls = [];
    const numMedia = parseInt(NumMedia, 10) || 0;
    for (let i = 0; i < numMedia; i++) {
        const mediaUrl = payload[`MediaUrl${i}`];
        if (mediaUrl) {
            mediaUrls.push(mediaUrl);
        }
    }
    // Create inbound message record
    const message = {
        id: MessageSid,
        from: From,
        body: Body,
        receivedAt: new Date(),
        mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
    };
    // Store for deduplication
    recentInbound.set(MessageSid, message);
    // Notify handlers
    for (const handler of inboundHandlers) {
        try {
            await handler(message);
        }
        catch (error) {
            log.error({ error, handler: handler.name }, 'Inbound message handler error');
        }
    }
    // Look up userId from phone number for proper attribution
    const userProfile = await findUserByPhone(From);
    const userId = userProfile?.id || 'unknown';
    // Mark as responded in delivery tracker
    markResponded(userId, 'sms');
    // Find the most recent outreach to this user to calculate response time and get outreach ID
    const { getUserDeliveries } = await import('../delivery/delivery-tracker.js');
    const recentDeliveries = getUserDeliveries(userId, 10);
    const matchingDelivery = recentDeliveries.find((d) => d.channel === 'sms' && d.status !== 'failed' && d.status !== 'responded');
    const outreachId = matchingDelivery?.outreachId || 'unknown';
    const responseTime = matchingDelivery?.sentAt
        ? Date.now() - matchingDelivery.sentAt.getTime()
        : 0;
    // Record response event for analytics
    recordResponseEvent({
        outreachId,
        userId,
        responseType: 'reply',
        responseTime,
        sentiment: detectSentiment(Body),
        engagementScore: calculateEngagement(Body) === 'high' ? 9 : calculateEngagement(Body) === 'medium' ? 6 : 3,
    });
    if (userId !== 'unknown') {
        log.info({ userId, from: From }, 'SMS response attributed to user');
    }
    // =========================================================================
    // ML TIMING LEARNING - Check if this is a response from a known contact
    // =========================================================================
    // If the inbound message is from a phone number we've sent TO (a contact),
    // update the ML timing model to record that they responded.
    try {
        const contactLookup = await findContactByPhone(From);
        if (contactLookup) {
            const mlResult = await markContactResponded(contactLookup.userId, contactLookup.contactId, new Date());
            if (mlResult.updated) {
                log.info({
                    contactId: contactLookup.contactId,
                    contactName: contactLookup.contactName,
                    userId: contactLookup.userId,
                }, '📊 ML timing model updated - contact responded to outreach');
            }
        }
    }
    catch (mlError) {
        // Don't fail the webhook if ML tracking fails
        log.warn({ error: String(mlError), from: From }, 'Failed to update ML timing for contact response');
    }
    // =========================================================================
    // BIDIRECTIONAL ROUTING - Route to appropriate agent
    // =========================================================================
    if (userId !== 'unknown') {
        try {
            const routeResult = await routeInboundSMS(userId, From, Body);
            log.info({
                userId,
                routedToAgent: routeResult.routeDecision.agentId,
                confidence: routeResult.routeDecision.confidence,
                shouldInitiateCall: routeResult.shouldInitiateCall,
            }, '🔀 SMS routed to agent');
            // If user wants a call, we could trigger one here
            // For now, just track the routing decision
            if (routeResult.shouldInitiateCall && routeResult.responseMessage) {
                return {
                    success: true,
                    twiml: generateTwiML(routeResult.responseMessage),
                };
            }
        }
        catch (routeError) {
            log.warn({ error: String(routeError), userId }, 'Failed to route inbound SMS');
            // Continue with default handling
        }
    }
    // Auto-reply (optional)
    // For now, don't auto-reply to avoid confusion
    return { success: true };
}
/**
 * Generate TwiML response for SMS
 */
function generateTwiML(message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
}
/**
 * Escape XML special characters
 */
function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}
/**
 * Simple sentiment detection
 */
function detectSentiment(text) {
    const positive = /\b(thanks|thank|great|awesome|love|yes|sure|ok|okay|perfect|wonderful|amazing|good)\b/i;
    const negative = /\b(no|stop|don't|hate|bad|terrible|awful|annoyed|angry|frustrated)\b/i;
    if (positive.test(text))
        return 'positive';
    if (negative.test(text))
        return 'negative';
    return 'neutral';
}
/**
 * Calculate engagement level from message
 */
function calculateEngagement(text) {
    // Longer, more detailed responses indicate higher engagement
    if (text.length > 100)
        return 'high';
    if (text.length > 30)
        return 'medium';
    return 'low';
}
// ============================================================================
// CALL STATUS WEBHOOK
// ============================================================================
/**
 * Handle call status webhook from Twilio
 *
 * Statuses: queued, initiated, ringing, in-progress, completed, busy, failed, no-answer, canceled
 */
export async function handleCallStatusWebhook(payload, signature, url) {
    // ALWAYS validate Twilio signature (skip only in test environment with explicit flag)
    const skipValidation = process.env.SKIP_TWILIO_VALIDATION === 'true' && process.env.NODE_ENV === 'test';
    if (!skipValidation) {
        if (!signature || !url) {
            log.warn({ callSid: payload.CallSid }, 'Missing Twilio signature or URL');
            return { success: false };
        }
        const isValid = validateTwilioSignature(signature, url, payload);
        if (!isValid) {
            log.warn({ callSid: payload.CallSid }, 'Invalid Twilio signature');
            return { success: false };
        }
    }
    const { CallSid, CallStatus, CallDuration, AnsweredBy } = payload;
    log.info({ CallSid, CallStatus, CallDuration, AnsweredBy }, '📞 Call status webhook');
    // Update SIP bridge
    handleCallStatus(CallSid, CallStatus);
    // Handle machine detection
    if (AnsweredBy) {
        const isHuman = AnsweredBy === 'human';
        handleMachineDetection(CallSid, isHuman ? 'human' : 'machine');
    }
    // Update delivery tracker
    let deliveryStatus = 'sent';
    switch (CallStatus) {
        case 'in-progress':
            deliveryStatus = 'delivered'; // Call was answered
            break;
        case 'completed':
            deliveryStatus = 'responded'; // Call was completed
            break;
        case 'busy':
        case 'failed':
        case 'no-answer':
            deliveryStatus = 'failed';
            break;
    }
    updateDeliveryStatus(CallSid, deliveryStatus);
    // =========================================================================
    // ML TIMING LEARNING - If call was answered/completed, it's a "response"
    // =========================================================================
    if (deliveryStatus === 'responded' || deliveryStatus === 'delivered') {
        try {
            const contactLookup = await findContactByPhone(payload.To);
            if (contactLookup) {
                const mlResult = await markContactResponded(contactLookup.userId, contactLookup.contactId, new Date());
                if (mlResult.updated) {
                    log.info({
                        contactId: contactLookup.contactId,
                        contactName: contactLookup.contactName,
                        callStatus: CallStatus,
                    }, '📊 ML timing model updated - contact answered call');
                }
            }
        }
        catch (mlError) {
            // Don't fail the webhook if ML tracking fails
            log.warn({ error: String(mlError), to: payload.To }, 'Failed to update ML timing for call response');
        }
    }
    return { success: true };
}
// ============================================================================
// VOICEMAIL WEBHOOK
// ============================================================================
/**
 * Handle answering machine detection
 * Returns TwiML for leaving voicemail
 */
export async function handleVoicemailWebhook(payload, voicemailMessage) {
    const { CallSid, AnsweredBy } = payload;
    log.info({ CallSid, AnsweredBy }, '📝 Voicemail detection');
    // Generate TwiML for voicemail
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">${escapeXml(voicemailMessage)}</Say>
  <Hangup/>
</Response>`;
    return { twiml };
}
// ============================================================================
// UTILITIES
// ============================================================================
/**
 * Get recent inbound messages
 */
export function getRecentInbound(limit = 50) {
    return Array.from(recentInbound.values())
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
        .slice(0, limit);
}
/**
 * Clear old inbound messages
 */
export function clearOldInbound(maxAgeHours = 24) {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - maxAgeHours);
    let cleared = 0;
    for (const [id, msg] of recentInbound) {
        if (msg.receivedAt < cutoff) {
            recentInbound.delete(id);
            cleared++;
        }
    }
    return cleared;
}
// ============================================================================
// EXPORTS
// ============================================================================
export const twilioWebhooks = {
    initialize: initializeTwilioWebhooks,
    onInboundMessage,
    validateSignature: validateTwilioSignature,
    handleSMSStatus: handleSMSStatusWebhook,
    handleInboundSMS: handleInboundSMSWebhook,
    handleCallStatus: handleCallStatusWebhook,
    handleVoicemail: handleVoicemailWebhook,
    getRecentInbound,
    clearOldInbound,
};
//# sourceMappingURL=twilio-webhooks.js.map