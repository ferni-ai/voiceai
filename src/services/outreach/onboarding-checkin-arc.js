/**
 * Onboarding Check-In Arc
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * A warm, intentional sequence of proactive touchpoints during the first 14 days
 * to build relationship, establish habit, and move toward "trusted advisor" status.
 *
 * Philosophy:
 * - NOT a drip campaign - each touchpoint has genuine purpose
 * - Responsive to user engagement level
 * - Uses ML timing for optimal send times
 * - Feels like a friend who genuinely cares about your success
 *
 * Arc Structure:
 * - Day 1: Welcome + first check-in (same day as signup)
 * - Day 2: "How did yesterday go?" follow-up
 * - Day 3-4: First topic deep-dive check-in
 * - Day 5-7: First week reflection
 * - Day 10-14: Building momentum check-in
 * - Day 14: Two-week milestone celebration
 *
 * @module OnboardingCheckInArc
 */
import { createLogger } from '../../utils/safe-logger.js';
import { getTimingRecommendation } from '../contacts/optimal-timing.js';
const log = createLogger({ module: 'OnboardingArc' });
const CHECK_IN_TEMPLATES = [
    {
        type: 'welcome_followup',
        dayRange: [1, 1],
        priority: 'high',
        condition: (state) => state.conversationCount >= 1,
        messageTemplates: [
            (state) => `Hey ${state.name || 'there'}! Just wanted to check in after our first chat. How are you feeling about everything? No pressure to respond - just thinking of you. 🌱`,
            (state) => `${state.name || 'Hey'}! Yesterday was a great start. I've been thinking about what you shared. How are you doing today?`,
        ],
        persona: 'ferni',
    },
    {
        type: 'next_day_check',
        dayRange: [2, 2],
        priority: 'medium',
        messageTemplates: [
            (state) => state.primaryConcern
                ? `Hey! That thing about ${state.primaryConcern} - I've been thinking about it. How did today go?`
                : `Morning! How are you feeling today? Yesterday's conversation is still on my mind. 💚`,
            () => `Quick check-in: how did you sleep? Sometimes that first real conversation stirs things up. I'm here if you want to talk.`,
        ],
        persona: 'ferni',
    },
    {
        type: 'topic_deepdive',
        dayRange: [3, 5],
        priority: 'medium',
        condition: (state) => !!state.primaryConcern,
        messageTemplates: [
            (state) => `I've been reflecting on what you said about ${state.primaryConcern || 'your situation'}. Would love to dig deeper when you have a moment. No rush though.`,
            (state) => `Hey ${state.name || 'friend'} - that thing you mentioned is still on my mind. I have some thoughts if you want to explore together.`,
        ],
        persona: 'contextual',
    },
    {
        type: 'first_week_reflection',
        dayRange: [6, 8],
        priority: 'high',
        messageTemplates: [
            (state) => `${state.name || 'Hey'}! It's been about a week since we started talking. How are you feeling about things? I'd love to hear what's on your mind. 🌟`,
            () => `One week! Time flies. I wanted to check in - what's been the biggest thing you've noticed since we started? Even small shifts count.`,
            (state) => `Week one in the books! ${state.name || 'Friend'}, I'm genuinely curious - how are you really doing? No right answer, just honest.`,
        ],
        persona: 'ferni',
    },
    {
        type: 'momentum_check',
        dayRange: [9, 12],
        priority: 'medium',
        condition: (state) => state.engagementLevel !== 'silent',
        messageTemplates: [
            () => `Hey! Just a quick note to say I'm thinking about you. How's the momentum feeling? Anything you want to work through?`,
            (state) => `${state.name || 'Hey'} - we're building something here. What's been on your mind lately?`,
        ],
        persona: 'contextual',
    },
    {
        type: 'two_week_celebration',
        dayRange: [13, 15],
        priority: 'high',
        messageTemplates: [
            (state) => `Two weeks, ${state.name || 'friend'}! 🎉 That's not nothing. Most people never start, but you did. I'm proud of you. How does it feel?`,
            () => `Two weeks of showing up for yourself. I wanted to mark the moment - you're doing the work, and it matters. What's next? 💚`,
            (state) => `Hey ${state.name || 'there'} - it's been two weeks since we started this journey together. I've really enjoyed getting to know you. Here's to many more conversations.`,
        ],
        persona: 'ferni',
    },
    {
        type: 'habit_nudge',
        dayRange: [4, 14],
        priority: 'low',
        condition: (state) => state.engagementLevel === 'low' || state.engagementLevel === 'silent',
        messageTemplates: [
            (state) => `Hey ${state.name || 'friend'} - just a gentle nudge. I'm here whenever you're ready. No pressure, but I've been thinking about you. 💚`,
            () => `Life gets busy, I know. Just wanted to let you know I'm still here. Whenever you want to talk, I'm ready.`,
            () => `No agenda - just wanted to say hi and check in. Hope you're doing okay. 🌱`,
        ],
        persona: 'ferni',
    },
    {
        type: 'win_celebration',
        dayRange: [1, 14],
        priority: 'high',
        condition: (state) => state.milestonesReached.includes('first_topic_explored'),
        messageTemplates: [
            (state) => `${state.name || 'Hey'}! I noticed you dove deep into something today. That takes courage. How do you feel about it?`,
            () => `That conversation we just had? That was real work. I wanted to acknowledge it. You're doing great. 🌟`,
        ],
        persona: 'ferni',
    },
];
// ============================================================================
// ONBOARDING ARC ENGINE
// ============================================================================
// In-memory state (backed by Firestore in production)
const onboardingStates = new Map();
/**
 * Initialize onboarding state for a new user
 */
export function initializeOnboarding(userId, profile) {
    const state = {
        userId,
        signupDate: new Date(),
        daysSinceSignup: 0,
        milestonesReached: ['signup'],
        conversationCount: 0,
        engagementLevel: 'high', // Start optimistic
        checkInsSent: [],
        name: profile?.name,
        primaryConcern: undefined,
        arcComplete: false,
    };
    onboardingStates.set(userId, state);
    log.info({ userId, name: profile?.name }, '🚀 Onboarding arc initialized');
    return state;
}
/**
 * Get onboarding state for a user
 */
export function getOnboardingState(userId) {
    return onboardingStates.get(userId);
}
/**
 * Update onboarding state after a conversation
 */
export function recordConversation(userId, context) {
    const state = onboardingStates.get(userId);
    if (!state)
        return;
    state.conversationCount += 1;
    state.lastConversationDate = new Date();
    state.daysSinceSignup = Math.floor((Date.now() - state.signupDate.getTime()) / (24 * 60 * 60 * 1000));
    if (context?.primaryConcern) {
        state.primaryConcern = context.primaryConcern;
    }
    if (context?.persona) {
        state.preferredPersona = context.persona;
    }
    // Update milestones
    if (state.conversationCount === 1 && !state.milestonesReached.includes('first_conversation')) {
        state.milestonesReached.push('first_conversation');
        state.lastMilestoneDate = new Date();
    }
    // Update engagement level
    state.engagementLevel = calculateEngagementLevel(state);
    onboardingStates.set(userId, state);
    log.debug({ userId, conversationCount: state.conversationCount }, 'Conversation recorded');
}
/**
 * Record that a topic was explored in depth
 */
export function recordTopicExplored(userId, topic) {
    const state = onboardingStates.get(userId);
    if (!state)
        return;
    state.primaryConcern = topic;
    if (!state.milestonesReached.includes('first_topic_explored')) {
        state.milestonesReached.push('first_topic_explored');
        state.lastMilestoneDate = new Date();
    }
    onboardingStates.set(userId, state);
}
/**
 * Mark a check-in as sent
 */
export function recordCheckInSent(userId, type, responseReceived = false) {
    const state = onboardingStates.get(userId);
    if (!state)
        return;
    state.checkInsSent.push({
        type,
        sentAt: new Date(),
        responseReceived,
    });
    onboardingStates.set(userId, state);
    log.info({ userId, type }, '📬 Onboarding check-in recorded');
}
/**
 * Mark that user responded to a check-in
 */
export function recordCheckInResponse(userId) {
    const state = onboardingStates.get(userId);
    if (!state || state.checkInsSent.length === 0)
        return;
    // Mark the most recent check-in as responded
    const lastCheckIn = state.checkInsSent[state.checkInsSent.length - 1];
    lastCheckIn.responseReceived = true;
    onboardingStates.set(userId, state);
}
/**
 * Calculate engagement level based on activity
 */
function calculateEngagementLevel(state) {
    const daysSinceLastConvo = state.lastConversationDate
        ? Math.floor((Date.now() - state.lastConversationDate.getTime()) / (24 * 60 * 60 * 1000))
        : state.daysSinceSignup;
    const avgConvosPerDay = state.conversationCount / Math.max(1, state.daysSinceSignup);
    if (daysSinceLastConvo >= 5)
        return 'silent';
    if (daysSinceLastConvo >= 3 || avgConvosPerDay < 0.3)
        return 'low';
    if (avgConvosPerDay >= 1)
        return 'high';
    return 'medium';
}
// ============================================================================
// CHECK-IN SCHEDULING
// ============================================================================
/**
 * Get pending check-ins for a user based on their onboarding state
 */
export async function getPendingCheckIns(userId) {
    const state = onboardingStates.get(userId);
    if (!state || state.arcComplete)
        return [];
    // Update days since signup
    state.daysSinceSignup = Math.floor((Date.now() - state.signupDate.getTime()) / (24 * 60 * 60 * 1000));
    state.engagementLevel = calculateEngagementLevel(state);
    // Check if arc should be complete
    if (state.daysSinceSignup > 14) {
        state.arcComplete = true;
        state.arcCompletedAt = new Date();
        onboardingStates.set(userId, state);
        log.info({ userId }, '🎉 Onboarding arc completed');
        return [];
    }
    const pendingCheckIns = [];
    const alreadySentTypes = new Set(state.checkInsSent.map((c) => c.type));
    for (const template of CHECK_IN_TEMPLATES) {
        // Skip if already sent
        if (alreadySentTypes.has(template.type))
            continue;
        // Check day range
        const [minDay, maxDay] = template.dayRange;
        if (state.daysSinceSignup < minDay || state.daysSinceSignup > maxDay)
            continue;
        // Check condition
        if (template.condition && !template.condition(state))
            continue;
        // Don't schedule habit nudge if engagement is good
        if (template.type === 'habit_nudge' && state.engagementLevel === 'high')
            continue;
        // Generate message
        const messageTemplate = template.messageTemplates[Math.floor(Math.random() * template.messageTemplates.length)];
        const message = messageTemplate(state);
        // Determine persona
        const persona = template.persona === 'contextual' ? state.preferredPersona || 'ferni' : template.persona;
        // Get optimal send time using ML
        let scheduledFor = new Date();
        try {
            // Use a synthetic "contact" ID for user self-timing
            const timing = await getTimingRecommendation(userId, `user_${userId}`, state.name || 'User');
            scheduledFor = timing.suggestedSendTime;
        }
        catch {
            // Fall back to 2 hours from now during business hours
            scheduledFor = getDefaultSendTime();
        }
        pendingCheckIns.push({
            id: `onboarding_${userId}_${template.type}_${Date.now()}`,
            userId,
            type: template.type,
            scheduledFor,
            persona,
            message,
            reason: `Onboarding arc: Day ${state.daysSinceSignup}, ${template.type}`,
            priority: template.priority,
        });
    }
    // Sort by priority (high first) then by day range
    pendingCheckIns.sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
    // Only return the highest priority check-in to avoid overwhelming
    return pendingCheckIns.slice(0, 1);
}
/**
 * Get default send time (2 hours from now, during business hours)
 */
function getDefaultSendTime() {
    const now = new Date();
    const sendTime = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    // Adjust to business hours (9 AM - 8 PM)
    const hours = sendTime.getHours();
    if (hours < 9) {
        sendTime.setHours(9, 0, 0, 0);
    }
    else if (hours >= 20) {
        sendTime.setDate(sendTime.getDate() + 1);
        sendTime.setHours(10, 0, 0, 0);
    }
    return sendTime;
}
/**
 * Check if user is in onboarding period
 */
export function isInOnboardingPeriod(userId) {
    const state = onboardingStates.get(userId);
    if (!state)
        return false;
    return !state.arcComplete && state.daysSinceSignup <= 14;
}
/**
 * Get onboarding progress summary
 */
export function getOnboardingProgress(userId) {
    const state = onboardingStates.get(userId);
    if (!state)
        return null;
    return {
        daysSinceSignup: state.daysSinceSignup,
        milestonesReached: state.milestonesReached.length,
        checkInsSent: state.checkInsSent.length,
        engagementLevel: state.engagementLevel,
        arcComplete: state.arcComplete,
    };
}
// ============================================================================
// EXPORTS
// ============================================================================
export const onboardingArc = {
    initialize: initializeOnboarding,
    getState: getOnboardingState,
    recordConversation,
    recordTopicExplored,
    recordCheckInSent,
    recordCheckInResponse,
    getPendingCheckIns,
    isInOnboarding: isInOnboardingPeriod,
    getProgress: getOnboardingProgress,
};
export default onboardingArc;
//# sourceMappingURL=onboarding-checkin-arc.js.map