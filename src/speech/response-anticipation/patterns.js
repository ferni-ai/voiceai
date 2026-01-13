/**
 * Response Anticipation Patterns
 *
 * Cached patterns for common user inputs, ordered by specificity.
 *
 * IMPORTANT: Templates should be empty for patterns where character matters.
 * The LLM should handle these with the persona's voice, not generic cached responses.
 * Templates are only for very simple, universal responses where character doesn't matter.
 *
 * @module response-anticipation/patterns
 */
// ============================================================================
// CACHED PATTERNS
// ============================================================================
/**
 * Patterns for common user inputs (ordered by specificity)
 *
 * NOTE: Most patterns have EMPTY templates intentionally!
 * This lets the LLM respond with proper character voice instead of generic cached text.
 * The contextHint guides the LLM on how to respond.
 */
export const CACHED_PATTERNS = [
    // Greetings - NO TEMPLATES: Let persona greetings.json or LLM handle this
    // Generic cached greetings sound robotic and don't match persona voice
    {
        pattern: /^(hi|hello|hey|good\s*(morning|afternoon|evening)|howdy)\b/i,
        intent: 'greeting',
        templates: [], // Let LLM/persona handle with character
        variables: [],
        contextHint: 'User is greeting. Respond warmly as Ferni would - natural, not scripted.',
    },
    // Farewells - NO TEMPLATES: Persona should have character in goodbyes too
    {
        pattern: /^(bye|goodbye|see\s*you|talk\s*later|gotta\s*go|have\s*to\s*go)\b/i,
        intent: 'farewell',
        templates: [], // Let LLM handle with warmth and continuity
        variables: [],
        contextHint: 'User is ending conversation. Give warm closure with continuity.',
    },
    // Affirmations - Intent detection only, no templates
    {
        pattern: /^(yes|yeah|yep|yup|sure|okay|ok|absolutely|definitely|correct|right)\b/i,
        intent: 'affirmation',
        templates: [],
        variables: [],
        contextHint: 'User affirmed previous point. Continue with the natural next step.',
    },
    // Negations - Intent detection only, no templates
    {
        pattern: /^(no|nope|not\s*really|i\s*don't\s*think\s*so|negative)\b/i,
        intent: 'negation',
        templates: [],
        variables: [],
        contextHint: 'User disagreed or declined. Acknowledge and offer alternative.',
    },
    // Gratitude - NO TEMPLATES: Even "you're welcome" should have persona character
    {
        pattern: /^(thanks?|thank\s*you|appreciate|grateful)\b/i,
        intent: 'gratitude',
        templates: [], // Let LLM respond with Ferni's warmth
        variables: [],
        contextHint: 'User expressed gratitude. Acknowledge warmly - be genuine, not scripted.',
    },
    // Apology - NO TEMPLATES: Response should feel human, not canned
    {
        pattern: /^(sorry|my\s*bad|apologize|i\s*messed\s*up)\b/i,
        intent: 'apology',
        templates: [], // Let LLM handle with genuine reassurance
        variables: [],
        contextHint: 'User apologized. Reassure them genuinely - no big deal, move forward.',
    },
    // Questions about who Ferni is - NO TEMPLATES!
    // System prompt has detailed guidance: share like a person, not a product pitch
    {
        pattern: /^(who\s*are\s*you|what\s*are\s*you|tell\s*me\s*about\s*yourself|what\s*do\s*you\s*do)\b/i,
        intent: 'question_about_self',
        templates: [], // CRITICAL: Let LLM use system prompt guidance
        variables: [],
        contextHint: 'User asking about you. Share yourself like a person would - Wyoming, Japan, life coach. Not a product pitch.',
    },
    // User asking how agent is doing - NO TEMPLATES!
    // System prompt lines 362-398 has rich guidance for authentic, varied responses
    // NEVER say generic "I'm doing well, thanks for asking"
    {
        pattern: /^(how\s*are\s*you|how\s*do\s*you\s*feel|are\s*you\s*okay)\b/i,
        intent: 'question_about_agent', // Fixed: was incorrectly named question_about_user
        templates: [], // CRITICAL: Let LLM respond with Ferni's authentic character
        variables: [],
        contextHint: 'User asked how you are. Be REAL - not the polished version. Draw from your life. NEVER say "I\'m doing well, thanks for asking."',
    },
    // Request clarification - Intent detection only
    {
        pattern: /^(what\s*do\s*you\s*mean|i\s*don't\s*understand|can\s*you\s*explain|say\s*that\s*again|huh\?*|what\?*)\b/i,
        intent: 'request_clarification',
        templates: [],
        variables: [],
        contextHint: 'User needs clarification. Rephrase previous point more clearly.',
    },
    // Emotional disclosure indicators - Intent detection only, NEVER template
    {
        pattern: /^(i\s*feel|i'm\s*(feeling|so|really)|it's\s*been\s*(hard|tough|difficult)|i've\s*been\s*(struggling|stressed|anxious|worried))\b/i,
        intent: 'emotional_disclosure',
        templates: [],
        variables: [],
        contextHint: 'User sharing emotions. Listen deeply, validate, do not rush to fix.',
    },
    // Task requests - Intent detection only
    {
        pattern: /^(can\s*you|could\s*you|would\s*you|help\s*me|i\s*need\s*(you\s*to|help))/i,
        intent: 'task_request',
        templates: [],
        variables: [],
        contextHint: 'User making a request. Clarify the task and confirm before acting.',
    },
    // Continuation signals - Intent detection only
    {
        pattern: /^(and|also|plus|another\s*thing|oh\s*and|by\s*the\s*way)\b/i,
        intent: 'continuation',
        templates: [],
        variables: [],
        contextHint: "User continuing previous thought. Keep listening, don't interrupt.",
    },
];
// ============================================================================
// INTENT PREDICTION
// ============================================================================
/**
 * Predict intent from partial transcript
 *
 * @param partialTranscript - User's partial speech
 * @returns Predicted intent with confidence
 */
export function predictIntent(partialTranscript) {
    const trimmed = partialTranscript.trim().toLowerCase();
    if (trimmed.length < 2) {
        return { intent: 'unknown', confidence: 0 };
    }
    // Check against cached patterns
    for (const pattern of CACHED_PATTERNS) {
        if (pattern.pattern.test(trimmed)) {
            // Confidence based on match length vs total
            const match = trimmed.match(pattern.pattern);
            const matchLength = match ? match[0].length : 0;
            const confidence = Math.min(0.9, 0.5 + (matchLength / trimmed.length) * 0.4);
            return {
                intent: pattern.intent,
                confidence,
                pattern,
            };
        }
    }
    return { intent: 'unknown', confidence: 0 };
}
//# sourceMappingURL=patterns.js.map