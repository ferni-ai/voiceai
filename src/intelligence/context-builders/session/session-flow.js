/**
 * Session Flow Context Builder
 *
 * Tracks session activity and generates "radio show" style transitions.
 * Part of the "More Than Human" music intelligence system (Phase 1.6).
 *
 * This builder:
 * - Tracks topics, emotions, and significant moments
 * - Generates "radio show" style transition announcements
 * - Creates a continuous narrative arc for the session
 * - Provides session summary context for goodbye moments
 */
import { getLogger } from '../../../utils/safe-logger.js';
import { registerContextBuilder, createHintInjection, } from '../index.js';
import { getDJController } from '../../../audio/index.js';
const log = getLogger();
// ============================================================================
// STATE TRACKING
// ============================================================================
const sessionStates = new Map();
const TRANSITION_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes between transitions
const MAX_TRANSITIONS_PER_SESSION = 5; // Don't over-announce
function getOrCreateSessionState(sessionId) {
    let state = sessionStates.get(sessionId);
    if (!state) {
        state = {
            lastTrackedTopic: null,
            lastTrackedEmotion: null,
            lastTransitionTime: 0,
            transitionsThisSession: 0,
            significantMoments: [],
        };
        sessionStates.set(sessionId, state);
    }
    return state;
}
// ============================================================================
// TOPIC DETECTION
// ============================================================================
/**
 * Topic categories that warrant radio-show style transitions
 */
const SIGNIFICANT_TOPICS = [
    'music',
    'memories',
    'feelings',
    'goals',
    'relationships',
    'work',
    'health',
    'dreams',
    'fears',
    'achievements',
    'challenges',
    'gratitude',
    'family',
    'friends',
    'career',
    'hobbies',
    'travel',
    'future',
    'past',
];
/**
 * Topic transition phrases (radio DJ style)
 */
const TOPIC_TRANSITIONS = {
    music: [
        "Ooh, let's talk music!",
        "Now we're getting to the good stuff - music!",
        'Music - my favorite topic!',
    ],
    memories: [
        'Taking a trip down memory lane...',
        'I love hearing about your memories.',
        'Memories are such treasures.',
    ],
    feelings: [
        "Let's check in with how you're feeling.",
        "I'm here for whatever you're feeling.",
        'Thanks for sharing that with me.',
    ],
    goals: [
        "Let's dream big!",
        'I love talking about goals!',
        'Goals are the first step to achievement.',
    ],
    relationships: [
        'Relationships are everything.',
        "Let's talk about the people in your life.",
        'Connection is so important.',
    ],
    work: [
        "Let's talk work life.",
        'How are things going at work?',
        'Work - where we spend so much of our time.',
    ],
    default: ['Interesting shift!', "Let's explore that.", 'Tell me more about that.'],
};
// ============================================================================
// EMOTION TRANSITIONS
// ============================================================================
const EMOTION_TRANSITIONS = {
    happy: ['I can hear the joy in your words!', 'This makes me smile too!', 'What a great mood!'],
    sad: [
        "I'm here with you.",
        "It's okay to feel this way.",
        'I appreciate you sharing this with me.',
    ],
    anxious: ["Let's take a breath together.", "I'm listening.", 'We can work through this.'],
    excited: ['That energy is contagious!', 'I love this excitement!', 'Tell me everything!'],
    nostalgic: [
        'What beautiful memories...',
        "There's something special about looking back.",
        'Those moments matter.',
    ],
    frustrated: ['I hear you.', 'That sounds really frustrating.', "Let's talk about it."],
};
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
/**
 * Build session flow context injections
 */
async function buildSessionFlowContext(input) {
    const { services, analysis, userText } = input;
    const injections = [];
    // Get session ID for state tracking
    const sessionId = services?.sessionId || 'anonymous';
    const state = getOrCreateSessionState(sessionId);
    try {
        // Get DJ Controller for music state (topic tracking now done via emotional-arc.ts)
        const djController = getDJController();
        const isMusicPlaying = djController?.isMusicActive() ?? false;
        // Track topics from analysis
        const currentTopics = analysis?.topics?.detected || [];
        const primaryTopic = analysis?.topics?.primary || currentTopics[0];
        if (primaryTopic && primaryTopic !== state.lastTrackedTopic) {
            // Topic tracking is now handled by emotional-arc.ts
            // Check if this is a significant topic shift
            const isSignificantTopic = SIGNIFICANT_TOPICS.some((t) => primaryTopic.toLowerCase().includes(t));
            if (isSignificantTopic) {
                state.significantMoments.push({
                    type: 'topic_shift',
                    description: primaryTopic,
                    timestamp: Date.now(),
                });
                // Maybe announce transition (with cooldown)
                if (shouldAnnounceTransition(state)) {
                    const transition = getTopicTransition(primaryTopic);
                    if (transition) {
                        injections.push(createHintInjection('session_flow_topic', `[RADIO SHOW MOMENT] You noticed a topic shift to "${primaryTopic}". ` +
                            `You could naturally acknowledge this like: "${transition}" ` +
                            `(Only if it feels natural, don't force it.)`));
                        state.transitionsThisSession++;
                        state.lastTransitionTime = Date.now();
                    }
                }
            }
            state.lastTrackedTopic = primaryTopic;
        }
        // Track emotions from analysis
        const currentEmotion = analysis?.emotion?.primary;
        const emotionIntensity = analysis?.emotion?.intensity || 0;
        if (currentEmotion && currentEmotion !== state.lastTrackedEmotion && emotionIntensity > 0.5) {
            // Emotion tracking is now handled by emotional-arc.ts
            // Record significant emotional moment
            if (emotionIntensity > 0.7) {
                state.significantMoments.push({
                    type: 'emotional_moment',
                    description: currentEmotion,
                    timestamp: Date.now(),
                });
                // Maybe acknowledge emotion (with cooldown)
                if (shouldAnnounceTransition(state)) {
                    const transition = getEmotionTransition(currentEmotion);
                    if (transition) {
                        injections.push(createHintInjection('session_flow_emotion', `[EMOTIONAL AWARENESS] Detected strong ${currentEmotion} (intensity: ${Math.round(emotionIntensity * 100)}%). ` +
                            `You might acknowledge this naturally, perhaps with something like: "${transition}"`));
                    }
                }
            }
            state.lastTrackedEmotion = currentEmotion;
        }
        // Check for goodbye context
        const lowerText = userText?.toLowerCase() || '';
        const isGoodbyeIntent = analysis?.intent?.primary === 'goodbye' ||
            lowerText.includes('bye') ||
            lowerText.includes('goodbye') ||
            lowerText.includes('gotta go') ||
            lowerText.includes('have to go');
        if (isGoodbyeIntent) {
            // Session outro summaries are now generated via conversation-state.ts
            // and the emotional arc tracker for a more comprehensive summary
            log.debug({ sessionId }, 'Goodbye intent detected - summary handled by conversation state');
        }
        // Log tracking
        if (injections.length > 0) {
            log.debug({
                sessionId,
                topic: primaryTopic,
                emotion: currentEmotion,
                transitions: state.transitionsThisSession,
            }, '📻 Session flow context injected');
        }
    }
    catch (error) {
        log.warn({ error: String(error) }, 'Failed to build session flow context');
    }
    return injections;
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Check if we should announce a transition (respecting cooldown and limits)
 */
function shouldAnnounceTransition(state) {
    // Respect max transitions
    if (state.transitionsThisSession >= MAX_TRANSITIONS_PER_SESSION) {
        return false;
    }
    // Respect cooldown
    const timeSinceLastTransition = Date.now() - state.lastTransitionTime;
    if (timeSinceLastTransition < TRANSITION_COOLDOWN_MS) {
        return false;
    }
    // Random chance (60%) to feel more natural
    return Math.random() < 0.6;
}
/**
 * Get a topic transition phrase
 */
function getTopicTransition(topic) {
    const topicLower = topic.toLowerCase();
    // Find matching topic category
    for (const [category, phrases] of Object.entries(TOPIC_TRANSITIONS)) {
        if (topicLower.includes(category)) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    // Use default only sometimes (30%)
    if (Math.random() < 0.3) {
        const defaults = TOPIC_TRANSITIONS.default;
        return defaults[Math.floor(Math.random() * defaults.length)];
    }
    return null;
}
/**
 * Get an emotion transition phrase
 */
function getEmotionTransition(emotion) {
    const emotionLower = emotion.toLowerCase();
    for (const [key, phrases] of Object.entries(EMOTION_TRANSITIONS)) {
        if (emotionLower.includes(key)) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    return null;
}
// ============================================================================
// CLEANUP
// ============================================================================
/**
 * Clear session state (call when session ends)
 */
export function clearSessionFlowState(sessionId) {
    sessionStates.delete(sessionId);
}
/**
 * Get session statistics
 */
export function getSessionFlowStats(sessionId) {
    const state = sessionStates.get(sessionId);
    if (!state)
        return null;
    return {
        topicsDiscussed: state.significantMoments.filter((m) => m.type === 'topic_shift').length,
        emotionalMoments: state.significantMoments.filter((m) => m.type === 'emotional_moment').length,
        transitions: state.transitionsThisSession,
    };
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('session-flow', buildSessionFlowContext);
export { buildSessionFlowContext };
//# sourceMappingURL=session-flow.js.map