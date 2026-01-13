/**
 * Goodbye Context Builder - SUPERHUMAN GOODBYE INTELLIGENCE
 *
 * Handles conversation endings with better-than-human awareness:
 * - Pre-goodbye detection (anticipate when user is winding down)
 * - Time-aware goodbyes (morning/evening/late night)
 * - Emotional echo (acknowledge heavy conversations)
 * - Personalized sign-off (reference specific topics discussed)
 * - Warm wrap-up and closing awareness
 * - Interruption and silence recovery
 *
 * Don't rush the ending - it matters. Make it memorable.
 *
 * Extracted from jack-bogle.ts lines 669-687, 939-957, 1205-1211
 */
import { getLogger } from '../../utils/safe-logger.js';
import { registerContextBuilder, createCriticalInjection, createStandardInjection, createHintInjection, } from './index.js';
import { getTheatricalGoodbye } from '../../personas/theatrical.js';
// ============================================================================
// GOODBYE PATTERNS
// ============================================================================
const GOODBYE_PATTERNS = /\b(goodbye|bye|gotta go|have to go|need to go|talk later|catch you later|take care|see you|until next time|i'm out|signing off|heading out)\b/i;
// ============================================================================
// SUPERHUMAN GOODBYE INTELLIGENCE
// ============================================================================
/**
 * PRE-GOODBYE DETECTION
 * Detect when user is winding down BEFORE they explicitly say goodbye.
 * This allows us to anticipate and make the ending feel natural.
 */
const PRE_GOODBYE_PATTERNS = [
    // Trailing off signals
    /\b(anyway|well|so)\s*[.]{2,}$/i,
    /\b(anyway|well|so)\s*,?\s*$/i,
    // Time pressure
    /\b(getting late|should (probably )?go|need to (get going|run|head out))\b/i,
    /\b(it's (late|getting late)|time (flies|flew))\b/i,
    // Wrapping up language
    /\b(that's (about )?it|that's all|nothing else)\b/i,
    /\b(i think (that's|we're) (good|done))\b/i,
    // Short responses after long conversation
    /^(ok|okay|alright|cool|got it|makes sense|sounds good)[.!]?$/i,
    // Gratitude often precedes goodbye
    /\b(thanks for (listening|talking|this|chatting)|appreciate (you|this|it))\b/i,
];
/**
 * HEAVY CONVERSATION INDICATORS
 * Detect emotionally heavy conversations that deserve special acknowledgment.
 */
const HEAVY_CONVERSATION_MARKERS = [
    'death',
    'dying',
    'passed away',
    'funeral',
    'grief',
    'loss',
    'divorce',
    'breakup',
    'separation',
    'fired',
    'laid off',
    'job loss',
    'diagnosis',
    'cancer',
    'illness',
    'hospital',
    'anxiety',
    'depression',
    'therapy',
    'mental health',
    'trauma',
    'abuse',
    'assault',
    'bankruptcy',
    'debt',
    'financial ruin',
];
/**
 * Detect if user is winding down (pre-goodbye)
 */
function detectWindingDown(userText, turnCount) {
    // Short responses after turn 5+ often signal winding down
    if (turnCount > 5 && userText.length < 30) {
        // Check for closing phrases
        if (PRE_GOODBYE_PATTERNS.some((p) => p.test(userText))) {
            return true;
        }
    }
    // Any pre-goodbye pattern is a signal
    return PRE_GOODBYE_PATTERNS.some((p) => p.test(userText));
}
/**
 * Get time-aware goodbye suggestion based on user's local time
 */
function getTimeAwareGoodbye(timezone) {
    // Default to a neutral time if no timezone
    const now = new Date();
    let hour = now.getHours();
    // Try to use user's timezone if available
    if (timezone) {
        try {
            const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
            hour = userTime.getHours();
        }
        catch {
            // Fall back to server time
        }
    }
    if (hour >= 5 && hour < 12) {
        return {
            timeOfDay: 'morning',
            suggestion: 'Have a wonderful day ahead!',
        };
    }
    else if (hour >= 12 && hour < 17) {
        return {
            timeOfDay: 'afternoon',
            suggestion: 'Enjoy the rest of your day!',
        };
    }
    else if (hour >= 17 && hour < 21) {
        return {
            timeOfDay: 'evening',
            suggestion: 'Have a lovely evening!',
        };
    }
    else {
        return {
            timeOfDay: 'night',
            suggestion: 'Rest well tonight. We can continue tomorrow.',
        };
    }
}
/**
 * Detect if the conversation was emotionally heavy
 */
function detectHeavyConversation(conversationHistory) {
    const allText = conversationHistory.join(' ').toLowerCase();
    const heavyTopics = HEAVY_CONVERSATION_MARKERS.filter((marker) => allText.includes(marker.toLowerCase()));
    return {
        isHeavy: heavyTopics.length > 0,
        topics: heavyTopics,
    };
}
/**
 * Generate personalized sign-off based on conversation topics
 */
function generatePersonalizedSignoff(topics, userName) {
    if (topics.length === 0)
        return null;
    const topTopic = topics[0]; // Most recent/relevant topic
    const namePrefix = userName ? `${userName}, ` : '';
    const signoffs = [
        `${namePrefix}good luck with ${topTopic}!`,
        `${namePrefix}I'll be thinking about what you shared about ${topTopic}.`,
        `${namePrefix}keep me posted on ${topTopic}!`,
        `${namePrefix}wishing you the best with ${topTopic}.`,
    ];
    return signoffs[Math.floor(Math.random() * signoffs.length)];
}
// Default fillers (fallback when no persona provided)
// These should feel natural and human, not robotic "still there?" prompts
const DEFAULT_EARLY_FILLERS = [
    'Take your time... <break time="300ms"/>no rush at all.',
    '<break time="400ms"/>I\'m right here when you\'re ready.',
    'Thinking is good. <break time="300ms"/>I\'ll wait.',
    '<break time="300ms"/>Take a breath. <break time="200ms"/>We\'ve got time.',
];
const DEFAULT_MID_FILLERS = [
    '<break time="400ms"/>You know, <break time="200ms"/>sometimes the quiet is where the good stuff lives.',
    '<break time="300ms"/>Processing something? <break time="200ms"/>I get it.',
    '<break time="400ms"/>Some things need time to settle. <break time="200ms"/>I\'m here.',
    '<break time="300ms"/>The silence doesn\'t bother me. <break time="200ms"/>Take your time.',
];
const DEFAULT_LATE_FILLERS = [
    '<break time="400ms"/>Still here if you want to keep going... <break time="300ms"/>or not. Either\'s fine.',
    '<break time="300ms"/>Want to leave it here for now? <break time="200ms"/>We can always pick up later.',
    '<break time="400ms"/>No pressure. <break time="200ms"/>I\'m here if something comes to mind.',
    '<break time="300ms"/>Should we wrap up, or is there something else brewing?',
];
const DEFAULT_RECOVERY_PHRASES = [
    '<break time="100ms"/>Oh! <break time="150ms"/>Go ahead—',
    '<break time="100ms"/>Yes, sorry— <break time="100ms"/>what were you saying?',
    '<break time="150ms"/>No no, <break time="100ms"/>you first.',
    '<break time="100ms"/>I was rambling anyway. <break time="150ms"/>What\'s on your mind?',
    '<break time="100ms"/>Please, <break time="100ms"/>jump in—',
    '<break time="150ms"/>Ah, <break time="100ms"/>got carried away. <break time="150ms"/>What did you want to say?',
    '<break time="100ms"/>Wait— <break time="150ms"/>you were saying?',
    '<break time="150ms"/>Sorry! <break time="100ms"/>Didn\'t mean to talk over you.',
];
/**
 * Random element from array
 */
function randomFrom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
/**
 * Get silence filler phrase - uses persona config if available
 */
function getSilenceFiller(turnCount, persona) {
    const fillers = persona?.communication?.silenceFillers;
    if (fillers) {
        if (turnCount <= 3 && fillers.early?.length) {
            return randomFrom(fillers.early);
        }
        else if (turnCount <= 8 && fillers.mid?.length) {
            return randomFrom(fillers.mid);
        }
        else if (fillers.late?.length) {
            return randomFrom(fillers.late);
        }
    }
    // Fallback to defaults
    if (turnCount <= 3) {
        return randomFrom(DEFAULT_EARLY_FILLERS);
    }
    else if (turnCount <= 8) {
        return randomFrom(DEFAULT_MID_FILLERS);
    }
    else {
        return randomFrom(DEFAULT_LATE_FILLERS);
    }
}
/**
 * Get interruption recovery phrase - uses persona config if available
 */
function getInterruptionRecovery(persona) {
    const recoveries = persona?.communication?.interruptionRecoveries;
    if (recoveries && recoveries.length > 0) {
        return randomFrom(recoveries);
    }
    return randomFrom(DEFAULT_RECOVERY_PHRASES);
}
/**
 * Get closing behavior suggestion
 */
function getClosingBehavior(turnCount, intent) {
    // Only suggest closing in later turns
    if (turnCount < 10)
        return null;
    // If user seems to be wrapping up
    if (intent === 'ending_conversation' || intent === 'saying_goodbye') {
        return "Don't rush the goodbye. Summarize what you discussed and leave warmly.";
    }
    // If conversation is getting long
    if (turnCount > 15) {
        const closings = [
            "We've covered a lot of ground. Consider gently checking if they want to continue.",
            "Good conversation! Make sure they know you're available anytime.",
            "Consider wrapping up with a key takeaway from today's talk.",
        ];
        return closings[Math.floor(Math.random() * closings.length)];
    }
    return null;
}
// ============================================================================
// GOODBYE CONTEXT BUILDER
// ============================================================================
/**
 * Build goodbye-related context injections
 */
function buildGoodbyeContext(input) {
    const { userText, analysis, userData, persona } = input;
    const extUserData = userData;
    const extPersona = persona;
    const injections = [];
    const turnCount = extUserData.turnCount || 0;
    // -----------------------------------------------
    // INTERRUPTION RECOVERY (uses persona phrases if available)
    // -----------------------------------------------
    if (extUserData.wasInterrupted) {
        const recovery = getInterruptionRecovery(extPersona);
        injections.unshift(createCriticalInjection('interruption', `[INTERRUPTION: You were cut off. START with something like: "${recovery}" Then address what they said.]`));
        extUserData.wasInterrupted = false; // Reset flag
        getLogger().info('Interruption recovery injected');
    }
    // -----------------------------------------------
    // SILENCE HANDLING (uses persona phrases if available)
    // -----------------------------------------------
    if (extUserData.userWentSilent) {
        const silenceFiller = getSilenceFiller(turnCount, extPersona);
        injections.push(createStandardInjection('silence', `[SILENCE: User has been quiet. Consider gently checking in: "${silenceFiller}"]`));
        extUserData.userWentSilent = false; // Reset flag
        getLogger().info('Silence filler injected');
    }
    // -----------------------------------------------
    // 🌟 SUPERHUMAN: PRE-GOODBYE DETECTION (anticipate endings)
    // -----------------------------------------------
    const isWindingDown = detectWindingDown(userText, turnCount);
    if (isWindingDown && !GOODBYE_PATTERNS.test(userText)) {
        getLogger().info('Pre-goodbye detected - user winding down');
        injections.push(createHintInjection('pre_goodbye', `[WINDING DOWN: User seems to be wrapping up. Don't extend the conversation unnecessarily.
If they seem ready to go, make it easy for them to leave gracefully.
Consider: "Is there anything else on your mind, or shall we call it for now?"]`));
    }
    // -----------------------------------------------
    // 🌟 SUPERHUMAN: GET CONVERSATION CONTEXT FOR GOODBYE
    // -----------------------------------------------
    const conversationHistory = [];
    const historyTracker = input.services?.historyTracker;
    if (historyTracker?.getSimpleTurns) {
        const turns = historyTracker.getSimpleTurns();
        conversationHistory.push(...turns.map((t) => t.content));
    }
    // Get detected topics for personalized sign-off
    const detectedTopics = analysis.topics?.detected || [];
    const userName = input.userProfile?.name;
    // Try to get timezone from userData (often passed as part of session data)
    const userTimezone = input.userData?.timezone;
    // -----------------------------------------------
    // GOODBYE DETECTION (with SUPERHUMAN enhancements)
    // -----------------------------------------------
    if (GOODBYE_PATTERNS.test(userText)) {
        const personaId = persona?.id;
        getLogger().info({ persona: personaId }, 'Goodbye detected');
        // 🌟 SUPERHUMAN: Time-aware goodbye
        const timeContext = getTimeAwareGoodbye(userTimezone);
        // 🌟 SUPERHUMAN: Detect heavy conversation
        const heavyCheck = detectHeavyConversation(conversationHistory);
        // 🌟 SUPERHUMAN: Personalized sign-off
        const personalizedSignoff = generatePersonalizedSignoff(detectedTopics, userName);
        // Get persona-specific goodbye example
        let goodbyeExample = '';
        if (personaId) {
            try {
                const theatricalGoodbye = getTheatricalGoodbye(personaId);
                // Strip SSML tags for the example
                const cleanGoodbye = theatricalGoodbye.replace(/<[^>]*>/g, '');
                goodbyeExample = `\nEXAMPLE (use your own words, this style): "${cleanGoodbye}"`;
            }
            catch {
                // Fall through to default
            }
        }
        // Build superhuman goodbye guidance
        let superhumanGuidance = '';
        // Time awareness
        superhumanGuidance += `\n\n🕐 TIME-AWARE: It's ${timeContext.timeOfDay}. Consider: "${timeContext.suggestion}"`;
        // Emotional echo for heavy conversations
        if (heavyCheck.isHeavy) {
            superhumanGuidance += `\n\n💜 EMOTIONAL ECHO: This was a meaningful conversation about ${heavyCheck.topics.slice(0, 2).join(' and ')}.
Acknowledge the weight of what was shared: "That was a meaningful conversation. Take care of yourself."`;
        }
        // Personalized sign-off
        if (personalizedSignoff) {
            superhumanGuidance += `\n\n✨ PERSONALIZED: Consider referencing what you discussed: "${personalizedSignoff}"`;
        }
        injections.push(createStandardInjection('goodbye', `[GOODBYE DETECTED - SUPERHUMAN WARM WRAP-UP]
Don't rush the ending. It matters. Make it memorable.${goodbyeExample}${superhumanGuidance}

DO:
  1. Acknowledge what you discussed: "It was good talking about..."
  2. One key takeaway (if appropriate): "If you remember one thing..."
  3. Express warmth genuinely in YOUR style
  4. Leave door open: "I'm here whenever you want to talk."
  5. Use their name if you know it
  6. Reference the time of day naturally
DO NOT:
  - Add new information
  - End on a heavy note (unless necessary)
  - Rush through it
  - Be generic - make it personal!`));
    }
    // -----------------------------------------------
    // CLOSING AWARENESS
    // -----------------------------------------------
    const closingBehavior = getClosingBehavior(turnCount, analysis.intent.primary);
    if (closingBehavior) {
        injections.push(createHintInjection('closing', `[CLOSING: The conversation seems to be winding down. Consider: "${closingBehavior}"]`));
    }
    return injections;
}
// ============================================================================
// REGISTER BUILDER
// ============================================================================
registerContextBuilder('goodbye', buildGoodbyeContext);
export { buildGoodbyeContext, getSilenceFiller, getInterruptionRecovery, getClosingBehavior, GOODBYE_PATTERNS, 
// Superhuman goodbye intelligence
PRE_GOODBYE_PATTERNS, detectWindingDown, getTimeAwareGoodbye, detectHeavyConversation, generatePersonalizedSignoff, };
//# sourceMappingURL=goodbye.js.map