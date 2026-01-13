/**
 * ACT Values Work
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Values clarification is the heart of ACT. This module helps users
 * identify what truly matters to them and take aligned action.
 *
 * PHILOSOPHY:
 * Values aren't goals—they're directions. You don't "achieve" being a
 * loving parent; you orient your life toward it. This shift from
 * goal-obsession to values-alignment is transformative.
 *
 * @module TherapeuticFrameworks/ACTValues
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'ACTValues' });
// ============================================================================
// VALUES STORAGE (in-memory for now, will be persisted)
// ============================================================================
const userValues = new Map();
const committedActions = new Map();
// ============================================================================
// VALUES EXPLORATION QUESTIONS
// ============================================================================
/**
 * Questions to help surface values in different life domains.
 */
export const VALUES_QUESTIONS = {
    relationships: [
        'What kind of friend do you want to be?',
        "When you're at your best with the people you love, what are you like?",
        'If your closest friend described you at your best, what would they say?',
        'What would you want people who know you well to say at your 80th birthday?',
    ],
    work: [
        'Forget money for a moment—what work would feel meaningful to you?',
        'When do you feel most engaged and alive at work?',
        "What impact do you want your work to have, even if it's small?",
        'What kind of colleague do you want to be?',
    ],
    health: [
        'Why does your health matter to you? What does being healthy let you do?',
        "When you're taking care of yourself, what does that look like?",
        'What does a body you feel good in mean to you?',
        'How do you want to feel in your body as you age?',
    ],
    growth: [
        'What do you want to learn or get better at? Why?',
        'What kind of person are you becoming?',
        'What challenges would you be proud to have faced?',
        'What does growth mean to you?',
    ],
    leisure: [
        'What do you do purely for the joy of it?',
        'When do you feel most playful or creative?',
        "What did you love as a kid that you've stopped doing?",
        'What does fun mean to you?',
    ],
    spirituality: [
        'What gives your life meaning?',
        'What experiences have made you feel connected to something larger?',
        'When do you feel most at peace?',
        'What do you hope your life stands for?',
    ],
    community: [
        'How do you want to contribute to your community?',
        'What causes matter to you? Why?',
        'What kind of citizen do you want to be?',
        'What would you change about the world if you could?',
    ],
    environment: [
        "What's your relationship with nature?",
        'How do you want to interact with the world around you?',
        'What environments make you feel most alive?',
        'What responsibility do you feel toward the planet?',
    ],
};
/**
 * Domain-specific value examples to help clarify.
 */
export const VALUE_EXAMPLES = {
    relationships: ['Connection', 'Loyalty', 'Honesty', 'Presence', 'Support', 'Intimacy', 'Trust'],
    work: ['Excellence', 'Impact', 'Creativity', 'Collaboration', 'Growth', 'Service', 'Mastery'],
    health: ['Vitality', 'Self-care', 'Balance', 'Strength', 'Energy', 'Longevity', 'Rest'],
    growth: [
        'Learning',
        'Curiosity',
        'Challenge',
        'Wisdom',
        'Improvement',
        'Resilience',
        'Expansion',
    ],
    leisure: ['Joy', 'Play', 'Creativity', 'Adventure', 'Rest', 'Expression', 'Fun'],
    spirituality: ['Meaning', 'Peace', 'Connection', 'Gratitude', 'Presence', 'Faith', 'Purpose'],
    community: ['Service', 'Justice', 'Contribution', 'Belonging', 'Generosity', 'Activism', 'Care'],
    environment: ['Sustainability', 'Stewardship', 'Connection', 'Respect', 'Beauty', 'Harmony'],
};
// ============================================================================
// VALUES DETECTION IN CONVERSATION
// ============================================================================
/**
 * Detect values being expressed in user speech.
 */
export function detectValuesInSpeech(text, context) {
    const detected = [];
    const lowerText = text.toLowerCase();
    // Direct value statements
    const valuePatterns = [
        { pattern: /i (?:really )?value (\w+(?:\s+\w+)?)/gi, confidence: 0.9 },
        { pattern: /(\w+(?:\s+\w+)?) (?:is|are) (?:really )?important to me/gi, confidence: 0.85 },
        { pattern: /i care (?:a lot )?about (\w+(?:\s+\w+)?)/gi, confidence: 0.8 },
        { pattern: /what matters (?:most )?to me is (\w+(?:\s+\w+)?)/gi, confidence: 0.9 },
        { pattern: /i want to be (?:a |more )?(\w+(?:\s+\w+)?)/gi, confidence: 0.75 },
        { pattern: /being (\w+) (?:is|means) (?:everything|so much)/gi, confidence: 0.85 },
    ];
    for (const { pattern, confidence } of valuePatterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const value = match[1].trim();
            if (value.length > 2 && value.length < 30) {
                const domain = inferDomain(value);
                detected.push({
                    value,
                    domain,
                    confidence,
                    sourcePhrase: match[0],
                });
            }
        }
    }
    // Indirect value indicators
    const indirectIndicators = {
        'be there for': { value: 'Presence', domain: 'relationships' },
        'make time for': { value: 'Prioritization', domain: 'relationships' },
        'be honest': { value: 'Honesty', domain: 'relationships' },
        'help others': { value: 'Service', domain: 'community' },
        'make a difference': { value: 'Impact', domain: 'work' },
        'keep learning': { value: 'Growth', domain: 'growth' },
        'take care of myself': { value: 'Self-care', domain: 'health' },
        'spend quality time': { value: 'Connection', domain: 'relationships' },
        'give back': { value: 'Contribution', domain: 'community' },
        'be creative': { value: 'Creativity', domain: 'leisure' },
    };
    for (const [phrase, { value, domain }] of Object.entries(indirectIndicators)) {
        if (lowerText.includes(phrase)) {
            detected.push({
                value,
                domain,
                confidence: 0.7,
                sourcePhrase: phrase,
            });
        }
    }
    return detected;
}
/**
 * Infer the value domain from a value string.
 */
function inferDomain(value) {
    const lower = value.toLowerCase();
    const domainKeywords = {
        relationships: ['family', 'friend', 'partner', 'love', 'connection', 'trust', 'loyalty'],
        work: ['career', 'job', 'achievement', 'success', 'impact', 'professional', 'excel'],
        health: ['health', 'wellness', 'fitness', 'energy', 'body', 'sleep', 'exercise'],
        growth: ['learn', 'grow', 'improve', 'develop', 'wisdom', 'skill', 'knowledge'],
        leisure: ['fun', 'play', 'creative', 'hobby', 'enjoy', 'relax', 'adventure'],
        spirituality: ['meaning', 'purpose', 'faith', 'peace', 'spirit', 'soul', 'mindful'],
        community: ['community', 'give', 'volunteer', 'help', 'society', 'cause', 'justice'],
        environment: ['nature', 'environment', 'earth', 'sustainable', 'planet', 'outdoor'],
    };
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
        if (keywords.some((k) => lower.includes(k))) {
            return domain;
        }
    }
    return 'growth'; // Default domain
}
// ============================================================================
// VALUES RECORDING
// ============================================================================
/**
 * Record a value that a user has identified.
 */
export function recordValue(userId, value, domain, options) {
    const actValue = {
        value,
        domain,
        meaning: options?.meaning,
        currentAlignment: options?.currentAlignment,
        importance: options?.importance,
        identifiedAt: new Date(),
        committedActions: [],
    };
    const existing = userValues.get(userId) || [];
    // Check if this value already exists
    const existingIndex = existing.findIndex((v) => v.value.toLowerCase() === value.toLowerCase() && v.domain === domain);
    if (existingIndex >= 0) {
        // Update existing
        existing[existingIndex] = { ...existing[existingIndex], ...actValue };
    }
    else {
        // Add new
        existing.push(actValue);
    }
    userValues.set(userId, existing);
    log.debug({ userId, value, domain }, '💎 Value recorded');
    return actValue;
}
/**
 * Get all values for a user.
 */
export function getUserValues(userId) {
    return userValues.get(userId) || [];
}
/**
 * Get values by domain.
 */
export function getValuesByDomain(userId, domain) {
    const all = getUserValues(userId);
    return all.filter((v) => v.domain === domain);
}
/**
 * Get a user's most important values.
 */
export function getTopValues(userId, limit = 5) {
    const all = getUserValues(userId);
    return all
        .filter((v) => v.importance !== undefined)
        .sort((a, b) => (b.importance || 0) - (a.importance || 0))
        .slice(0, limit);
}
// ============================================================================
// COMMITTED ACTIONS
// ============================================================================
/**
 * Record a committed action toward a value.
 */
export function recordCommittedAction(userId, valueId, action, targetDate) {
    const committedAction = {
        action,
        valueId,
        targetDate,
        completed: false,
    };
    const existing = committedActions.get(userId) || [];
    existing.push(committedAction);
    committedActions.set(userId, existing);
    log.debug({ userId, action, valueId }, '🎯 Committed action recorded');
    return committedAction;
}
/**
 * Mark a committed action as complete.
 */
export function completeAction(userId, action, reflection, alignmentRating) {
    const existing = committedActions.get(userId) || [];
    const found = existing.find((a) => a.action === action && !a.completed);
    if (found) {
        found.completed = true;
        found.completedAt = new Date();
        found.reflection = reflection;
        found.alignmentRating = alignmentRating;
        log.debug({ userId, action, alignmentRating }, '✅ Action completed');
    }
}
/**
 * Get pending committed actions.
 */
export function getPendingActions(userId) {
    const all = committedActions.get(userId) || [];
    return all.filter((a) => !a.completed);
}
// ============================================================================
// VALUES ALIGNMENT CHECK
// ============================================================================
/**
 * Check if a proposed action aligns with user's values.
 * Uses semantic similarity with keyword fallback for fast, accurate alignment detection.
 */
export function checkValuesAlignment(userId, proposedAction) {
    const values = getUserValues(userId);
    if (values.length === 0) {
        return {
            hasValues: false,
            alignedValues: [],
            misalignedValues: [],
            alignmentScore: null,
            suggestion: "We haven't explored your values yet. Want to take a few minutes to think about what matters most to you?",
        };
    }
    const alignedValues = [];
    const misalignedValues = [];
    const actionLower = proposedAction.toLowerCase();
    for (const value of values) {
        // Use semantic similarity with fallback to keyword matching
        const isAligned = checkSemanticValueAlignment(actionLower, value);
        if (isAligned) {
            alignedValues.push(value.value);
        }
    }
    // Calculate alignment score based on top values
    const topValues = getTopValues(userId, 3);
    const alignsWithTop = topValues.some((v) => checkSemanticValueAlignment(actionLower, v));
    // Score: 0.9 if aligns with top values, 0.6 if other values, 0.3 if no match
    const alignmentScore = alignsWithTop ? 0.9 : alignedValues.length > 0 ? 0.6 : 0.3;
    let suggestion;
    if (alignmentScore < 0.5 && topValues.length > 0) {
        suggestion = `I notice this might not directly connect to what you said matters most: ${topValues.map((v) => v.value).join(', ')}. Is that okay, or would you like to think about how it connects?`;
    }
    return {
        hasValues: true,
        alignedValues,
        misalignedValues,
        alignmentScore,
        suggestion,
    };
}
/**
 * Check semantic alignment between an action and a value.
 * Uses expanded synonym matching for fast semantic similarity.
 */
function checkSemanticValueAlignment(actionLower, value) {
    // Direct match check
    if (actionLower.includes(value.value.toLowerCase()) || actionLower.includes(value.domain)) {
        return true;
    }
    // Semantic synonym expansion for common values
    const semanticExpansions = {
        // Family domain
        family: ['kids', 'children', 'parents', 'spouse', 'partner', 'home', 'loved ones', 'relatives'],
        connection: ['together', 'bonding', 'quality time', 'relationship', 'close', 'intimate'],
        love: ['care', 'affection', 'devoted', 'cherish', 'adore', 'warmth'],
        // Career domain
        growth: ['learning', 'improving', 'developing', 'advancing', 'progress', 'better'],
        success: ['achieve', 'accomplish', 'win', 'goal', 'milestone', 'result'],
        contribution: ['help', 'impact', 'difference', 'serve', 'support', 'meaningful'],
        // Health domain
        health: ['fitness', 'exercise', 'wellness', 'energy', 'strength', 'vitality'],
        balance: ['harmony', 'equilibrium', 'sustainable', 'moderation', 'steady'],
        vitality: ['alive', 'vibrant', 'energetic', 'thriving', 'flourishing'],
        // Personal domain
        authenticity: ['genuine', 'real', 'honest', 'true', 'sincere', 'authentic'],
        creativity: ['create', 'imagine', 'innovate', 'design', 'express', 'artistic'],
        freedom: ['independence', 'autonomy', 'choice', 'flexible', 'liberated'],
        // Community domain
        service: ['volunteer', 'give', 'help', 'community', 'charity', 'support'],
        justice: ['fair', 'equal', 'rights', 'advocate', 'stand up'],
        belonging: ['community', 'part of', 'member', 'connected', 'included'],
        // Leisure domain
        adventure: ['explore', 'travel', 'discover', 'new', 'exciting', 'experience'],
        play: ['fun', 'enjoy', 'relax', 'recreation', 'leisure', 'pleasure'],
        nature: ['outdoors', 'hiking', 'garden', 'wildlife', 'environment', 'natural'],
        // Spirituality domain
        peace: ['calm', 'serene', 'tranquil', 'quiet', 'mindful', 'centered'],
        meaning: ['purpose', 'significant', 'matter', 'important', 'fulfilling'],
        gratitude: ['thankful', 'appreciate', 'grateful', 'blessed', 'fortunate'],
    };
    // Check semantic expansions
    const valueLower = value.value.toLowerCase();
    const expansions = semanticExpansions[valueLower] || [];
    for (const synonym of expansions) {
        if (actionLower.includes(synonym)) {
            return true;
        }
    }
    // Check domain-specific keywords
    const domainKeywords = semanticExpansions[value.domain] || [];
    for (const keyword of domainKeywords) {
        if (actionLower.includes(keyword)) {
            return true;
        }
    }
    return false;
}
// ============================================================================
// VALUES EXPLORATION PROMPTS
// ============================================================================
/**
 * Get a values exploration question for a domain.
 */
export function getValuesQuestion(domain) {
    const questions = VALUES_QUESTIONS[domain];
    return questions[Math.floor(Math.random() * questions.length)];
}
/**
 * Get a random value example for a domain.
 */
export function getValueExamples(domain, count = 3) {
    const examples = VALUE_EXAMPLES[domain];
    const shuffled = [...examples].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}
/**
 * Generate a values clarification prompt.
 */
export function generateValuesPrompt(userId, context) {
    const values = getUserValues(userId);
    if (values.length === 0) {
        // Introduction to values work
        return `Here's a question that might seem simple but often isn't: What matters most to you? Not what you're supposed to say matters, but what actually does—when you're being really honest with yourself.`;
    }
    // Check for domains not yet explored
    const exploredDomains = new Set(values.map((v) => v.domain));
    const allDomains = [
        'relationships',
        'work',
        'health',
        'growth',
        'leisure',
        'spirituality',
        'community',
        'environment',
    ];
    const unexplored = allDomains.filter((d) => !exploredDomains.has(d));
    if (unexplored.length > 0) {
        const domain = unexplored[0];
        return getValuesQuestion(domain);
    }
    // Deepen existing values
    const leastAligned = values
        .filter((v) => v.currentAlignment !== undefined)
        .sort((a, b) => (a.currentAlignment || 10) - (b.currentAlignment || 10))[0];
    if (leastAligned && (leastAligned.currentAlignment || 10) < 5) {
        return `You mentioned ${leastAligned.value} is important to you, but you're not feeling very aligned with it right now. What would living that value more fully look like?`;
    }
    // Default: reflect on values
    const topValues = getTopValues(userId, 2);
    if (topValues.length > 0) {
        const v = topValues[0];
        return `You said ${v.value} matters to you. When was the last time you really lived that?`;
    }
    return `What does a life well-lived mean to you?`;
}
// ============================================================================
// CONTEXT FOR LLM
// ============================================================================
/**
 * Build values context for the LLM.
 */
export function buildValuesContext(userId) {
    const values = getUserValues(userId);
    if (values.length === 0) {
        return null;
    }
    const topValues = getTopValues(userId, 5);
    const pendingActions = getPendingActions(userId);
    const lines = ['[💎 THEIR VALUES]', ''];
    if (topValues.length > 0) {
        lines.push('What matters most to them:');
        for (const v of topValues) {
            let line = `• ${v.value} (${v.domain})`;
            if (v.currentAlignment !== undefined) {
                const aligned = v.currentAlignment >= 7
                    ? '✓ living it'
                    : v.currentAlignment >= 4
                        ? '~ working on it'
                        : '⚠ gap';
                line += ` [${aligned}]`;
            }
            lines.push(line);
        }
        lines.push('');
    }
    if (pendingActions.length > 0) {
        lines.push('Committed to:');
        for (const a of pendingActions.slice(0, 3)) {
            lines.push(`• ${a.action}`);
        }
        lines.push('');
    }
    lines.push('Use this to connect suggestions back to what truly matters to them.');
    return lines.join('\n');
}
// All constants are exported at their definitions above
//# sourceMappingURL=act-values.js.map