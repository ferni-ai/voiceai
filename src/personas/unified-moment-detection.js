/**
 * Unified Moment Detection - Single Source of Truth
 *
 * > "We hear what you're not saying."
 *
 * This module consolidates all moment detection into a single system.
 * It serves multiple consumers:
 * - Relationship Memory (significant shared moments)
 * - Meaningful Silence (memorable details for callbacks)
 * - Predictive Intelligence (pattern detection)
 * - Trust Systems (vulnerability, breakthroughs)
 *
 * All moment detection should go through this module to ensure:
 * - Consistent detection patterns
 * - No duplicate detection logic
 * - Single place to improve detection
 * - Unified logging and analytics
 */
import { createLogger } from '../utils/safe-logger.js';
const log = createLogger({ module: 'UnifiedMomentDetection' });
// ============================================================================
// DETECTION PATTERNS - CONSOLIDATED
// ============================================================================
/**
 * Breakthrough detection patterns
 */
const BREAKTHROUGH_PATTERNS = {
    realizations: [
        /i never realized/i,
        /i just realized/i,
        /that'?s why i/i,
        /now i understand/i,
        /it all makes sense/i,
        /i'?ve been/i,
        /oh my god/i,
        /oh wow/i,
        /i finally get it/i,
        /the pattern/i,
    ],
    insights: [
        /so what you'?re saying is/i,
        /you'?re right/i,
        /that hits different/i,
        /that lands/i,
        /i needed to hear that/i,
        /that resonates/i,
    ],
    shifts: [
        /i think i need to/i,
        /i want to change/i,
        /i'?m going to/i,
        /it'?s time to/i,
        /i have to stop/i,
    ],
};
/**
 * Vulnerability detection patterns
 */
const VULNERABILITY_PATTERNS = {
    emotional_sharing: [
        /i'?ve never told anyone/i,
        /i'?ve been struggling with/i,
        /i'?m scared that/i,
        /i feel so/i,
        /i'?m afraid/i,
        /it hurts/i,
        /i'?m worried/i,
        /i feel alone/i,
        /i'?ve been hiding/i,
    ],
    admissions: [
        /i should have/i,
        /i regret/i,
        /i failed/i,
        /i let .* down/i,
        /i'?m ashamed/i,
        /i made a mistake/i,
        /the truth is/i,
        /to be honest/i,
    ],
    trust_demonstration: [
        /i trust you/i,
        /i can'?t tell anyone else/i,
        /between us/i,
        /please don'?t judge/i,
        /this is hard to say/i,
    ],
};
/**
 * Celebration detection patterns
 */
const CELEBRATION_PATTERNS = [
    /i did it/i,
    /i got the/i,
    /i finally/i,
    /i'?m so excited/i,
    /great news/i,
    /guess what/i,
    /i can'?t believe it/i,
    /i'?m so happy/i,
    /i made it/i,
    /i'?m promoted/i,
];
/**
 * Crisis detection patterns
 */
const CRISIS_PATTERNS = [
    /i can'?t do this anymore/i,
    /what'?s the point/i,
    /nothing matters/i,
    /i give up/i,
    /i'?m done/i,
    /i don'?t want to be here/i,
    /i feel empty/i,
    /i can'?t go on/i,
    /everything is falling apart/i,
];
/**
 * Laughter/joy detection patterns
 */
const LAUGHTER_PATTERNS = [
    /haha/i,
    /lol/i,
    /lmao/i,
    /that'?s hilarious/i,
    /😂/,
    /🤣/,
    /i love that/i,
    /that made me smile/i,
];
/**
 * Memorable detail patterns (for callbacks during silence)
 */
const MEMORABLE_DETAIL_PATTERNS = [
    {
        pattern: /my (mom|dad|mother|father|sister|brother|wife|husband|son|daughter|partner|kids?|children)/i,
        category: 'family',
    },
    { pattern: /(?:named|called)\s+([A-Z][a-z]+)/i, category: 'name' },
    { pattern: /(?:getting|got)\s+(married|divorced|engaged)/i, category: 'life_event' },
    { pattern: /(?:having|had)\s+a\s+baby/i, category: 'life_event' },
    { pattern: /(?:starting|started|new)\s+(?:a\s+)?(?:job|business|company)/i, category: 'career' },
    { pattern: /(?:lost|passed away|died|death)/i, category: 'grief' },
    { pattern: /(?:moved|moving)\s+to\s+([A-Za-z\s]+)/i, category: 'location' },
    { pattern: /my\s+dream\s+is\s+to/i, category: 'dream' },
    { pattern: /(?:birthday|anniversary|retirement)/i, category: 'milestone' },
];
// ============================================================================
// MAIN DETECTION FUNCTION
// ============================================================================
let momentCounter = 0;
/**
 * Unified moment detection - single entry point for all moment detection
 */
export function detectMomentsUnified(context) {
    const { userMessage, sessionNumber, hasSharedVulnerabilityBefore, topic } = context;
    const messageLower = userMessage.toLowerCase();
    const moments = [];
    const memorableDetails = [];
    // ============================================================================
    // DETECT BREAKTHROUGHS
    // ============================================================================
    for (const patterns of Object.values(BREAKTHROUGH_PATTERNS)) {
        for (const pattern of patterns) {
            if (pattern.test(messageLower)) {
                moments.push(createMoment({
                    category: 'cognitive',
                    type: 'breakthrough',
                    confidence: 0.75,
                    summary: 'User had a realization or insight',
                    triggerPhrase: extractTriggerPhrase(userMessage, pattern),
                    topic,
                    significance: 0.8,
                    tags: ['insight', 'realization'],
                    originalMessage: userMessage,
                }));
                break; // Only one breakthrough per message
            }
        }
        if (moments.some((m) => m.type === 'breakthrough'))
            break;
    }
    // ============================================================================
    // DETECT VULNERABILITY
    // ============================================================================
    const vulnPatterns = [
        ...VULNERABILITY_PATTERNS.emotional_sharing,
        ...VULNERABILITY_PATTERNS.admissions,
        ...VULNERABILITY_PATTERNS.trust_demonstration,
    ];
    for (const pattern of vulnPatterns) {
        if (pattern.test(messageLower)) {
            const isFirstVulnerability = !hasSharedVulnerabilityBefore;
            moments.push(createMoment({
                category: 'emotional',
                type: isFirstVulnerability ? 'first_vulnerability' : 'trust_demonstration',
                confidence: 0.8,
                summary: isFirstVulnerability
                    ? 'User shared something vulnerable for the first time'
                    : 'User shared something personal',
                triggerPhrase: extractTriggerPhrase(userMessage, pattern),
                topic,
                significance: isFirstVulnerability ? 0.95 : 0.7,
                tags: isFirstVulnerability
                    ? ['first', 'vulnerability', 'trust']
                    : ['vulnerability', 'sharing'],
                originalMessage: userMessage,
            }));
            break;
        }
    }
    // ============================================================================
    // DETECT CELEBRATIONS
    // ============================================================================
    for (const pattern of CELEBRATION_PATTERNS) {
        if (pattern.test(messageLower)) {
            moments.push(createMoment({
                category: 'emotional',
                type: 'celebration',
                confidence: 0.7,
                summary: 'User shared something to celebrate',
                triggerPhrase: extractTriggerPhrase(userMessage, pattern),
                topic,
                significance: 0.75,
                tags: ['celebration', 'positive', 'achievement'],
                originalMessage: userMessage,
            }));
            break;
        }
    }
    // ============================================================================
    // DETECT CRISIS
    // ============================================================================
    for (const pattern of CRISIS_PATTERNS) {
        if (pattern.test(messageLower)) {
            moments.push(createMoment({
                category: 'emotional',
                type: 'crisis_support',
                confidence: 0.85,
                summary: 'User expressing significant distress',
                triggerPhrase: extractTriggerPhrase(userMessage, pattern),
                topic,
                significance: 1.0, // Highest priority
                tags: ['crisis', 'urgent', 'support'],
                originalMessage: userMessage,
            }));
            break;
        }
    }
    // ============================================================================
    // DETECT LAUGHTER
    // ============================================================================
    for (const pattern of LAUGHTER_PATTERNS) {
        if (pattern.test(messageLower)) {
            moments.push(createMoment({
                category: 'behavioral',
                type: 'laughter',
                confidence: 0.65,
                summary: 'Shared moment of laughter',
                triggerPhrase: extractTriggerPhrase(userMessage, pattern),
                topic,
                significance: 0.5,
                tags: ['humor', 'connection', 'joy'],
                originalMessage: userMessage,
            }));
            break;
        }
    }
    // ============================================================================
    // EXTRACT MEMORABLE DETAILS (for callbacks)
    // ============================================================================
    for (const { pattern, category } of MEMORABLE_DETAIL_PATTERNS) {
        const match = userMessage.match(pattern);
        if (match) {
            const detail = extractMemorableDetail(match, category);
            if (detail) {
                memorableDetails.push(detail);
            }
        }
    }
    // Add memorable details to relevant moments
    for (const moment of moments) {
        moment.memorableDetails = memorableDetails;
    }
    // ============================================================================
    // BUILD RESULT
    // ============================================================================
    const sortedMoments = moments.sort((a, b) => b.significance - a.significance);
    const primaryMoment = sortedMoments[0] || null;
    // Determine if we should acknowledge
    const shouldAcknowledge = primaryMoment !== null && primaryMoment.significance >= 0.7;
    log.debug({
        messagePreview: userMessage.slice(0, 50),
        momentsDetected: moments.length,
        primaryType: primaryMoment?.type,
        memorableDetails: memorableDetails.length,
    }, 'Unified moment detection complete');
    return {
        moments: sortedMoments,
        primaryMoment,
        memorableDetails,
        shouldAcknowledge,
        acknowledgmentSuggestion: primaryMoment ? generateAcknowledgment(primaryMoment) : undefined,
    };
}
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
function createMoment(input) {
    return {
        id: `moment_${++momentCounter}_${Date.now()}`,
        ...input,
        memorableDetails: [],
        detectedAt: new Date(),
    };
}
function extractTriggerPhrase(message, pattern) {
    const match = message.match(pattern);
    return match ? match[0] : undefined;
}
function extractMemorableDetail(match, category) {
    switch (category) {
        case 'family':
            return match[1] ? `your ${match[1].toLowerCase()}` : null;
        case 'name':
            return match[1] && match[1].length > 2 ? match[1] : null;
        case 'life_event':
        case 'career':
        case 'grief':
        case 'milestone':
            return match[0];
        case 'location':
            return match[1] ? `moving to ${match[1]}` : null;
        case 'dream':
            return 'your dream';
        default:
            return match[0];
    }
}
function generateAcknowledgment(moment) {
    switch (moment.type) {
        case 'breakthrough':
            return 'That sounds like an important realization.';
        case 'first_vulnerability':
            return 'Thank you for trusting me with that.';
        case 'trust_demonstration':
            return "I hear you. That's a lot to carry.";
        case 'celebration':
            return "That's wonderful! I'm so happy for you.";
        case 'crisis_support':
            return "I'm here. That sounds really hard.";
        case 'laughter':
            return 'I love that we can laugh together.';
        default:
            return 'I appreciate you sharing that.';
    }
}
// ============================================================================
// CONVENIENCE EXPORTS - For backward compatibility
// ============================================================================
/**
 * Backward-compatible wrapper for moment-detection.ts
 */
export function detectMoments(context) {
    return detectMomentsUnified(context).moments;
}
/**
 * Backward-compatible wrapper for meaningful-silence.ts
 */
export function extractMemorableMoments(message) {
    const result = detectMomentsUnified({
        userMessage: message,
        sessionNumber: 1,
        hasSharedVulnerabilityBefore: false,
    });
    return result.memorableDetails;
}
export default {
    detectMomentsUnified,
    detectMoments,
    extractMemorableMoments,
};
//# sourceMappingURL=unified-moment-detection.js.map