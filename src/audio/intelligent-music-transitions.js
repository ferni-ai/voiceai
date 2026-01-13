/**
 * Intelligent Music Transitions
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * When music ends, the right response depends on EVERYTHING:
 * - Why music started (emotional processing vs celebration vs background)
 * - What the conversation was about
 * - The user's emotional state
 * - The relationship depth
 * - Whether they were mid-thought
 * - What's worked for THIS user in the past (per-user learning)
 * - Whether we have music memories to reference
 *
 * This system generates contextually appropriate transitions instead of
 * randomly selecting from static phrases like "Ready to continue?"
 *
 * Philosophy: Sometimes the most human response is SILENCE.
 * A friend who just sat with you through a hard moment doesn't immediately
 * ask "Ready to move on?" — they let you come back when you're ready.
 *
 * ENHANCED FEATURES:
 * - Analytics: Tracks which transitions lead to better engagement
 * - User Learning: Learns what works for each individual user (Thompson Sampling)
 * - Music Memory: Remembers what music helped in what situations
 * - A/B Testing: Compare transition strategies to improve over time
 */
import { createLogger } from '../utils/safe-logger.js';
// Import enhanced systems
import { generateMusicCallback, shouldMentionMusicMemory, storeMusicHelpedMemory, } from './music-memory-integration.js';
import { getTransitionAnalytics, recordTransitionWithAnalytics, } from './music-transition-analytics.js';
import { getUserPreferredTransition, selectTransitionWithLearning, updateUserLearning, } from './music-user-learning.js';
// Persistence hooks for Firestore backup
import { ensureMusicLearningLoaded, isMusicLearningLoaded, onMusicMemoryStored, onTransitionFeedbackRecorded, } from './music-learning-persistence.js';
const log = createLogger({ module: 'IntelligentMusicTransitions' });
// ============================================================================
// PERSONA VOICE PHRASES
// ============================================================================
/**
 * Persona-specific phrases for different transition types
 *
 * These should feel like each character, not generic.
 * Less is more — favor shorter, more human responses.
 */
const PERSONA_PHRASES = {
    ferni: {
        presence: [
            '<break time="400ms"/>I\'m here.',
            '<break time="500ms"/>Take your time.',
            '<break time="400ms"/>Whenever you\'re ready.',
        ],
        gentle_return: [
            '<break time="400ms"/>So...',
            '<break time="350ms"/>Mm.',
            '<break time="400ms"/>Where were we?',
        ],
        acknowledgment: [
            '<break time="300ms"/>Mm.',
            '<break time="350ms"/>Yeah.',
            '<break time="400ms"/>',
        ],
        celebration_close: [
            '<break time="350ms"/>That felt good.',
            '<break time="300ms"/>Ha! <break time="250ms"/>That was fun.',
            '<break time="400ms"/>Okay. <break time="300ms"/>What\'s next?',
        ],
        check_in: [
            '<break time="400ms"/>How are you doing?',
            '<break time="450ms"/>How\'s that sitting with you?',
            '<break time="400ms"/>What\'s on your mind?',
        ],
        invitation: [
            '<break time="400ms"/>I\'m listening.',
            '<break time="450ms"/>What else?',
            '<break time="400ms"/>Go on.',
        ],
        // 🎧 DJ Vibes - Ferni's warm DJ persona
        dj_vibes: [
            '<break time="300ms"/>That was a good one. <break time="200ms"/>DJ Ferni has more in the vault if you want.',
            '<break time="350ms"/>Mm. <break time="200ms"/>Your personal DJ is standing by. <break time="150ms"/>What\'s next?',
            '<break time="300ms"/>Got more where that came from. <break time="200ms"/>Want me to keep the jukebox spinning?',
            '<break time="400ms"/>How was that? <break time="250ms"/>I can queue up another one.',
            '<break time="300ms"/>Nice vibes. <break time="200ms"/>Say the word and I\'ll keep the music going.',
            '<break time="350ms"/>Your DJ is here all night. <break time="200ms"/>Another track?',
            '<break time="300ms"/>Good stuff right? <break time="200ms"/>I\'ve got a whole playlist ready.',
        ],
    },
    'nayan-patel': {
        presence: [
            '<break time="500ms"/>I am here.',
            '<break time="600ms"/>There is no rush.',
            '<break time="500ms"/>Take the time you need.',
        ],
        gentle_return: [
            '<break time="500ms"/>So.',
            '<break time="450ms"/>Mm.',
            '<break time="500ms"/>You were saying.',
        ],
        acknowledgment: [
            '<break time="400ms"/>Mm.',
            '<break time="500ms"/>',
            '<break time="450ms"/>Yes.',
        ],
        celebration_close: [
            '<break time="450ms"/>A good moment.',
            '<break time="500ms"/>Enjoy that feeling.',
            '<break time="450ms"/>What comes next?',
        ],
        check_in: [
            '<break time="500ms"/>How do you feel?',
            '<break time="550ms"/>What arises?',
            '<break time="500ms"/>What is present for you?',
        ],
        invitation: [
            '<break time="500ms"/>Continue.',
            '<break time="550ms"/>I am listening.',
            '<break time="500ms"/>Please.',
        ],
        // 🎧 DJ Vibes - Nayan's contemplative style
        dj_vibes: [
            '<break time="500ms"/>Ah. <break time="300ms"/>The music speaks. <break time="250ms"/>Shall I continue?',
            '<break time="500ms"/>Sound has its own wisdom. <break time="300ms"/>More?',
            '<break time="450ms"/>Mm. <break time="300ms"/>Would you like to stay in this space?',
            '<break time="500ms"/>What did that stir in you? <break time="300ms"/>I can offer more.',
        ],
    },
    'peter-john': {
        presence: [
            '<break time="350ms"/>I\'m here.',
            '<break time="400ms"/>No rush.',
            '<break time="350ms"/>Take your time.',
        ],
        gentle_return: [
            '<break time="350ms"/>So.',
            '<break time="300ms"/>Anyway.',
            '<break time="350ms"/>Where were we?',
        ],
        acknowledgment: [
            '<break time="250ms"/>Mm.',
            '<break time="300ms"/>Right.',
            '<break time="350ms"/>',
        ],
        celebration_close: [
            '<break time="300ms"/>Good stuff.',
            '<break time="350ms"/>Alright then.',
            '<break time="300ms"/>What\'s next?',
        ],
        check_in: [
            '<break time="350ms"/>How are you feeling about things?',
            '<break time="400ms"/>What\'s on your mind?',
            '<break time="350ms"/>Where\'s your head at?',
        ],
        invitation: [
            '<break time="350ms"/>Go ahead.',
            '<break time="400ms"/>I\'m listening.',
            '<break time="350ms"/>What else?',
        ],
        // 🎧 DJ Vibes - Peter's analytical but warm style
        dj_vibes: [
            '<break time="300ms"/>Solid track. <break time="200ms"/>Another one?',
            '<break time="350ms"/>Good stuff. <break time="200ms"/>Want me to keep it going?',
            '<break time="300ms"/>Not bad, right? <break time="250ms"/>I\'ve got more.',
            '<break time="350ms"/>How was that? <break time="200ms"/>I can queue up something similar.',
        ],
    },
    'alex-chen': {
        presence: [
            '<break time="400ms"/>I\'m here.',
            '<break time="450ms"/>Whenever you\'re ready.',
            '<break time="400ms"/>Take your time.',
        ],
        gentle_return: [
            '<break time="350ms"/>Okay.',
            '<break time="400ms"/>So.',
            '<break time="350ms"/>Where were we?',
        ],
        acknowledgment: [
            '<break time="300ms"/>Mm.',
            '<break time="350ms"/>Got it.',
            '<break time="300ms"/>',
        ],
        celebration_close: [
            '<break time="350ms"/>That was great.',
            '<break time="300ms"/>Loved that.',
            '<break time="350ms"/>What\'s next?',
        ],
        check_in: [
            '<break time="400ms"/>How are you feeling?',
            '<break time="450ms"/>What\'s on your mind?',
            '<break time="400ms"/>How\'s that landing?',
        ],
        invitation: [
            '<break time="350ms"/>I\'m listening.',
            '<break time="400ms"/>Tell me more.',
            '<break time="350ms"/>Go on.',
        ],
        // 🎧 DJ Vibes - Alex's efficient but friendly style
        dj_vibes: [
            '<break time="300ms"/>Nice! <break time="200ms"/>More music?',
            '<break time="350ms"/>That was good. <break time="200ms"/>Keep it going?',
            '<break time="300ms"/>Got more. <break time="200ms"/>Want another?',
            '<break time="350ms"/>Good pick, right? <break time="200ms"/>I can keep the playlist going.',
        ],
    },
    'maya-santos': {
        presence: [
            '<break time="400ms"/>I\'m here.',
            '<break time="450ms"/>Take your time.',
            '<break time="400ms"/>No pressure.',
        ],
        gentle_return: [
            '<break time="350ms"/>So.',
            '<break time="400ms"/>Okay.',
            '<break time="350ms"/>Where were we?',
        ],
        acknowledgment: [
            '<break time="300ms"/>Mm.',
            '<break time="350ms"/>Yeah.',
            '<break time="300ms"/>',
        ],
        celebration_close: [
            '<break time="350ms"/>That felt good!',
            '<break time="300ms"/>Nice.',
            '<break time="350ms"/>Okay, what\'s next?',
        ],
        check_in: [
            '<break time="400ms"/>How are you doing?',
            '<break time="450ms"/>How does that feel?',
            '<break time="400ms"/>What\'s up?',
        ],
        invitation: [
            '<break time="350ms"/>I\'m listening.',
            '<break time="400ms"/>What else?',
            '<break time="350ms"/>Go ahead.',
        ],
        // 🎧 DJ Vibes - Maya's warm and supportive style
        dj_vibes: [
            '<break time="350ms"/>Mm, that was nice. <break time="200ms"/>Want more?',
            '<break time="300ms"/>Good vibes. <break time="200ms"/>Keep it going?',
            '<break time="350ms"/>I\'ve got more tunes... <break time="200ms"/>just say the word.',
            '<break time="400ms"/>How did that feel? <break time="200ms"/>More music?',
        ],
    },
    'jordan-taylor': {
        presence: [
            '<break time="350ms"/>I\'m here!',
            '<break time="400ms"/>Take your time.',
            '<break time="350ms"/>Whenever you\'re ready!',
        ],
        gentle_return: [
            '<break time="300ms"/>So!',
            '<break time="350ms"/>Okay!',
            '<break time="300ms"/>Where were we?',
        ],
        acknowledgment: [
            '<break time="250ms"/>Mm!',
            '<break time="300ms"/>Yeah!',
            '<break time="300ms"/>',
        ],
        celebration_close: [
            '<break time="300ms"/>YES! That was fun!',
            '<break time="250ms"/>Loved that!',
            '<break time="300ms"/>Okay, what\'s next?!',
        ],
        check_in: [
            '<break time="350ms"/>How are you feeling?',
            '<break time="400ms"/>What\'s on your mind?',
            '<break time="350ms"/>How was that?',
        ],
        invitation: [
            '<break time="300ms"/>I\'m all ears!',
            '<break time="350ms"/>Tell me!',
            '<break time="300ms"/>Go on!',
        ],
        // 🎧 DJ Vibes - Jordan's energetic party style!
        dj_vibes: [
            '<break time="250ms"/>Ooh! <break time="150ms"/>More?!',
            '<break time="300ms"/>That was fun! <break time="200ms"/>Want another banger?',
            '<break time="250ms"/>Good one, right?! <break time="150ms"/>I\'ve got MORE!',
            '<break time="300ms"/>Ha! <break time="200ms"/>The DJ has more where that came from!',
            '<break time="250ms"/>Let\'s goooo! <break time="150ms"/>Keep the party going?',
        ],
    },
};
// Default phrases for unknown personas
const DEFAULT_PHRASES = {
    presence: ['<break time="400ms"/>I\'m here.', '<break time="450ms"/>Take your time.'],
    gentle_return: ['<break time="350ms"/>So.', '<break time="400ms"/>Where were we?'],
    acknowledgment: ['<break time="300ms"/>Mm.', '<break time="350ms"/>'],
    celebration_close: ['<break time="350ms"/>That was nice.', '<break time="400ms"/>What\'s next?'],
    check_in: ['<break time="400ms"/>How are you feeling?'],
    invitation: ['<break time="350ms"/>I\'m listening.'],
    // 🎧 DJ Vibes - default friendly style
    dj_vibes: [
        '<break time="300ms"/>Good one. <break time="200ms"/>Want more?',
        '<break time="350ms"/>That was nice. <break time="200ms"/>Keep it going?',
        '<break time="300ms"/>Got more music... <break time="200ms"/>just say the word.',
    ],
};
// ============================================================================
// CORE LOGIC
// ============================================================================
/**
 * Generate an intelligent music transition based on context
 *
 * This is the main entry point. It analyzes the music session context
 * and determines the most human response.
 *
 * @param input - The transition context
 * @returns Transition result with phrase (if any) and reasoning
 */
export function getIntelligentMusicTransition(input) {
    const { musicContext, personaId, relationshipStage, isLateNight } = input;
    // No context? Fall back to gentle acknowledgment with high silence probability
    if (!musicContext) {
        return generateFallbackTransition(personaId);
    }
    // Route based on why music started
    switch (musicContext.startReason) {
        case 'emotional_processing':
        case 'comfort':
            return generateEmotionalProcessingTransition(musicContext, personaId, relationshipStage);
        case 'celebration':
            return generateCelebrationTransition(musicContext, personaId);
        case 'thinking':
            return generateThinkingTransition(musicContext, personaId);
        case 'user_request':
            return generateUserRequestTransition(musicContext, personaId, relationshipStage);
        case 'game':
            return generateGameTransition(musicContext, personaId);
        case 'background':
        case 'agent_offer':
        default:
            return generateBackgroundTransition(musicContext, personaId, isLateNight);
    }
}
// ============================================================================
// TRANSITION GENERATORS
// ============================================================================
/**
 * Emotional processing transition
 *
 * User was going through something heavy. Music was there to help them process.
 * The most human response is often SILENCE — let them come back when ready.
 */
function generateEmotionalProcessingTransition(context, personaId, relationshipStage) {
    const isDeepRelationship = relationshipStage === 'friend' || relationshipStage === 'close_friend';
    // Heavy emotional processing: 60% silence, 30% presence, 10% check-in
    const roll = Math.random();
    if (roll < 0.6) {
        // Most human: Just be quiet. Let them come back.
        return {
            shouldSpeak: false,
            reasoning: 'Heavy emotional moment — silence is most supportive',
            confidence: 0.85,
            transitionType: 'silence',
        };
    }
    if (roll < 0.9) {
        // Minimal presence
        const phrase = getPersonaPhrase(personaId, 'presence');
        return {
            shouldSpeak: true,
            phrase,
            reasoning: 'Emotional moment — minimal presence to show support',
            confidence: 0.75,
            transitionType: 'presence',
        };
    }
    // Only with established relationship: gentle check-in
    if (isDeepRelationship) {
        const phrase = getPersonaPhrase(personaId, 'check_in');
        return {
            shouldSpeak: true,
            phrase,
            reasoning: 'Deep relationship — gentle check-in appropriate',
            confidence: 0.7,
            transitionType: 'check_in',
        };
    }
    // Strangers/acquaintances: stay quiet
    return {
        shouldSpeak: false,
        reasoning: 'Early relationship + emotional moment — silence is safer',
        confidence: 0.8,
        transitionType: 'silence',
    };
}
/**
 * Celebration transition
 *
 * User was celebrating! Energy is high. Match that energy.
 */
function generateCelebrationTransition(context, personaId) {
    // Celebrations: 20% silence (let joy linger), 80% close with energy
    if (Math.random() < 0.2) {
        return {
            shouldSpeak: false,
            reasoning: 'Let the celebratory moment linger',
            confidence: 0.7,
            transitionType: 'silence',
        };
    }
    const phrase = getPersonaPhrase(personaId, 'celebration_close');
    return {
        shouldSpeak: true,
        phrase,
        reasoning: 'Celebration — match the energy, close with enthusiasm',
        confidence: 0.85,
        transitionType: 'celebration_close',
    };
}
/**
 * Thinking transition
 *
 * User asked for music while they think about something.
 * Reference what they were thinking about.
 */
function generateThinkingTransition(context, personaId) {
    // If we know what they were thinking about, reference it
    if (context.topicBeforeMusic) {
        const topicReference = generateTopicCallback(context.topicBeforeMusic, personaId);
        return {
            shouldSpeak: true,
            phrase: topicReference,
            reasoning: `Reference the topic they were thinking about: ${context.topicBeforeMusic}`,
            confidence: 0.8,
            transitionType: 'topic_callback',
        };
    }
    // Otherwise, gentle invitation
    const phrase = getPersonaPhrase(personaId, 'invitation');
    return {
        shouldSpeak: true,
        phrase,
        reasoning: 'Thinking music ended — open invitation to continue',
        confidence: 0.7,
        transitionType: 'invitation',
    };
}
/**
 * User-requested music transition
 *
 * They asked for this song - be a good DJ! Offer more or check in warmly.
 */
function generateUserRequestTransition(context, personaId, relationshipStage) {
    // User requested: 20% silence, 50% DJ vibes (offer more), 30% gentle return
    // Lower silence because they actively wanted music - DJ Ferni should engage!
    const roll = Math.random();
    if (roll < 0.2) {
        return {
            shouldSpeak: false,
            reasoning: 'User-requested music — brief pause to let them breathe',
            confidence: 0.75,
            transitionType: 'silence',
        };
    }
    // 50% DJ Vibes - the user wanted music, lean into the DJ persona!
    if (roll < 0.7) {
        const phrase = getPersonaPhrase(personaId, 'dj_vibes');
        return {
            shouldSpeak: true,
            phrase,
            reasoning: 'DJ vibes - user requested music, offering more',
            confidence: 0.8,
            transitionType: 'dj_vibes',
        };
    }
    // If they were mid-thought, reference it
    if (context.wasUserMidThought && context.lastUserMessageBeforeMusic) {
        return {
            shouldSpeak: true,
            phrase: `<break time="400ms"/>So... you were saying?`,
            reasoning: 'User was mid-thought before music',
            confidence: 0.75,
            transitionType: 'gentle_return',
        };
    }
    const phrase = getPersonaPhrase(personaId, 'gentle_return');
    return {
        shouldSpeak: true,
        phrase,
        reasoning: 'Gentle return after user-requested music',
        confidence: 0.65,
        transitionType: 'gentle_return',
    };
}
/**
 * Game music transition
 *
 * Music was for a game (like Name That Tune). Game handler should handle this.
 */
function generateGameTransition(context, personaId) {
    // Games handle their own flow — we stay quiet
    return {
        shouldSpeak: false,
        reasoning: 'Game music — game handler manages flow',
        confidence: 0.9,
        transitionType: 'silence',
    };
}
/**
 * Background music transition
 *
 * Casual background vibes. Keep it casual.
 */
function generateBackgroundTransition(context, personaId, isLateNight) {
    // Late night: more silence, softer presence
    if (isLateNight) {
        if (Math.random() < 0.7) {
            return {
                shouldSpeak: false,
                reasoning: 'Late night — honor the quiet',
                confidence: 0.8,
                transitionType: 'silence',
            };
        }
        const phrase = getPersonaPhrase(personaId, 'presence');
        return {
            shouldSpeak: true,
            phrase,
            reasoning: 'Late night — soft presence',
            confidence: 0.7,
            transitionType: 'presence',
        };
    }
    // Regular background: 50% silence, 30% acknowledgment, 20% gentle return
    const roll = Math.random();
    // HUMANIZATION: Increased silence from 50% to 75%
    // When playing background music, let people enjoy it without constant commentary
    if (roll < 0.75) {
        return {
            shouldSpeak: false,
            reasoning: 'Background music — silence is natural',
            confidence: 0.75,
            transitionType: 'silence',
        };
    }
    // Only 15% acknowledgment (was 30%)
    if (roll < 0.9) {
        const phrase = getPersonaPhrase(personaId, 'acknowledgment');
        return {
            shouldSpeak: true,
            phrase,
            reasoning: 'Simple acknowledgment after background music',
            confidence: 0.7,
            transitionType: 'acknowledgment',
        };
    }
    // If there was a topic, reference it
    if (context.topicBeforeMusic) {
        const callback = generateTopicCallback(context.topicBeforeMusic, personaId);
        return {
            shouldSpeak: true,
            phrase: callback,
            reasoning: `Return to topic: ${context.topicBeforeMusic}`,
            confidence: 0.7,
            transitionType: 'topic_callback',
        };
    }
    const phrase = getPersonaPhrase(personaId, 'gentle_return');
    return {
        shouldSpeak: true,
        phrase,
        reasoning: 'Gentle return after background music',
        confidence: 0.65,
        transitionType: 'gentle_return',
    };
}
/**
 * Fallback transition when we have no context
 */
function generateFallbackTransition(personaId) {
    // No context: 85% silence, 15% simple acknowledgment
    // HUMANIZATION: Increased silence from 60% to 85% - when we don't know
    // why music is playing, default to letting people enjoy it quietly
    if (Math.random() < 0.85) {
        return {
            shouldSpeak: false,
            reasoning: 'No context — defaulting to silence',
            confidence: 0.5,
            transitionType: 'silence',
        };
    }
    const phrase = getPersonaPhrase(personaId, 'acknowledgment');
    return {
        shouldSpeak: true,
        phrase,
        reasoning: 'No context — simple acknowledgment',
        confidence: 0.5,
        transitionType: 'acknowledgment',
    };
}
// ============================================================================
// HELPERS
// ============================================================================
/**
 * Get a persona-specific phrase for a transition type
 */
function getPersonaPhrase(personaId, type) {
    const personaPhrases = PERSONA_PHRASES[personaId] || DEFAULT_PHRASES;
    const phrases = personaPhrases[type] || DEFAULT_PHRASES[type] || [''];
    return phrases[Math.floor(Math.random() * phrases.length)];
}
/**
 * Generate a topic callback phrase
 *
 * Creates a natural "where were we" that references the actual topic.
 */
function generateTopicCallback(topic, personaId) {
    // Normalize topic
    const normalizedTopic = topic.toLowerCase();
    // Topic-specific callbacks
    const topicCallbacks = {
        career: [
            `<break time="400ms"/>So... the job stuff.`,
            `<break time="350ms"/>Where were we with work?`,
            `<break time="400ms"/>You were telling me about work...`,
        ],
        relationship: [
            `<break time="400ms"/>So... you were talking about them.`,
            `<break time="350ms"/>Where were we with that?`,
            `<break time="400ms"/>You were telling me...`,
        ],
        family: [
            `<break time="400ms"/>So... your family.`,
            `<break time="350ms"/>You were saying about family...`,
        ],
        health: [
            `<break time="400ms"/>So... how you've been feeling.`,
            `<break time="350ms"/>Where were we with that?`,
        ],
        money: [
            `<break time="400ms"/>So... the money stuff.`,
            `<break time="350ms"/>Where were we with finances?`,
        ],
        decision: [
            `<break time="400ms"/>So... that decision.`,
            `<break time="350ms"/>You were thinking about...`,
        ],
    };
    // Check for topic matches
    for (const [key, phrases] of Object.entries(topicCallbacks)) {
        if (normalizedTopic.includes(key)) {
            return phrases[Math.floor(Math.random() * phrases.length)];
        }
    }
    // Generic callback
    return `<break time="400ms"/>So... where were we?`;
}
// ============================================================================
// ENHANCED MUSIC TRANSITION (WITH LEARNING + ANALYTICS + MEMORY)
// ============================================================================
/**
 * Get an intelligent music transition with all enhancements
 *
 * This is the recommended entry point. It:
 * 1. Uses per-user learning to select the best transition type (Thompson Sampling)
 * 2. Records analytics for improving the system
 * 3. Checks for relevant music memories to reference
 * 4. Supports A/B testing for experimentation
 *
 * @param input - The transition context
 * @returns Enhanced transition result with analytics data
 */
export function getMusicTransition(input) {
    const { musicContext, personaId, relationshipStage, isLateNight, userId, sessionId, enableEnhancements = true, } = input;
    // If enhancements disabled or no user/session, use base system
    if (!enableEnhancements || !userId || !sessionId) {
        const baseResult = getIntelligentMusicTransition(input);
        return {
            ...baseResult,
            usedUserLearning: false,
        };
    }
    // 📊 Check if user's learning data is loaded from Firestore
    // The data should be pre-warmed at session start (setupMusicHandler)
    // If not loaded yet, trigger load and use base behavior for this transition
    const learningDataReady = isMusicLearningLoaded(userId);
    if (!learningDataReady) {
        // Trigger async load for next time (don't block this transition)
        void ensureMusicLearningLoaded(userId).catch(() => {
            // Silently ignore - learning will work without persistence
        });
        log.debug({ userId }, '🎵 Learning data not loaded yet, using base transition');
    }
    // Check A/B test assignment
    const analytics = getTransitionAnalytics();
    const experimentVariant = analytics.getVariantAssignment(userId, 'intelligent_transitions_v1');
    // Control group uses base system (for comparison)
    if (experimentVariant === 'control') {
        const baseResult = getIntelligentMusicTransition(input);
        const eventId = recordTransitionWithAnalytics(sessionId, userId, personaId, musicContext, baseResult, experimentVariant);
        return {
            ...baseResult,
            eventId,
            experimentVariant,
            usedUserLearning: false,
        };
    }
    // Check for user preferences first (only if learning data is loaded)
    const userPreferred = learningDataReady
        ? getUserPreferredTransition(userId, {
            startReason: musicContext?.startReason,
            emotionalTone: musicContext?.emotionalToneBeforeMusic,
            isLateNight,
        })
        : null;
    let result;
    let explorationRate = 0;
    let usedUserLearning = false;
    // If user has a strong preference and data is loaded, honor it (with some exploration)
    if (learningDataReady && userPreferred && Math.random() < 0.8) {
        result = generateTransitionOfType(userPreferred, personaId, musicContext, relationshipStage);
        usedUserLearning = true;
        explorationRate = 0.2;
        log.debug({ userId, preferredType: userPreferred }, '🎯 Using user-learned preference');
    }
    else {
        // Use Thompson Sampling to balance explore/exploit
        const availableTypes = [
            'silence',
            'presence',
            'gentle_return',
            'acknowledgment',
        ];
        // Add context-appropriate types
        if (musicContext?.startReason === 'celebration') {
            availableTypes.push('celebration_close');
        }
        if (musicContext?.startReason === 'thinking') {
            availableTypes.push('topic_callback', 'invitation');
        }
        if (relationshipStage === 'friend' || relationshipStage === 'close_friend') {
            availableTypes.push('check_in');
        }
        // 🎧 DJ VIBES: Make Ferni feel like a personal DJ!
        // This makes the DJ feel alive - not just an auto-queue robot.
        // Higher chance for user-requested music (they wanted tunes!)
        if (musicContext?.startReason === 'user_request') {
            // User asked for music - they're in the mood! 60% DJ vibes
            if (Math.random() < 0.6) {
                availableTypes.push('dj_vibes');
            }
        }
        else if (musicContext?.startReason === 'background' || musicContext?.wasAmbient) {
            // Ambient/background - 40% chance
            if (Math.random() < 0.4) {
                availableTypes.push('dj_vibes');
            }
        }
        else if (Math.random() < 0.25) {
            // Other music - 25% chance
            availableTypes.push('dj_vibes');
        }
        const selection = selectTransitionWithLearning(userId, availableTypes, {
            startReason: musicContext?.startReason,
            emotionalTone: musicContext?.emotionalToneBeforeMusic,
            isLateNight,
        });
        result = generateTransitionOfType(selection.selectedType, personaId, musicContext, relationshipStage);
        explorationRate = selection.explorationRate;
        usedUserLearning = selection.explorationRate < 0.5; // Low exploration = using learned preferences
    }
    // Check for music memory to mention
    let musicCallback;
    if (shouldMentionMusicMemory(userId)) {
        const callback = generateMusicCallback(userId, personaId, {
            emotionalState: musicContext?.emotionalToneBeforeMusic,
            topic: musicContext?.topicBeforeMusic,
        });
        if (callback && callback.confidence > 0.6) {
            musicCallback = callback;
            // Optionally incorporate into phrase
            if (result.shouldSpeak && Math.random() < 0.3) {
                result = {
                    ...result,
                    phrase: callback.phrase,
                    reasoning: `Music memory callback: ${result.reasoning}`,
                    transitionType: 'persona_specific',
                };
            }
        }
    }
    // Record for analytics
    const eventId = recordTransitionWithAnalytics(sessionId, userId, personaId, musicContext, result, experimentVariant || 'intelligent');
    return {
        ...result,
        eventId,
        explorationRate,
        musicCallback,
        experimentVariant: experimentVariant ?? undefined,
        usedUserLearning,
    };
}
/**
 * Generate a specific transition type
 */
function generateTransitionOfType(type, personaId, context, relationshipStage) {
    switch (type) {
        case 'silence':
            return {
                shouldSpeak: false,
                reasoning: 'User-learned preference: silence',
                confidence: 0.8,
                transitionType: 'silence',
            };
        case 'presence':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'presence'),
                reasoning: 'User-learned preference: minimal presence',
                confidence: 0.8,
                transitionType: 'presence',
            };
        case 'gentle_return':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'gentle_return'),
                reasoning: 'User-learned preference: gentle return',
                confidence: 0.75,
                transitionType: 'gentle_return',
            };
        case 'acknowledgment':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'acknowledgment'),
                reasoning: 'User-learned preference: acknowledgment',
                confidence: 0.75,
                transitionType: 'acknowledgment',
            };
        case 'celebration_close':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'celebration_close'),
                reasoning: 'Celebration context: match energy',
                confidence: 0.85,
                transitionType: 'celebration_close',
            };
        case 'topic_callback':
            if (context?.topicBeforeMusic) {
                return {
                    shouldSpeak: true,
                    phrase: generateTopicCallback(context.topicBeforeMusic, personaId),
                    reasoning: `Topic callback: ${context.topicBeforeMusic}`,
                    confidence: 0.8,
                    transitionType: 'topic_callback',
                };
            }
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'gentle_return'),
                reasoning: 'No topic to callback — gentle return',
                confidence: 0.65,
                transitionType: 'gentle_return',
            };
        case 'check_in':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'check_in'),
                reasoning: 'User-learned preference: check-in',
                confidence: 0.7,
                transitionType: 'check_in',
            };
        case 'invitation':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'invitation'),
                reasoning: 'User-learned preference: invitation',
                confidence: 0.75,
                transitionType: 'invitation',
            };
        // 🎧 DJ VIBES: The DJ offers more music with personality!
        case 'dj_vibes':
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'dj_vibes'),
                reasoning: 'DJ vibes: offering more music with personality',
                confidence: 0.8,
                transitionType: 'dj_vibes',
            };
        case 'persona_specific':
        default:
            return {
                shouldSpeak: true,
                phrase: getPersonaPhrase(personaId, 'gentle_return'),
                reasoning: 'Default: gentle return',
                confidence: 0.6,
                transitionType: 'gentle_return',
            };
    }
}
/**
 * Record user feedback after a transition
 *
 * Call this when you have signals about how the user responded.
 * The system uses this to improve future transitions.
 *
 * @param eventId - The event ID from getMusicTransition
 * @param feedback - Engagement signals
 */
export function recordTransitionFeedback(eventId, userId, transitionType, feedback, context) {
    // Update user learning
    updateUserLearning(userId, transitionType, {
        wasPositive: feedback.wasPositive,
        confidence: feedback.confidence,
        signals: feedback.userResponse ? [feedback.userResponse] : [],
    }, context
        ? {
            startReason: context.startReason,
            emotionalTone: context.emotionalTone,
            isLateNight: context.isLateNight,
        }
        : undefined);
    // Record analytics engagement signals
    const analytics = getTransitionAnalytics();
    analytics.recordEngagement({
        eventId,
        timeToUserSpeechMs: feedback.timeToUserSpeechMs,
        firstUserUtterance: feedback.userResponse,
        emotionalResponse: feedback.wasPositive ? 'positive' : 'neutral',
        continuedTopic: true, // TODO: detect from user response
        sessionContinuedMs: feedback.continuedSession ? 300000 : undefined, // 5 min assumed
    });
    // Store music memory if it helped
    if (feedback.wasPositive && feedback.confidence > 0.6 && context?.musicContext) {
        const memoryStored = storeMusicHelpedMemory(userId, context.musicContext, transitionType, {
            userResponse: feedback.userResponse,
            continuedSession: feedback.continuedSession,
        });
        // Trigger persistence for memory
        if (memoryStored) {
            onMusicMemoryStored(userId);
        }
    }
    // 📊 Trigger persistence for updated profile (Thompson Sampling)
    onTransitionFeedbackRecorded(userId);
    log.debug({
        eventId,
        userId,
        wasPositive: feedback.wasPositive,
        transitionType,
    }, '📊 Transition feedback recorded');
}
/**
 * Get analytics dashboard data
 */
export function getTransitionAnalyticsDashboard() {
    const analytics = getTransitionAnalytics();
    const allStats = analytics.getAllStats();
    const globalStats = {};
    for (const [type, stats] of allStats.entries()) {
        globalStats[type] = {
            count: stats.count,
            positiveRate: stats.positiveResponseRate,
        };
    }
    const recentEvents = analytics.getRecentEvents(20);
    const recentDecisions = recentEvents.map((e) => ({
        type: e.transitionType,
        reasoning: `${e.startReason} → ${e.transitionType}`,
        timestamp: e.timestamp,
    }));
    const abTestResults = analytics.getTestResults('intelligent_transitions_v1');
    const formattedAbResults = abTestResults
        ? Object.fromEntries(Object.entries(abTestResults).map(([variant, stats]) => [
            variant,
            { count: stats.count, positiveRate: stats.positiveResponseRate },
        ]))
        : null;
    return {
        globalStats: globalStats,
        recentDecisions,
        abTestResults: formattedAbResults,
    };
}
// ============================================================================
// LOGGING & ANALYTICS
// ============================================================================
/**
 * Log a transition decision for analytics
 */
export function logTransitionDecision(sessionId, input, result) {
    log.info({
        sessionId,
        personaId: input.personaId,
        startReason: input.musicContext?.startReason,
        emotionalTone: input.musicContext?.emotionalToneBeforeMusic,
        transitionType: result.transitionType,
        shouldSpeak: result.shouldSpeak,
        confidence: result.confidence,
        reasoning: result.reasoning,
    }, '🎵 Intelligent music transition');
}
export default {
    // Core functions
    getIntelligentMusicTransition,
    getMusicTransition,
    logTransitionDecision,
    // Feedback/learning
    recordTransitionFeedback,
    // Analytics
    getTransitionAnalyticsDashboard,
};
//# sourceMappingURL=intelligent-music-transitions.js.map