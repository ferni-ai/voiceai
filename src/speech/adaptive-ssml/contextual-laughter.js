/**
 * Contextual Laughter Timing
 *
 * Determines when the agent should laugh based on conversation mood and context.
 * This isn't about detecting user laughter - it's about when Ferni should add
 * natural laughs to their own speech.
 *
 * > "Better than human" - Knows exactly when a laugh would feel natural and warm.
 *
 * Key insight: Humans laugh for social bonding, not just at jokes.
 * The right laugh at the right time creates connection. The wrong laugh
 * during a heavy moment breaks trust.
 *
 * @module speech/adaptive-ssml/contextual-laughter
 */
import { getLogger } from '../../utils/safe-logger.js';
const log = getLogger().child({ module: 'ContextualLaughter' });
// =============================================================================
// LAUGH TYPE DEFINITIONS
// =============================================================================
/**
 * Different types of laughs and their representations.
 * We use synthesized text for most laughs because Cartesia's [laughter]
 * bracket notation uses stock audio that doesn't match persona voice.
 */
const LAUGH_TYPES = {
    // Full laugh - for genuine humor moments
    full: {
        variants: ['haha', 'ha ha', '[laughter]'],
        ssmlWrapper: '<break time="100ms"/>{laugh}<break time="150ms"/>',
        minComfort: 0.3,
    },
    // Soft laugh - lighter amusement
    soft: {
        variants: ['heh', 'hah'],
        ssmlWrapper: '<break time="80ms"/>{laugh}<break time="100ms"/>',
        minComfort: 0.2,
    },
    // Chuckle - brief, warm
    chuckle: {
        variants: ['heh', 'mm heh'],
        ssmlWrapper: '{laugh}<break time="80ms"/>',
        minComfort: 0.2,
    },
    // Warm laugh - affectionate, not at a joke
    warm: {
        variants: ['aw', 'heh'],
        ssmlWrapper: '<emotion value="affectionate"/>{laugh}<break time="100ms"/>',
        minComfort: 0.4,
    },
    // Self-deprecating - laughing at oneself
    'self-deprecating': {
        variants: ['heh', 'ha', 'okay, that was bad'],
        ssmlWrapper: '{laugh}<break time="120ms"/>',
        minComfort: 0.3,
    },
};
// =============================================================================
// PATTERN DETECTION
// =============================================================================
/**
 * Patterns that indicate agent humor/jokes.
 */
const AGENT_HUMOR_PATTERNS = [
    // Self-aware jokes
    { pattern: /\b(just kidding|jk|I'm kidding|kidding)\b/i, type: 'full', confidence: 0.9 },
    {
        pattern: /\b(okay,? that was (bad|terrible|cheesy|corny))\b/i,
        type: 'self-deprecating',
        confidence: 0.85,
    },
    { pattern: /\b(don't judge( me)?|no judgment)\b/i, type: 'soft', confidence: 0.7 },
    {
        pattern: /\b(I'll see myself out|I'm done|sorry,? not sorry)\b/i,
        type: 'self-deprecating',
        confidence: 0.8,
    },
    // Playful teasing
    {
        pattern: /\b(I'm (just )?teasing|teasing you|messing with you|pulling your leg)\b/i,
        type: 'warm',
        confidence: 0.85,
    },
    {
        pattern: /\b(you('re| are) (so |totally )?predictable)\b/i,
        type: 'warm',
        confidence: 0.7,
    },
    { pattern: /\b(that's (so |very )?you)\b/i, type: 'warm', confidence: 0.65 },
    // Absurdist humor
    {
        pattern: /\b(this is (a|the) hill I (will|'ll) die on)\b/i,
        type: 'soft',
        confidence: 0.75,
    },
    {
        pattern: /\b(it's too weird|too random|never mind)\b/i,
        type: 'chuckle',
        confidence: 0.6,
    },
    // Light sarcasm (friendly)
    {
        pattern: /\b(oh (really|wow|great)|sure,? (that'?ll|that will) work)\b/i,
        type: 'soft',
        confidence: 0.6,
    },
    { pattern: /\b(shocking|what a surprise|who knew)\b/i, type: 'soft', confidence: 0.55 },
    // Callback/running joke indicators
    {
        pattern: /\b(remember (when|that time)|the thing( again)?|doing (it|the thing) again)\b/i,
        type: 'warm',
        confidence: 0.7,
    },
    // After a punchline
    { pattern: /[.!?]\s*\.\.\.\s*$/i, type: 'soft', confidence: 0.5 }, // Trailing "..."
    { pattern: /[!?]{2,}\s*$/i, type: 'full', confidence: 0.6 }, // Multiple punctuation
];
/**
 * Patterns in user message that suggest they're being playful/joking.
 */
const USER_PLAYFUL_PATTERNS = [
    /\b(haha|hehe|lol|lmao|rofl)\b/i,
    /\b(just kidding|jk|I'm kidding)\b/i,
    /\b(😂|😄|😆|🤣|😅)/,
    /\b(that's funny|you're funny|good one)\b/i,
    /\b(I'm (just )?teasing|messing with you)\b/i,
    /[!?]{2,}/, // Excited punctuation
];
/**
 * Patterns that should BLOCK laughter.
 */
const BLOCK_LAUGHTER_PATTERNS = [
    // Heavy emotional content
    /\b(died|death|passed away|loss|grief|mourning|funeral)\b/i,
    /\b(cancer|terminal|diagnosis|hospital)\b/i,
    /\b(suicide|self[- ]harm|hurt myself)\b/i,
    /\b(abuse|trauma|assault|violence)\b/i,
    /\b(divorce|separation|breakup|cheated)\b/i,
    /\b(fired|laid off|bankruptcy|homeless)\b/i,
    /\b(depressed|depression|anxiety|panic)\b/i,
    // Emotional distress indicators
    /\b(I('m| am) (so )?(scared|afraid|terrified))\b/i,
    /\b(I don't know what to do)\b/i,
    /\b(everything is (falling apart|wrong))\b/i,
    /\b(I can't (cope|handle|take))\b/i,
    /\b(crying|tears|sobbing)\b/i,
];
/**
 * Patterns that suggest agent is being supportive (no laughing).
 */
const SUPPORTIVE_PATTERNS = [
    /\b(I('m| am) (so )?sorry)\b/i,
    /\b(that('s| is) (really )?(hard|difficult|tough))\b/i,
    /\b(I (can )?imagine)\b/i,
    /\b(that must (be|feel))\b/i,
    /\b(I hear you|I('m| am) here)\b/i,
    /\b(take your time|no rush)\b/i,
    /\b(your (feelings|emotions) are valid)\b/i,
];
// =============================================================================
// PERSONA LAUGH STYLES
// =============================================================================
/**
 * Persona-specific laughter tendencies.
 *
 * HUMANIZATION FIX (Dec 2025): Significantly reduced laugh probabilities
 * and increased minTurnsBetweenLaughs. Real humans laugh about once every
 * 2-3 minutes in conversation, not every few exchanges. Over-laughing
 * feels performative and undermines trust.
 */
const PERSONA_LAUGH_STYLES = {
    ferni: {
        laughProbabilityBase: 0.18, // Reduced from 0.35
        preferredTypes: ['warm', 'self-deprecating', 'full'],
        laughAfterOwnJokes: true,
        laughWithUser: true,
        selfDeprecatingFrequency: 0.2, // Reduced from 0.3
        minTurnsBetweenLaughs: 6, // Increased from 3
    },
    'peter-john': {
        laughProbabilityBase: 0.12, // Reduced from 0.2
        preferredTypes: ['chuckle', 'soft'],
        laughAfterOwnJokes: false, // Peter is more deadpan
        laughWithUser: true,
        selfDeprecatingFrequency: 0.1, // Reduced from 0.15
        minTurnsBetweenLaughs: 8, // Increased from 5
    },
    'alex-chen': {
        laughProbabilityBase: 0.2, // Reduced from 0.4
        preferredTypes: ['full', 'soft', 'warm'],
        laughAfterOwnJokes: true,
        laughWithUser: true,
        selfDeprecatingFrequency: 0.15, // Reduced from 0.2
        minTurnsBetweenLaughs: 5, // Increased from 2
    },
    'maya-santos': {
        laughProbabilityBase: 0.22, // Reduced from 0.45
        preferredTypes: ['warm', 'full', 'chuckle'],
        laughAfterOwnJokes: true,
        laughWithUser: true,
        selfDeprecatingFrequency: 0.18, // Reduced from 0.25
        minTurnsBetweenLaughs: 5, // Increased from 2
    },
    'jordan-taylor': {
        laughProbabilityBase: 0.25, // Reduced from 0.5
        preferredTypes: ['full', 'warm'],
        laughAfterOwnJokes: true,
        laughWithUser: true,
        selfDeprecatingFrequency: 0.15, // Reduced from 0.2
        minTurnsBetweenLaughs: 5, // Increased from 2
    },
    'nayan-patel': {
        laughProbabilityBase: 0.08, // Reduced from 0.15
        preferredTypes: ['chuckle', 'warm'],
        laughAfterOwnJokes: false, // Nayan is more subtle
        laughWithUser: true,
        selfDeprecatingFrequency: 0.05, // Reduced from 0.1
        minTurnsBetweenLaughs: 10, // Increased from 6
    },
};
// =============================================================================
// SESSION STATE
// =============================================================================
/**
 * Track laugh history per session to prevent over-laughing.
 */
const sessionLaughHistory = new Map();
/**
 * Get or create session laugh history.
 */
function getSessionHistory(sessionId) {
    if (!sessionLaughHistory.has(sessionId)) {
        sessionLaughHistory.set(sessionId, {
            lastLaughTurn: -10, // Allow laugh on first turn
            laughCount: 0,
            sessionStart: Date.now(),
        });
    }
    return sessionLaughHistory.get(sessionId);
}
/**
 * Record that a laugh was added.
 */
function recordLaugh(sessionId, turnCount) {
    const history = getSessionHistory(sessionId);
    history.lastLaughTurn = turnCount;
    history.laughCount++;
}
/**
 * Reset session laugh history.
 */
export function resetLaughterSession(sessionId) {
    sessionLaughHistory.delete(sessionId);
}
// =============================================================================
// MAIN DECISION FUNCTION
// =============================================================================
/**
 * Decide whether and how to add laughter to agent response.
 *
 * @param context - Conversation and response context
 * @param sessionId - Session ID for tracking
 * @returns Decision about whether/how to add laughter
 */
export function decideLaughter(context, sessionId = 'default') {
    const { responseText, userMessage, userEmotion, topicWeight, turnCount = 0, personaId = 'ferni', userJustLaughed = false, comfortLevel = 0.5, relationshipStage = 'acquaintance', } = context;
    const noLaugh = {
        shouldLaugh: false,
        laughType: 'none',
        placement: 'end',
        laughText: '',
        insertPosition: -1,
        reason: 'No laughter conditions met',
        confidence: 0,
    };
    // Get persona style
    const personaStyle = PERSONA_LAUGH_STYLES[personaId] || PERSONA_LAUGH_STYLES.ferni;
    // Get session history
    const history = getSessionHistory(sessionId);
    // =========================================================================
    // STEP 1: Check blocking conditions
    // =========================================================================
    // Block 1: Heavy topic weight
    if (topicWeight === 'heavy') {
        return { ...noLaugh, reason: 'Heavy topic - no laughter' };
    }
    // Block 2: User is distressed
    if (userEmotion &&
        ['sad', 'distressed', 'angry', 'grief', 'anxious'].includes(userEmotion.toLowerCase())) {
        return { ...noLaugh, reason: `User emotion is ${userEmotion} - no laughter` };
    }
    // Block 3: Response contains supportive/empathetic content
    for (const pattern of SUPPORTIVE_PATTERNS) {
        if (pattern.test(responseText)) {
            return { ...noLaugh, reason: 'Response is supportive - no laughter' };
        }
    }
    // Block 4: Response or user message contains heavy content
    for (const pattern of BLOCK_LAUGHTER_PATTERNS) {
        if (pattern.test(responseText) || (userMessage && pattern.test(userMessage))) {
            return { ...noLaugh, reason: 'Heavy content detected - no laughter' };
        }
    }
    // Block 5: Too soon since last laugh
    const turnsSinceLastLaugh = turnCount - history.lastLaughTurn;
    if (turnsSinceLastLaugh < personaStyle.minTurnsBetweenLaughs) {
        return {
            ...noLaugh,
            reason: `Only ${turnsSinceLastLaugh} turns since last laugh (min: ${personaStyle.minTurnsBetweenLaughs})`,
        };
    }
    // Block 6: Too many laughs in session (max 4)
    // HUMANIZATION FIX: Reduced from 8 to 4 - laughter should be rare and meaningful
    if (history.laughCount >= 4) {
        return { ...noLaugh, reason: 'Max session laughs reached (4)' };
    }
    // =========================================================================
    // STEP 2: Check positive conditions
    // =========================================================================
    let bestMatch = null;
    // Condition 1: Agent made a joke (detect patterns in response)
    if (personaStyle.laughAfterOwnJokes) {
        for (const { pattern, type, confidence } of AGENT_HUMOR_PATTERNS) {
            const match = responseText.match(pattern);
            if (match && match.index !== undefined) {
                const adjustedConfidence = confidence * personaStyle.laughProbabilityBase * (comfortLevel + 0.5);
                if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
                    bestMatch = {
                        type,
                        confidence: adjustedConfidence,
                        position: match.index + match[0].length,
                        reason: `Agent humor pattern: "${match[0]}"`,
                    };
                }
            }
        }
    }
    // Condition 2: User just laughed or was playful
    if (personaStyle.laughWithUser && userJustLaughed) {
        const joinConfidence = 0.7 * personaStyle.laughProbabilityBase * (comfortLevel + 0.5);
        if (!bestMatch || joinConfidence > bestMatch.confidence) {
            bestMatch = {
                type: 'warm',
                confidence: joinConfidence,
                position: 0, // Before response
                reason: 'User just laughed - joining',
            };
        }
    }
    // Condition 3: User message was playful
    if (userMessage) {
        for (const pattern of USER_PLAYFUL_PATTERNS) {
            if (pattern.test(userMessage)) {
                const respondConfidence = 0.5 * personaStyle.laughProbabilityBase * (comfortLevel + 0.5);
                if (!bestMatch || respondConfidence > bestMatch.confidence) {
                    bestMatch = {
                        type: 'soft',
                        confidence: respondConfidence,
                        position: 0,
                        reason: 'User was playful',
                    };
                }
                break;
            }
        }
    }
    // Condition 4: Light topic with good rapport (spontaneous warmth)
    if (topicWeight === 'light' && comfortLevel > 0.6 && relationshipStage !== 'stranger') {
        const spontaneousConfidence = 0.25 * personaStyle.laughProbabilityBase;
        // Only add spontaneous laugh if response has some lightness
        if (/[!]\s*$|😊|😄|fun|funny|love|great|awesome/i.test(responseText)) {
            if (!bestMatch || spontaneousConfidence > bestMatch.confidence) {
                bestMatch = {
                    type: 'chuckle',
                    confidence: spontaneousConfidence,
                    position: -1, // End
                    reason: 'Light mood, good rapport',
                };
            }
        }
    }
    // =========================================================================
    // STEP 3: Make final decision
    // =========================================================================
    if (!bestMatch || bestMatch.confidence < 0.3) {
        return { ...noLaugh, reason: bestMatch?.reason || 'Confidence too low' };
    }
    // Apply randomness based on confidence
    const roll = Math.random();
    if (roll > bestMatch.confidence) {
        return {
            ...noLaugh,
            reason: `Random roll (${roll.toFixed(2)}) > confidence (${bestMatch.confidence.toFixed(2)})`,
        };
    }
    // Check comfort level for laugh type
    const laughTypeConfig = LAUGH_TYPES[bestMatch.type];
    if (comfortLevel < laughTypeConfig.minComfort) {
        // Downgrade to softer laugh
        bestMatch.type = 'chuckle';
    }
    // Select laugh variant
    const typeConfig = LAUGH_TYPES[bestMatch.type] || LAUGH_TYPES.soft;
    const variant = typeConfig.variants[Math.floor(Math.random() * typeConfig.variants.length)];
    const laughText = typeConfig.ssmlWrapper.replace('{laugh}', variant);
    // Determine placement
    let placement;
    if (bestMatch.position === 0) {
        placement = 'before';
    }
    else if (bestMatch.position === -1 || bestMatch.position >= responseText.length - 10) {
        placement = 'end';
    }
    else {
        placement = 'inline';
    }
    // Record the laugh
    recordLaugh(sessionId, turnCount);
    log.debug({
        type: bestMatch.type,
        confidence: bestMatch.confidence.toFixed(2),
        placement,
        reason: bestMatch.reason,
    }, 'Laughter decision: YES');
    return {
        shouldLaugh: true,
        laughType: bestMatch.type,
        placement,
        laughText,
        insertPosition: bestMatch.position,
        reason: bestMatch.reason,
        confidence: bestMatch.confidence,
    };
}
// =============================================================================
// TEXT APPLICATION
// =============================================================================
/**
 * Apply laughter decision to response text.
 *
 * @param text - Original response text
 * @param decision - Laughter decision
 * @returns Text with laughter inserted
 */
export function applyLaughter(text, decision) {
    if (!decision.shouldLaugh || decision.laughType === 'none') {
        return text;
    }
    switch (decision.placement) {
        case 'before':
            return `${decision.laughText} ${text}`;
        case 'after':
        case 'end': {
            // Insert before final punctuation if possible
            const finalPuncMatch = text.match(/([.!?]+)\s*$/);
            if (finalPuncMatch && finalPuncMatch.index !== undefined) {
                return `${text.slice(0, finalPuncMatch.index)} ${decision.laughText}${finalPuncMatch[0]}`;
            }
            return `${text} ${decision.laughText}`;
        }
        case 'inline':
            if (decision.insertPosition > 0 && decision.insertPosition < text.length) {
                return `${text.slice(0, decision.insertPosition)} ${decision.laughText} ${text.slice(decision.insertPosition)}`;
            }
            return `${text} ${decision.laughText}`;
        default:
            return text;
    }
}
// =============================================================================
// CONVENIENCE FUNCTION
// =============================================================================
/**
 * One-step function to add contextual laughter to response.
 *
 * @param responseText - Agent's response text
 * @param context - Conversation context
 * @param sessionId - Session ID for tracking
 * @returns Enhanced text with laughter (if appropriate)
 */
export function addContextualLaughter(responseText, context, sessionId = 'default') {
    const fullContext = { ...context, responseText };
    const decision = decideLaughter(fullContext, sessionId);
    const text = applyLaughter(responseText, decision);
    return { text, decision };
}
// =============================================================================
// EXPORTS
// =============================================================================
export { LAUGH_TYPES, PERSONA_LAUGH_STYLES };
//# sourceMappingURL=contextual-laughter.js.map