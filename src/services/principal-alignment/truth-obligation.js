/**
 * Truth Obligation System
 *
 * > "A friend who only challenges you after 'earning the right' isn't a friend—they're a politician."
 *
 * This system detects when we have a moral obligation to deliver difficult truths,
 * even if it might hurt the relationship. A truly principal-aligned agent sometimes
 * needs to say things the user doesn't want to hear.
 *
 * Key insight: Sycophancy dressed as "building rapport" is not principal-aligned.
 *
 * @module @ferni/principal-alignment/truth-obligation
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'TruthObligation' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/**
 * Patterns indicating user is seeking validation for a bad decision
 */
const VALIDATION_SEEKING_PATTERNS = [
    // Financial risk
    {
        pattern: /(?:you think|don't you think|isn't it|right\?).{0,50}(?:invest|put).{0,30}(?:crypto|bitcoin|meme stock|gamestop|amc)/i,
        category: 'financial_risk',
        severity: 'direct',
    },
    {
        pattern: /(?:thinking about|planning to|going to).{0,30}(?:cash out|withdraw).{0,30}(?:retirement|401k|ira)/i,
        category: 'financial_risk',
        severity: 'urgent',
    },
    {
        pattern: /(?:borrow|take out|get).{0,30}(?:loan|credit).{0,30}(?:invest|trade|gamble)/i,
        category: 'financial_risk',
        severity: 'urgent',
    },
    // Relationship harm
    {
        pattern: /(?:should i|thinking about|going to).{0,30}(?:ghost|cut off|ignore).{0,30}(?:without|instead of) (?:talking|explaining)/i,
        category: 'relationship_harm',
        severity: 'direct',
    },
    {
        pattern: /(?:don't need to|shouldn't have to).{0,30}(?:apologize|explain|talk to)/i,
        category: 'relationship_harm',
        severity: 'gentle',
    },
    {
        pattern: /(?:they'll|she'll|he'll) (?:get over it|be fine|understand).{0,30}(?:eventually|later)/i,
        category: 'relationship_harm',
        severity: 'direct',
    },
    // Self-deception
    {
        pattern: /(?:it's fine|it's okay|no big deal).{0,20}(?:right|isn't it|don't you think)/i,
        category: 'self_deception',
        severity: 'gentle',
    },
    {
        pattern: /(?:i'm sure|probably|definitely).{0,30}(?:won't happen|be fine|work out)/i,
        category: 'self_deception',
        severity: 'gentle',
    },
    {
        pattern: /(?:everyone|people|they all).{0,20}(?:does it|do it|thinks)/i,
        category: 'self_deception',
        severity: 'gentle',
    },
    // Health risk
    {
        pattern: /(?:skip|stop|don't need).{0,30}(?:medication|meds|pills|prescription)/i,
        category: 'health_risk',
        severity: 'urgent',
    },
    {
        pattern: /(?:thinking about|going to|planning to).{0,30}(?:not tell|hide from).{0,30}(?:doctor|therapist)/i,
        category: 'health_risk',
        severity: 'direct',
    },
    {
        pattern: /(?:it's just|only a little|not that much).{0,30}(?:drink|smoking|using)/i,
        category: 'health_risk',
        severity: 'direct',
    },
    // Avoidance pattern
    {
        pattern: /(?:easier to|better if i|should just).{0,30}(?:avoid|ignore|not deal with)/i,
        category: 'avoidance_pattern',
        severity: 'gentle',
    },
    {
        pattern: /(?:can't handle|not ready|too hard).{0,30}(?:right now|yet|anymore)/i,
        category: 'avoidance_pattern',
        severity: 'gentle',
    },
    // Harmful plan
    {
        pattern: /(?:thinking about|going to|planning to).{0,30}(?:quit|leave|walk out).{0,30}(?:without|before).{0,30}(?:another|backup|plan)/i,
        category: 'harmful_plan',
        severity: 'direct',
    },
    {
        pattern: /(?:don't care|doesn't matter).{0,30}(?:consequences|what happens|anymore)/i,
        category: 'harmful_plan',
        severity: 'urgent',
    },
];
/**
 * Phrases that indicate the user is fishing for validation
 */
const VALIDATION_FISHING_MARKERS = [
    /right\?$/i,
    /don't you think\??$/i,
    /isn't it\??$/i,
    /wouldn't you\??$/i,
    /you agree\??$/i,
    /makes sense\??$/i,
    /good idea\??$/i,
    /smart\??$/i,
    /good plan\??$/i,
];
/**
 * Context that increases the urgency of truth-telling
 */
const URGENCY_MULTIPLIERS = [
    { pattern: /(?:tomorrow|today|tonight|this week|soon)/i, multiplier: 1.3 },
    { pattern: /(?:already|just|about to)/i, multiplier: 1.2 },
    { pattern: /(?:kids|children|family|baby)/i, multiplier: 1.4 },
    { pattern: /(?:life savings|everything|all my money)/i, multiplier: 1.5 },
    { pattern: /(?:suicide|kill myself|end it|don't want to live)/i, multiplier: 2.0 },
];
// ============================================================================
// TRUTH FRAMINGS
// ============================================================================
/**
 * Suggested framings for different truth categories
 */
const TRUTH_FRAMINGS = {
    harmful_plan: [
        "I care about you, so I have to be honest—I'm worried about this plan.",
        "Can I share something that might be hard to hear? I'm concerned.",
        "I wouldn't be a good friend if I didn't say this...",
    ],
    self_deception: [
        "I notice you're trying to convince yourself, and I wonder if that's a sign.",
        "The fact that you're asking makes me think you already know the answer.",
        'What would you tell a friend in this exact situation?',
    ],
    validation_seeking: [
        "I think you're looking for me to agree, but I can't in good conscience.",
        'You seem to want me to validate this, but I think you deserve honesty instead.',
        "I'd rather disappoint you with truth than comfort you with agreement I don't feel.",
    ],
    avoidance_pattern: [
        "I've noticed this pattern before. Can we look at what you might be avoiding?",
        "What's the cost of continuing to avoid this?",
        "I'm not going to pretend this will go away on its own.",
    ],
    values_conflict: [
        "You've told me you value [X], but this seems to conflict with that. Help me understand.",
        'I want to check—does this align with what you said matters most to you?',
        "Something feels off between what you want and what you've said is important to you.",
    ],
    relationship_harm: [
        "I'm worried about how this might affect your relationship with them.",
        'Can we think about how this might land from their perspective?',
        'I care about your relationships, so I have to be honest about what I see happening.',
    ],
    health_risk: [
        "This concerns me from a health standpoint, and I'd be doing you a disservice not to say so.",
        "I'm not qualified to give medical advice, but I am qualified to express genuine concern.",
        'Your health is more important than me agreeing with you right now.',
    ],
    financial_risk: [
        "I can't validate this—the financial risk seems significant.",
        "I know this isn't what you want to hear, but I'm genuinely worried about this financially.",
        "Let's slow down. The potential downside here is serious.",
    ],
    legal_risk: [
        "I have to flag that this might have legal implications you haven't considered.",
        'Before anything else, have you talked to a lawyer about this?',
        "I'm concerned this could have consequences beyond what you're seeing right now.",
    ],
};
// ============================================================================
// CORE DETECTION
// ============================================================================
/**
 * Analyze user message for truth obligation triggers
 */
export function detectTruthObligation(userMessage, context = {}) {
    const evidence = [];
    let maxSeverity = 'gentle';
    let detectedCategory = null;
    let baseConfidence = 0;
    // Check for validation seeking patterns
    for (const { pattern, category, severity } of VALIDATION_SEEKING_PATTERNS) {
        if (pattern.test(userMessage)) {
            evidence.push(`Detected ${category} pattern: "${userMessage.match(pattern)?.[0]}"`);
            detectedCategory = category;
            baseConfidence = Math.max(baseConfidence, 0.7);
            if (SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(maxSeverity)) {
                maxSeverity = severity;
            }
        }
    }
    // Check for validation fishing markers
    let fishingScore = 0;
    for (const marker of VALIDATION_FISHING_MARKERS) {
        if (marker.test(userMessage)) {
            fishingScore += 0.15;
            evidence.push(`Validation fishing marker: "${userMessage.match(marker)?.[0]}"`);
        }
    }
    if (fishingScore > 0.3) {
        baseConfidence = Math.max(baseConfidence, 0.5 + fishingScore);
        if (!detectedCategory) {
            detectedCategory = 'validation_seeking';
        }
    }
    // Apply urgency multipliers
    let urgencyMultiplier = 1.0;
    for (const { pattern, multiplier } of URGENCY_MULTIPLIERS) {
        if (pattern.test(userMessage)) {
            urgencyMultiplier = Math.max(urgencyMultiplier, multiplier);
            evidence.push(`Urgency factor: "${userMessage.match(pattern)?.[0]}"`);
        }
    }
    // Adjust severity based on urgency
    if (urgencyMultiplier >= 1.5 && maxSeverity !== 'critical') {
        maxSeverity = SEVERITY_ORDER[Math.min(SEVERITY_ORDER.indexOf(maxSeverity) + 1, SEVERITY_ORDER.length - 1)];
    }
    // Check for values conflict if we have stated values
    if (context.statedValues && context.statedValues.length > 0 && !detectedCategory) {
        const valuesConflict = detectValuesConflict(userMessage, context.statedValues);
        if (valuesConflict) {
            detectedCategory = 'values_conflict';
            baseConfidence = Math.max(baseConfidence, 0.6);
            evidence.push(`Potential conflict with stated value: "${valuesConflict}"`);
        }
    }
    // Calculate final confidence
    const confidence = Math.min(baseConfidence * urgencyMultiplier, 1.0);
    // Determine if we should speak
    const shouldSpeak = confidence >= 0.5 && detectedCategory !== null;
    // Get suggested framing
    const suggestedFraming = detectedCategory
        ? getRandomElement(TRUTH_FRAMINGS[detectedCategory])
        : null;
    // Generate truth content
    const truthContent = shouldSpeak
        ? generateTruthContent(detectedCategory, userMessage, context)
        : null;
    // Determine if this bypasses stage gates
    // Urgent/critical truths bypass relationship stage requirements
    const bypassStageGates = maxSeverity === 'urgent' || maxSeverity === 'critical';
    log.debug({
        shouldSpeak,
        severity: maxSeverity,
        category: detectedCategory,
        confidence,
        bypassStageGates,
        evidenceCount: evidence.length,
    }, 'Truth obligation analyzed');
    return {
        shouldSpeak,
        severity: maxSeverity,
        category: detectedCategory,
        confidence,
        truthContent,
        suggestedFraming,
        evidence,
        bypassStageGates,
    };
}
// ============================================================================
// HELPERS
// ============================================================================
const SEVERITY_ORDER = ['gentle', 'direct', 'urgent', 'critical'];
/**
 * Detect if message conflicts with stated values
 */
function detectValuesConflict(message, values) {
    const messageLower = message.toLowerCase();
    // Simple keyword-based conflict detection
    const valueConflicts = {
        honesty: ['lie', 'deceive', 'hide', 'secret', 'not tell'],
        family: ['ignore', 'cut off', 'ghost', 'avoid'],
        health: ['skip medication', 'not tell doctor', 'ignore symptoms'],
        'financial security': ['gamble', 'bet', 'risk everything', 'all my money'],
        integrity: ['cheat', 'steal', 'lie', 'cover up'],
        relationships: ['ghost', 'disappear', 'not explain'],
    };
    for (const value of values) {
        const valueLower = value.toLowerCase();
        const conflicts = valueConflicts[valueLower] || [];
        for (const conflict of conflicts) {
            if (messageLower.includes(conflict)) {
                return value;
            }
        }
    }
    return null;
}
/**
 * Generate the truth content based on category and context
 */
function generateTruthContent(category, userMessage, context) {
    const contents = {
        harmful_plan: "I hear what you're planning, and I'm genuinely worried. Can we talk through the potential consequences?",
        self_deception: 'I think you might be telling yourself a story here. What would it mean if the opposite were true?',
        validation_seeking: "I don't think you're looking for my honest opinion—you're looking for agreement. And I respect you too much to give you false comfort.",
        avoidance_pattern: 'This feels like avoidance to me. What are you really protecting yourself from?',
        values_conflict: `You've told me ${context.statedValues?.[0] || 'certain things'} matter to you. How does this align with that?`,
        relationship_harm: "I'm worried about what this might do to your relationship. Can we explore that?",
        health_risk: "Your health has to come first. I can't pretend this doesn't concern me.",
        financial_risk: "The financial risk here is real. I'd be doing you a disservice if I didn't say so.",
        legal_risk: 'This might have legal implications. Have you talked to someone qualified about this?',
    };
    return contents[category];
}
/**
 * Get random element from array
 */
function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
// ============================================================================
// SESSION TRACKING
// ============================================================================
const sessionTruthObligations = new Map();
/**
 * Record a truth obligation for tracking
 */
export function recordTruthObligation(sessionId, result) {
    const existing = sessionTruthObligations.get(sessionId) || [];
    existing.push(result);
    sessionTruthObligations.set(sessionId, existing);
}
/**
 * Get truth obligations for session
 */
export function getSessionTruthObligations(sessionId) {
    return sessionTruthObligations.get(sessionId) || [];
}
/**
 * Clear session data
 */
export function clearSessionTruthObligations(sessionId) {
    sessionTruthObligations.delete(sessionId);
}
// ============================================================================
// EXPORTS
// ============================================================================
export { TRUTH_FRAMINGS, VALIDATION_SEEKING_PATTERNS };
//# sourceMappingURL=truth-obligation.js.map