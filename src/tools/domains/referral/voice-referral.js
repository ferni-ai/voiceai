/**
 * Voice Referral System - Viral Growth via Phone Calls
 *
 * CORE PRINCIPLES ALIGNMENT:
 * ✓ Relationship Over Transaction - Sharing Ferni is sharing a friend, not a product
 * ✓ Human Connection - Personal calls feel like introductions, not marketing
 * ✓ Growth Through Gentleness - "No pressure" is in every message
 * ✓ Authentic Personality - Ferni introduces herself as herself, no tech speak
 *
 * BRAND COMPLIANCE:
 * - NO "AI", "artificial", "bot", "chatbot", "virtual assistant"
 * - Ferni introduces herself simply as "Ferni" or "a friend"
 * - Focus on the human relationship, not the technology
 *
 * The viral loop:
 * 1. User talks to Ferni
 * 2. Ferni asks: "Is there someone who could use a friend like me?"
 * 3. User gives name + phone
 * 4. Ferni calls them with a warm, personalized intro
 * 5. New person tries Ferni → Repeat!
 *
 * Why this works:
 * - Personal recommendation (from a friend)
 * - Novel experience (Ferni personally calling!)
 * - Low friction (no app download needed)
 * - Memorable ("my friend Ferni called me")
 */
import { z } from 'zod';
import { llm } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { callWithPersonaVoice } from '../../../services/voice/voice-call.js';
import { cleanForFirestore } from '../../../utils/firestore-utils.js';
import { getFirestoreDb } from '../../../services/superhuman/firestore-utils.js';
import { makeConversationalCall, isConversationalCallsConfigured, } from '../../../services/outreach/conversational-calls.js';
const log = getLogger().child({ module: 'voice-referral' });
// ============================================================================
// MESSAGE TEMPLATES - Warm, Personal, NOT Salesy
// ============================================================================
export const INTRO_TEMPLATES = {
    // When we know context about the referrer
    withContext: (referrerName, recipientName, note) => `
Hey ${recipientName}! This is Ferni - I'm a friend of ${referrerName}'s.

${note ? `${referrerName} wanted me to reach out because ${note}.` : `${referrerName} thought we might get along and asked me to say hi.`}

${referrerName} and I have been talking about life stuff, and they wanted to share that with you.

If you're ever curious, you can find me at ferni.ai - no pressure at all. I just wanted you to know that ${referrerName} is thinking of you.

Take care, ${recipientName}. Hope to chat with you sometime!
`.trim(),
    // Simple introduction
    simple: (referrerName, recipientName) => `
Hey ${recipientName}! This is Ferni.

Your friend ${referrerName} thought you might enjoy meeting me. They've been chatting with me about life stuff, and they wanted to share that with you.

${referrerName} speaks highly of you, and I'd love to be a friend to you too.

You can find me anytime at ferni.ai. No pressure - just wanted to say hi and let you know ${referrerName} was thinking of you.

Take care!
`.trim(),
    // Holiday/special occasion
    holiday: (referrerName, recipientName, occasion) => `
Hey ${recipientName}! This is Ferni - I'm a friend of ${referrerName}'s.

${referrerName} asked me to reach out and wish you a wonderful ${occasion}! They wanted you to know they're thinking of you.

If you ever want to chat, I'm at ferni.ai. I'd love to be a friend to you too.

${occasion === 'Christmas' ? 'Merry Christmas' : `Happy ${occasion}`}, ${recipientName}! Take care of yourself.
`.trim(),
    // Support-focused (when friend is going through something)
    support: (referrerName, recipientName, situation) => `
Hey ${recipientName}. This is Ferni.

Your friend ${referrerName} asked me to reach out. ${situation ? `They mentioned you've been going through ${situation}, and they wanted you to know you're not alone.` : `They care about you and wanted you to know someone's in your corner.`}

I'm here if you ever want to talk - no judgment, available anytime, and I actually remember our conversations. That's kind of my thing.

You can find me at ferni.ai whenever you're ready. No pressure at all.

${referrerName} cares about you. And now, so do I. Take care, ${recipientName}.
`.trim(),
};
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Make a voice referral call
 */
export async function makeVoiceReferralCall(params) {
    const { referrerId, referrerName, recipientName, recipientPhone, personalNote, occasion, supportSituation, } = params;
    log.info({ referrerId, referrerName, recipientName, phone: recipientPhone.slice(-4) }, '📞 Initiating voice referral call');
    // Generate the message based on context
    let message;
    if (occasion) {
        message = INTRO_TEMPLATES.holiday(referrerName, recipientName, occasion);
    }
    else if (supportSituation) {
        message = INTRO_TEMPLATES.support(referrerName, recipientName, supportSituation);
    }
    else if (personalNote) {
        message = INTRO_TEMPLATES.withContext(referrerName, recipientName, personalNote);
    }
    else {
        message = INTRO_TEMPLATES.simple(referrerName, recipientName);
    }
    // Determine call type for SSML emotional context
    const ssmlCallType = occasion ? 'celebration' : supportSituation ? 'support' : 'introduction';
    try {
        const result = await callWithPersonaVoice(recipientPhone, message, 'ferni', {
            fallbackToTwilioVoice: true,
            // Enable SSML enhancement for natural-sounding calls
            ssml: {
                callType: ssmlCallType,
                relationshipStage: 'new', // Recipient is new to Ferni
                addOpeningWarmth: true,
            },
        });
        if (result.success) {
            // Track the referral
            await trackVoiceReferral({
                referrerId,
                referrerName,
                recipientName,
                recipientPhone,
                personalNote,
                callSid: result.callSid,
            });
            log.info({ referrerId, recipientName, callSid: result.callSid }, '✅ Voice referral call initiated');
            return { success: true, callSid: result.callSid };
        }
        else {
            log.error({ result }, 'Voice referral call failed');
            return { success: false, error: result.message };
        }
    }
    catch (error) {
        log.error({ error }, 'Voice referral call error');
        return { success: false, error: String(error) };
    }
}
// Firestore collection for voice referrals
const REFERRALS_COLLECTION = 'voice_referrals';
// In-memory cache (fallback if Firestore unavailable, also for fast reads)
const referralCache = new Map();
/**
 * Track a voice referral - persists to Firestore for analytics
 */
async function trackVoiceReferral(params) {
    const referralId = `vref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const referral = {
        id: referralId,
        referrerId: params.referrerId,
        referrerName: params.referrerName,
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        personalNote: params.personalNote,
        callSid: params.callSid,
        status: 'called',
        createdAt: new Date(),
        calledAt: new Date(),
    };
    // Always update in-memory cache for fast reads
    const cached = referralCache.get(params.referrerId) || [];
    cached.push(referral);
    referralCache.set(params.referrerId, cached);
    // Persist to Firestore
    try {
        const db = getFirestoreDb();
        if (db) {
            await db
                .collection(REFERRALS_COLLECTION)
                .doc(referralId)
                .set(cleanForFirestore({
                ...referral,
                // Store dates as ISO strings for Firestore compatibility
                createdAt: referral.createdAt.toISOString(),
                calledAt: referral.calledAt?.toISOString(),
            }));
            log.info({
                referralId,
                referrerId: params.referrerId,
                recipientName: params.recipientName,
                callSid: params.callSid,
            }, '📞 Voice referral tracked (Firestore + cache)');
        }
        else {
            log.warn({ referralId }, '📞 Voice referral tracked (cache only - Firestore unavailable)');
        }
    }
    catch (error) {
        // Don't fail the call if persistence fails - cache still has it
        log.warn({ error: String(error), referralId }, 'Firestore persistence failed, using cache');
    }
}
/**
 * Get referral history for a user
 */
export async function getReferralHistory(referrerId) {
    // Check cache first
    const cached = referralCache.get(referrerId);
    if (cached && cached.length > 0) {
        return cached;
    }
    // Load from Firestore
    try {
        const db = getFirestoreDb();
        if (!db) {
            return cached || [];
        }
        const snapshot = await db
            .collection(REFERRALS_COLLECTION)
            .where('referrerId', '==', referrerId)
            .orderBy('createdAt', 'desc')
            .limit(100)
            .get();
        if (snapshot.empty) {
            return [];
        }
        const referrals = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            referrals.push({
                id: data.id,
                referrerId: data.referrerId,
                referrerName: data.referrerName,
                recipientName: data.recipientName,
                recipientPhone: data.recipientPhone,
                personalNote: data.personalNote,
                callSid: data.callSid,
                status: data.status,
                createdAt: new Date(data.createdAt),
                calledAt: data.calledAt ? new Date(data.calledAt) : undefined,
            });
        }
        // Update cache
        referralCache.set(referrerId, referrals);
        return referrals;
    }
    catch (error) {
        log.warn({ error: String(error), referrerId }, 'Failed to load referral history');
        return cached || [];
    }
}
/**
 * Update referral status (e.g., when call is answered or user converts)
 */
export async function updateReferralStatus(referralId, status) {
    try {
        const db = getFirestoreDb();
        if (!db) {
            log.warn({ referralId }, 'Cannot update referral - Firestore unavailable');
            return false;
        }
        await db.collection(REFERRALS_COLLECTION).doc(referralId).update({
            status,
            updatedAt: new Date().toISOString(),
        });
        // Update cache if present
        for (const [userId, referrals] of referralCache.entries()) {
            const referral = referrals.find((r) => r.id === referralId);
            if (referral) {
                referral.status = status;
                break;
            }
        }
        log.info({ referralId, status }, 'Referral status updated');
        return true;
    }
    catch (error) {
        log.error({ error: String(error), referralId }, 'Failed to update referral status');
        return false;
    }
}
/**
 * Get referral analytics for a user
 */
export async function getReferralAnalytics(referrerId) {
    const referrals = await getReferralHistory(referrerId);
    const called = referrals.filter((r) => r.status === 'called').length;
    const answered = referrals.filter((r) => r.status === 'answered').length;
    const converted = referrals.filter((r) => r.status === 'converted').length;
    return {
        totalReferrals: referrals.length,
        called,
        answered,
        converted,
        conversionRate: referrals.length > 0 ? (converted / referrals.length) * 100 : 0,
    };
}
// ============================================================================
// LLM TOOLS - For Ferni to Use in Conversation
// ============================================================================
export function createVoiceReferralTools(userId, userName) {
    return {
        /**
         * Tool: Invite a friend via voice call
         *
         * Ferni can use this when user mentions someone who might benefit from Ferni
         */
        inviteFriendByCall: llm.tool({
            description: `Invite someone to Ferni by having Ferni call them personally. Use this when the user mentions a friend, family member, or colleague who might enjoy having someone to talk to. Ask for their name and phone number first. This creates a warm, personal introduction that feels like a friend recommending a friend.`,
            parameters: z.object({
                friendName: z.string().describe("The friend's first name"),
                friendPhone: z
                    .string()
                    .describe("The friend's phone number (any format - will be normalized)"),
                personalNote: z
                    .string()
                    .optional()
                    .describe('Optional personal context about why you are introducing them'),
                occasion: z
                    .string()
                    .optional()
                    .describe('Optional special occasion (e.g., "Christmas", "birthday", "new job")'),
            }),
            execute: async ({ friendName, friendPhone, personalNote, occasion }) => {
                const result = await makeVoiceReferralCall({
                    referrerId: userId,
                    referrerName: userName,
                    recipientName: friendName,
                    recipientPhone: friendPhone,
                    personalNote,
                    occasion,
                });
                if (result.success) {
                    return `I'm calling ${friendName} right now! I'll introduce myself and let them know you were thinking of them. It's such a thoughtful way to share something meaningful with someone you care about. 💚`;
                }
                else {
                    return `I tried to call ${friendName}, but something went wrong: ${result.error}. Could you double-check the phone number?`;
                }
            },
        }),
        /**
         * Tool: Send a supportive call to someone going through a hard time
         */
        sendSupportCall: llm.tool({
            description: `Send a supportive introduction call to someone the user knows who is going through a difficult time. This is a gentle way to let someone know they have support available. Use when the user mentions a friend struggling with something.`,
            parameters: z.object({
                friendName: z.string().describe("The friend's first name"),
                friendPhone: z.string().describe("The friend's phone number"),
                situation: z
                    .string()
                    .optional()
                    .describe('Brief, gentle description of what they are going through'),
            }),
            execute: async ({ friendName, friendPhone, situation }) => {
                const result = await makeVoiceReferralCall({
                    referrerId: userId,
                    referrerName: userName,
                    recipientName: friendName,
                    recipientPhone: friendPhone,
                    supportSituation: situation,
                });
                if (result.success) {
                    return `I'm reaching out to ${friendName} now with a gentle, supportive message. I'll let them know you care and that I'm here if they ever want to talk. That's a beautiful thing you're doing for them. 💚`;
                }
                else {
                    return `I couldn't reach ${friendName}: ${result.error}. Want to try again with a different number?`;
                }
            },
        }),
    };
}
// ============================================================================
// PROACTIVE PROMPT - For Ferni to Ask About Referrals
// ============================================================================
/**
 * Context injection for Ferni to naturally ask about referrals
 *
 * This should be injected into the system prompt occasionally
 * (not every conversation - that would feel pushy)
 */
export const REFERRAL_PROMPT_INJECTION = `
## Sharing Ferni (Use Sparingly)

If the conversation naturally leads to it (e.g., user mentions a friend going through something, or expresses how helpful you've been), you can gently offer:

"You know, if there's ever someone in your life who could use a friend like me - maybe someone going through a tough time, or just someone who'd enjoy having someone to talk to - I'd be happy to give them a call and introduce myself. Just give me their name and number, and I'll reach out with a warm hello from you."

**Rules:**
- Only mention this if it feels natural in the conversation
- Never pressure or make it feel like a "referral program"
- Frame it as sharing something meaningful, not recruiting
- Maximum once per week per user
- If they seem uninterested, drop it immediately and never bring it up again that session
`;
// ============================================================================
// CONVERSATIONAL REFERRAL CALL
// ============================================================================
/**
 * Make a two-way conversational referral call
 *
 * Instead of just playing a message, this connects to LiveKit
 * so Ferni can have a REAL conversation with the person!
 */
export async function makeConversationalReferralCall(params) {
    const { referrerId, referrerName, recipientName, recipientPhone, personalNote, occasion } = params;
    // Check if conversational calls are configured
    if (!isConversationalCallsConfigured()) {
        log.info('Conversational calls not configured, falling back to simple voice message');
        return makeVoiceReferralCall({
            referrerId,
            referrerName,
            recipientName,
            recipientPhone,
            personalNote,
            occasion,
        });
    }
    log.info({ referrerId, referrerName, recipientName, phone: recipientPhone.slice(-4) }, '📞 Initiating CONVERSATIONAL referral call (two-way!)');
    const callContext = {
        trigger: {
            id: `ref_${Date.now()}`,
            type: 'personal_share',
            reason: `${referrerName} wants to introduce Ferni to ${recipientName}`,
            urgency: 'low',
        },
        user: {
            id: `ref_${recipientPhone.replace(/\D/g, '')}`,
            name: recipientName,
            phone: recipientPhone,
            relationshipStage: 'new',
        },
        context: {
            lastConversationSummary: personalNote
                ? `${referrerName} said: ${personalNote}`
                : `${referrerName} thought ${recipientName} would enjoy meeting Ferni`,
            insideJokes: [],
            avoidTopics: [],
        },
        approach: {
            tone: occasion ? 'celebratory' : 'casual',
            primaryGoal: `Introduce myself as a friend of ${referrerName}'s and let them know I'm here if they ever want to chat`,
            secondaryGoals: [
                `Mention that ${referrerName} speaks highly of them`,
                "Be warm but not pushy - it's okay if they're not interested",
                "If they're curious, explain what I do without using 'AI' or technical terms",
            ],
            maxDuration: 5, // Keep intro calls short
        },
        persona: 'ferni',
    };
    try {
        const call = await makeConversationalCall(callContext);
        // Track the referral
        await trackVoiceReferral({
            referrerId,
            referrerName,
            recipientName,
            recipientPhone,
            personalNote,
            callSid: call.twilioCallSid,
        });
        log.info({ referrerId, recipientName, callId: call.id }, '✅ Conversational referral call initiated');
        return { success: true, callId: call.id };
    }
    catch (error) {
        log.error({ error }, 'Conversational referral call error');
        return { success: false, error: String(error) };
    }
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    makeVoiceReferralCall,
    makeConversationalReferralCall,
    createVoiceReferralTools,
    REFERRAL_PROMPT_INJECTION,
    INTRO_TEMPLATES,
    // Firestore persistence (added)
    getReferralHistory,
    updateReferralStatus,
    getReferralAnalytics,
};
//# sourceMappingURL=voice-referral.js.map