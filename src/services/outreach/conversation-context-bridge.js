/**
 * Conversation Context Bridge - Outreach → Voice Continuity
 *
 * When a user receives a proactive message (SMS, push, email) and then
 * starts a voice call, THIS system ensures the conversation picks up
 * with full context.
 *
 * > "Better than human" = the voice call knows WHY you reached out.
 *
 * Flow:
 * 1. Outreach sent → Store context in Firestore
 * 2. User replies/opens app → Load context
 * 3. User starts voice call → Inject context into LLM
 * 4. Ferni: "I'm glad you called back. I was thinking about..."
 *
 * @module services/outreach/conversation-context-bridge
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getFirestoreDb, cleanForFirestore } from '../superhuman/firestore-utils.js';
const log = createLogger({ module: 'ConversationContextBridge' });
// ============================================================================
// IN-MEMORY CACHE (would be Firestore in production)
// ============================================================================
const recentOutreach = new Map();
const outreachResponses = new Map();
// 24-hour window for direct response context
const DIRECT_RESPONSE_WINDOW = 24 * 60 * 60 * 1000;
/**
 * Load outreach context from Firestore for a user.
 * Returns the most recent non-expired outreach if available.
 */
async function loadOutreachFromFirestore(userId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const snapshot = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('outreach_context')
            .orderBy('sentAt', 'desc')
            .limit(1)
            .get();
        if (snapshot.empty)
            return null;
        const doc = snapshot.docs[0];
        const data = doc.data();
        // Reconstruct the OutreachContext with Date object
        const outreach = {
            outreachId: data.outreachId,
            userId: data.userId,
            type: data.type,
            personaId: data.personaId,
            message: data.message,
            channel: data.channel,
            sentAt: new Date(data.sentAt),
            reason: data.reason,
            mlConfidence: data.mlConfidence,
            triggerDetails: data.triggerDetails,
            predictedEmotionalState: data.predictedEmotionalState,
            suggestedTopics: data.suggestedTopics,
        };
        // Check if still within the response window
        const timeSinceOutreach = Date.now() - outreach.sentAt.getTime();
        if (timeSinceOutreach > DIRECT_RESPONSE_WINDOW) {
            // Expired - clean up Firestore (fire-and-forget with logging)
            doc.ref.delete().catch((error) => {
                log.debug({ error: String(error), userId }, 'Failed to delete expired outreach from Firestore');
            });
            return null;
        }
        return outreach;
    }
    catch (error) {
        log.warn({ error: String(error), userId }, 'Failed to load outreach from Firestore');
        return null;
    }
}
/**
 * Load outreach response from Firestore if available.
 */
async function loadOutreachResponseFromFirestore(userId, outreachId) {
    const db = getFirestoreDb();
    if (!db)
        return null;
    try {
        const doc = await db
            .collection('bogle_users')
            .doc(userId)
            .collection('outreach_context')
            .doc(outreachId)
            .get();
        if (!doc.exists)
            return null;
        const data = doc.data();
        if (!data?.response)
            return null;
        return {
            outreachId: data.response.outreachId,
            responseType: data.response.responseType,
            respondedAt: new Date(data.response.respondedAt),
            replyContent: data.response.replyContent,
            startedVoiceCall: data.response.startedVoiceCall,
        };
    }
    catch (error) {
        log.warn({ error: String(error), userId, outreachId }, 'Failed to load outreach response from Firestore');
        return null;
    }
}
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Store outreach context when sending any proactive message.
 * Call this whenever we send SMS, push, email, or voice message.
 */
export async function storeOutreachContext(context) {
    // Store in memory for fast access
    recentOutreach.set(context.userId, context);
    log.info({ userId: context.userId, type: context.type, channel: context.channel }, '📨 Outreach context stored for conversation bridge');
    // Persist to Firestore (fire-and-forget for non-blocking)
    const db = getFirestoreDb();
    if (db) {
        db.collection('bogle_users')
            .doc(context.userId)
            .collection('outreach_context')
            .doc(context.outreachId)
            .set(cleanForFirestore({
            ...context,
            sentAt: context.sentAt.toISOString(),
        }))
            .catch((error) => {
            log.warn({ error: String(error), userId: context.userId }, 'Failed to persist outreach context to Firestore');
        });
    }
}
/**
 * Record when user responds to outreach.
 */
export async function recordOutreachResponse(userId, responseType, replyContent) {
    // Try memory cache first
    let outreach = recentOutreach.get(userId);
    // If not in cache, try loading from Firestore
    if (!outreach) {
        outreach = (await loadOutreachFromFirestore(userId)) ?? undefined;
        if (outreach) {
            recentOutreach.set(userId, outreach);
        }
    }
    if (!outreach) {
        log.debug({ userId }, 'No recent outreach found for response');
        return;
    }
    const response = {
        outreachId: outreach.outreachId,
        responseType,
        respondedAt: new Date(),
        replyContent,
        startedVoiceCall: responseType === 'call_back',
    };
    outreachResponses.set(outreach.outreachId, response);
    log.info({ userId, outreachId: outreach.outreachId, responseType }, '📱 Outreach response recorded');
    // Persist response to Firestore (fire-and-forget)
    const db = getFirestoreDb();
    if (db) {
        db.collection('bogle_users')
            .doc(userId)
            .collection('outreach_context')
            .doc(outreach.outreachId)
            .update({
            response: cleanForFirestore({
                ...response,
                respondedAt: response.respondedAt.toISOString(),
            }),
        })
            .catch((error) => {
            log.warn({ error: String(error), userId }, 'Failed to persist outreach response to Firestore');
        });
    }
}
/**
 * Get conversation bridge context for a user starting a voice call.
 * This determines if/how the call should reference recent outreach.
 */
export async function getConversationBridgeContext(userId) {
    // Try memory cache first
    let outreach = recentOutreach.get(userId);
    // If not in cache, try loading from Firestore
    if (!outreach) {
        outreach = (await loadOutreachFromFirestore(userId)) ?? undefined;
        if (outreach) {
            recentOutreach.set(userId, outreach);
        }
    }
    if (!outreach) {
        return null;
    }
    const timeSinceOutreach = Date.now() - outreach.sentAt.getTime();
    // Only consider it a direct response if within 24 hours
    const isDirectResponse = timeSinceOutreach < DIRECT_RESPONSE_WINDOW;
    if (!isDirectResponse) {
        // Clear stale context from cache and Firestore
        recentOutreach.delete(userId);
        clearOutreachFromFirestore(userId, outreach.outreachId);
        return null;
    }
    // Try to get response from cache, then Firestore
    let response = outreachResponses.get(outreach.outreachId);
    if (!response) {
        response = (await loadOutreachResponseFromFirestore(userId, outreach.outreachId)) ?? undefined;
        if (response) {
            outreachResponses.set(outreach.outreachId, response);
        }
    }
    // Generate LLM context
    const llmContext = formatBridgeContextForLLM(outreach, response, timeSinceOutreach);
    return {
        outreach,
        response,
        timeSinceOutreach,
        isDirectResponse,
        llmContext,
    };
}
/**
 * Helper to delete outreach from Firestore (fire-and-forget).
 */
function clearOutreachFromFirestore(userId, outreachId) {
    const db = getFirestoreDb();
    if (db) {
        db.collection('bogle_users')
            .doc(userId)
            .collection('outreach_context')
            .doc(outreachId)
            .delete()
            .catch((error) => {
            log.debug({ error: String(error), userId, outreachId }, 'Failed to delete outreach from Firestore');
        });
    }
}
// ============================================================================
// LLM CONTEXT FORMATTING
// ============================================================================
/**
 * Format the bridge context for injection into LLM system prompt.
 * This tells Ferni WHY the user is calling and what to acknowledge.
 */
function formatBridgeContextForLLM(outreach, response, timeSinceOutreach) {
    const hoursSince = Math.round(timeSinceOutreach / (1000 * 60 * 60));
    const timeDescription = hoursSince < 1 ? 'just now' : hoursSince === 1 ? 'an hour ago' : `${hoursSince} hours ago`;
    const lines = [];
    lines.push('[CONVERSATION CONTEXT: FOLLOWING UP ON OUTREACH]');
    lines.push('');
    // What we sent
    lines.push(`You reached out to this user ${timeDescription} via ${outreach.channel}.`);
    lines.push(`Message: "${outreach.message}"`);
    lines.push('');
    // Why we reached out
    lines.push(`Reason: ${outreach.reason}`);
    if (outreach.mlConfidence) {
        lines.push(`This was based on ML predictions with ${(outreach.mlConfidence * 100).toFixed(0)}% confidence.`);
    }
    if (outreach.predictedEmotionalState) {
        lines.push(`At the time, we predicted they might be feeling: ${outreach.predictedEmotionalState}`);
    }
    lines.push('');
    // How they responded
    if (response) {
        if (response.replyContent) {
            lines.push(`They replied: "${response.replyContent}"`);
        }
        else if (response.responseType === 'tap') {
            lines.push('They tapped the notification and opened the app.');
        }
        else if (response.responseType === 'call_back') {
            lines.push('They decided to call you back directly.');
        }
        lines.push('');
    }
    // Suggested approach
    lines.push('GUIDANCE:');
    lines.push('- Acknowledge that you reached out, but naturally');
    lines.push('- Don\'t say "I sent you a message" - say "I was thinking about you"');
    lines.push("- If they're calling back, express genuine warmth that they came");
    lines.push('- Reference the reason for outreach if they bring it up');
    lines.push('- Let THEM lead the conversation direction');
    lines.push('');
    // Example opener based on context
    if (outreach.type === 'ml_prediction' && outreach.predictedEmotionalState) {
        lines.push(`SUGGESTED OPENER: "I'm glad you called. I was thinking about you earlier. How are you feeling?"`);
    }
    else if (outreach.type === 'thinking_of_you') {
        lines.push(`SUGGESTED OPENER: "Hey, it's good to hear your voice. I was just thinking of you."`);
    }
    else if (outreach.type === 'hard_date') {
        lines.push(`SUGGESTED OPENER: "I remembered the date. I wanted to check in. How are you holding up?"`);
    }
    else if (outreach.type === 'follow_up') {
        lines.push(`SUGGESTED OPENER: "Thanks for coming back. I've been thinking about what we talked about."`);
    }
    else {
        lines.push(`SUGGESTED OPENER: "I'm glad you're here. I was hoping we'd talk."`);
    }
    return lines.join('\n');
}
// ============================================================================
// CONTEXT BUILDER INTEGRATION
// ============================================================================
/**
 * Build context injection for the turn processor.
 * Call this from the main context builder pipeline.
 */
export async function buildOutreachBridgeInjection(userId) {
    const bridgeContext = await getConversationBridgeContext(userId);
    if (!bridgeContext) {
        return null;
    }
    return {
        content: bridgeContext.llmContext,
        priority: 95, // Very high priority - this sets the tone for the conversation
    };
}
// ============================================================================
// SMS WEBHOOK HANDLER
// ============================================================================
/**
 * Handle incoming SMS reply to an outreach message.
 * This would be called from a Twilio webhook.
 */
export async function handleSMSReply(userId, fromNumber, body) {
    // Record the response
    await recordOutreachResponse(userId, 'reply', body);
    // Check if reply indicates they want to talk
    const wantsToTalk = detectCallIntent(body);
    if (wantsToTalk) {
        const bridgeContext = await getConversationBridgeContext(userId);
        return {
            shouldTriggerVoiceCall: true,
            voiceCallContext: bridgeContext || undefined,
        };
    }
    return { shouldTriggerVoiceCall: false };
}
/**
 * Detect if SMS reply indicates user wants a voice call.
 */
function detectCallIntent(message) {
    const callPhrases = [
        'call me',
        'can we talk',
        'want to talk',
        'need to talk',
        'lets talk',
        "let's talk",
        'call back',
        'give me a call',
        'ring me',
        'phone me',
        'yes', // Simple affirmation to outreach
        'ok',
        'sure',
        'please',
        'id like that',
        "i'd like that",
    ];
    const lowerMessage = message.toLowerCase();
    return callPhrases.some((phrase) => lowerMessage.includes(phrase));
}
// ============================================================================
// PUSH NOTIFICATION TAP HANDLER
// ============================================================================
/**
 * Handle when user taps a push notification.
 * This prepares context for if they start a voice call from the app.
 */
export async function handlePushNotificationTap(userId, notificationId, action) {
    await recordOutreachResponse(userId, 'tap');
    // If action is "call", they tapped the call button
    if (action === 'call') {
        await recordOutreachResponse(userId, 'call_back');
    }
    log.info({ userId, notificationId, action }, '🔔 Push notification tap recorded');
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Clear outreach context after it's been used.
 * Call this after the first turn of a voice call that used the context.
 */
export function clearOutreachContext(userId) {
    const outreach = recentOutreach.get(userId);
    if (outreach) {
        // Clear from memory
        outreachResponses.delete(outreach.outreachId);
        recentOutreach.delete(userId);
        // Clear from Firestore (fire-and-forget)
        clearOutreachFromFirestore(userId, outreach.outreachId);
        log.debug({ userId }, 'Cleared outreach bridge context');
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export { formatBridgeContextForLLM, detectCallIntent };
//# sourceMappingURL=conversation-context-bridge.js.map