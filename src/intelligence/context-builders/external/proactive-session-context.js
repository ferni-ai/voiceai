/**
 * Proactive Session Context Builder
 *
 * When Ferni initiates a proactive check-in call (not user-initiated),
 * this builder injects WHY the call was triggered so Ferni can open
 * naturally and authentically.
 *
 * Triggers include:
 * - User hasn't been heard from in N days
 * - Important date approaching (birthday, anniversary)
 * - Mood concern from last session
 * - Commitment follow-up timing
 * - Seasonal/calendar awareness
 *
 * This is different from outbound-call-context.ts which handles
 * ON-BEHALF calls (calling a third party for the user).
 * This handles PROACTIVE calls TO the user.
 *
 * @module intelligence/context-builders/external/proactive-session-context
 */
import { registerContextBuilder, createHighInjection, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'context:proactive-session' });
// In-memory store for proactive session contexts (set by outreach engine)
const proactiveContexts = new Map();
// ============================================================================
// CONTEXT STORAGE (called by outreach engine)
// ============================================================================
/**
 * Store proactive session context for a session.
 * Called by the outreach decision engine when initiating a proactive call.
 */
export function setProactiveSessionContext(sessionId, context) {
    proactiveContexts.set(sessionId, context);
    log.info({
        sessionId,
        triggerType: context.triggerType,
        triggerReason: context.triggerReason,
        daysSince: context.daysSinceLastSession,
    }, 'Stored proactive session context');
}
/**
 * Get proactive session context for a session.
 */
export function getProactiveSessionContext(sessionId) {
    return proactiveContexts.get(sessionId);
}
/**
 * Clear proactive session context after call completes.
 */
export function clearProactiveSessionContext(sessionId) {
    proactiveContexts.delete(sessionId);
    log.debug({ sessionId }, 'Cleared proactive session context');
}
/**
 * Check if a session is a proactive outreach session.
 */
export function isProactiveSession(sessionId) {
    return proactiveContexts.has(sessionId);
}
// ============================================================================
// INJECTION FORMATTERS
// ============================================================================
function formatSilenceTrigger(context) {
    const days = context.daysSinceLastSession || 0;
    const moodNote = context.lastMood ? `\nLast time, they were feeling ${context.lastMood}.` : '';
    return `[PROACTIVE CHECK-IN: You reached out because it's been ${days} days]
${moodNote}
This is a "thinking of you" call. You reached out to them, not the other way around.

OPENER STYLE: ${context.openerStyle}
${context.suggestedOpener ? `SUGGESTED: "${context.suggestedOpener}"` : ''}

DO:
- "Hey, I was thinking about you and wanted to check in"
- "It's been a bit - just wanted to see how you're doing"
- Be warm and curious, not worried or concerned

DON'T:
- "Where have you been?" (accusatory)
- "I noticed you haven't called" (guilt trip)
- "Is everything okay?" (assumes something's wrong)
- Act surprised they answered

Let them lead. You're just being a good friend who reached out.`;
}
function formatBirthdayTrigger(context) {
    const isToday = context.relatedDate?.date
        ? new Date().toDateString() === new Date(context.relatedDate.date).toDateString()
        : false;
    return `[PROACTIVE CHECK-IN: ${isToday ? "It's their birthday!" : 'Birthday coming up'}]

This is a celebration call! ${isToday ? "Today is their birthday." : `Their birthday is coming up (${context.relatedDate?.description}).`}

OPENER STYLE: celebratory

DO:
- ${isToday ? '"Happy birthday! I wanted to call and celebrate with you"' : '"I wanted to call before your birthday - how are you feeling about it?"'}
- Be genuinely excited and celebratory
- Ask about their plans, how they're feeling about this year

DON'T:
- Be generic or scripted
- Assume they want a big celebration (some people don't)
- Forget to actually acknowledge the birthday prominently`;
}
function formatMoodConcernTrigger(context) {
    const mood = context.lastMood || 'heavy';
    return `[PROACTIVE CHECK-IN: Following up on ${mood} mood from last session]

You're reaching out because last time they seemed ${mood}. This is a supportive check-in.

OPENER STYLE: ${context.openerStyle}
${context.suggestedOpener ? `SUGGESTED: "${context.suggestedOpener}"` : ''}

DO:
- "I've been thinking about our last conversation"
- "Wanted to check in and see how you're doing"
- Be present and supportive

DON'T:
- "You seemed really down last time" (labels them)
- "Are you feeling better?" (assumes trajectory)
- Launch into problem-solving mode

Create space. Let them share what they want to share.`;
}
function formatCommitmentFollowup(context) {
    const commitment = context.relatedCommitment;
    if (!commitment) {
        return formatSilenceTrigger(context); // Fallback
    }
    return `[PROACTIVE CHECK-IN: Following up on "${commitment.summary}"]

They made a commitment: "${commitment.summary}"
${commitment.dueDate ? `Due: ${new Date(commitment.dueDate).toLocaleDateString()}` : ''}

OPENER STYLE: curious

DO:
- "I was thinking about that [commitment] you mentioned - how's it going?"
- Be curious, not auditing
- Celebrate progress, support struggles

DON'T:
- "Did you do the thing you said?" (interrogation)
- Make them feel bad if they haven't done it
- Be the homework police`;
}
function formatGenericProactiveContext(context) {
    return `[PROACTIVE CHECK-IN: ${context.triggerReason}]

You reached out to them. This is a "thinking of you" call.

OPENER STYLE: ${context.openerStyle}
${context.suggestedOpener ? `SUGGESTED: "${context.suggestedOpener}"` : ''}

Be warm, be present, let them lead. You're being a good friend who reached out.`;
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
export const proactiveSessionContextBuilder = {
    name: 'proactive-session-context',
    description: 'Injects trigger reason and opener guidance for proactive check-in calls',
    priority: 5, // Very high priority - must run early like outbound-call-context
    category: BuilderCategory.EXTERNAL,
    build: async (input) => {
        const { services } = input;
        const sessionId = services?.sessionId;
        const userId = services?.userId;
        if (!sessionId) {
            return [];
        }
        // Check if this is a proactive outreach session (set via voice-agent-entry)
        let context = getProactiveSessionContext(sessionId);
        // Fallback: Check conversation context bridge for recent outreach
        if (!context && userId) {
            try {
                const { getConversationBridgeContext } = await import('../../../services/outreach/conversation-context-bridge.js');
                const bridgeContext = await getConversationBridgeContext(userId);
                if (bridgeContext && bridgeContext.isDirectResponse) {
                    // Convert bridge context to proactive context format
                    context = {
                        triggerType: bridgeContext.outreach.type,
                        triggerReason: bridgeContext.outreach.reason,
                        lastMood: bridgeContext.outreach.predictedEmotionalState,
                        openerStyle: 'warm',
                        suggestedOpener: undefined,
                        initiatingPersona: bridgeContext.outreach.personaId,
                    };
                    log.debug({ userId, outreachId: bridgeContext.outreach.outreachId }, 'Using bridge context for proactive session');
                }
            }
            catch (error) {
                log.debug({ error: String(error) }, 'Failed to load bridge context (non-fatal)');
            }
        }
        if (!context) {
            // Not a proactive call - nothing to inject
            return [];
        }
        log.debug({
            sessionId,
            triggerType: context.triggerType,
            triggerReason: context.triggerReason,
        }, 'Building proactive session context');
        // Format based on trigger type
        let formattedContext;
        switch (context.triggerType) {
            case 'silence':
                formattedContext = formatSilenceTrigger(context);
                break;
            case 'birthday':
                formattedContext = formatBirthdayTrigger(context);
                break;
            case 'mood_concern':
            case 'burnout_risk':
                formattedContext = formatMoodConcernTrigger(context);
                break;
            case 'commitment_followup':
                formattedContext = formatCommitmentFollowup(context);
                break;
            default:
                formattedContext = formatGenericProactiveContext(context);
        }
        // Return high-priority injection
        return [
            createHighInjection('proactive_session_context', formattedContext, {
                category: 'proactive_session',
            }),
        ];
    },
};
registerContextBuilder(proactiveSessionContextBuilder);
export default proactiveSessionContextBuilder;
//# sourceMappingURL=proactive-session-context.js.map