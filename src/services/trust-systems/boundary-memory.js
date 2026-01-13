/**
 * Boundary Memory
 *
 * Remembering what NOT to bring up - the sacred trust of respecting
 * what someone has told you is off-limits.
 *
 * Philosophy: Breaking trust by mentioning something painful is the
 * fastest way to lose someone. A great friend remembers not just what
 * to say, but what NOT to say.
 *
 * This system tracks:
 * - Explicit boundaries ("I don't want to talk about X")
 * - Topics that caused distress
 * - Sensitive areas to approach carefully
 * - Preferences about depth/probing
 *
 * @module BoundaryMemory
 */
import { createLogger } from '../../utils/safe-logger.js';
import { indexBoundary } from '../data-layer/integrations/index.js';
const log = createLogger({ module: 'BoundaryMemory' });
// ============================================================================
// DETECTION PATTERNS
// ============================================================================
/** Phrases that establish explicit boundaries */
const EXPLICIT_BOUNDARY_PATTERNS = [
    /i (don't|do not|won't|will not) (want to |wanna )?(talk|speak|discuss) about/i,
    /can we (not|please not) (talk|discuss|bring up)/i,
    /i('d| would) (rather|prefer) not (talk|discuss|go into)/i,
    /please (don't|do not) (ask|mention|bring up)/i,
    /that's (off limits|private|none of your)/i,
    /i('m| am) not (ready|comfortable) (talking|discussing)/i,
    /drop it/i,
    /leave it alone/i,
    /stop (asking|bringing) (that|it) up/i,
];
/** Phrases that indicate distress about a topic */
const DISTRESS_INDICATORS = [
    /i (can't|cannot) (talk|think) about (this|that|it)/i,
    /this is (too hard|too painful|too much)/i,
    /i('m| am) not (ready|able)/i,
    /(please|can you) (just |)(stop|change)/i,
    /i need (a minute|to stop|a break)/i,
];
// ============================================================================
// IN-MEMORY STORE
// ============================================================================
const boundaryProfiles = new Map();
function getOrCreateProfile(userId) {
    let profile = boundaryProfiles.get(userId);
    if (!profile) {
        profile = {
            userId,
            boundaries: [],
            depthPreferences: {
                probingTolerance: 'medium',
                deepTopics: [],
                surfaceOnlyTopics: [],
            },
            boundaryRespects: [],
        };
        boundaryProfiles.set(userId, profile);
    }
    return profile;
}
// ============================================================================
// BOUNDARY DETECTION
// ============================================================================
/**
 * Detect if a user message establishes a new boundary
 */
export function detectNewBoundary(userId, userMessage, context) {
    const lower = userMessage.toLowerCase();
    const profile = getOrCreateProfile(userId);
    // 1. Check for explicit boundary statements
    const isExplicit = EXPLICIT_BOUNDARY_PATTERNS.some((pattern) => pattern.test(lower));
    if (isExplicit) {
        const topic = context.currentTopic || context.recentTopic || extractTopic(lower);
        if (!topic)
            return null;
        // Check if boundary already exists
        const existing = profile.boundaries.find((b) => b.topic.toLowerCase() === topic.toLowerCase());
        if (existing) {
            existing.strength = 'absolute'; // Reinforce
            return existing;
        }
        const boundary = {
            id: `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            topic,
            relatedTerms: extractRelatedTerms(topic),
            type: 'explicit',
            strength: 'absolute',
            establishedAt: new Date(),
            context: userMessage.slice(0, 200),
            userReopened: false,
        };
        profile.boundaries.push(boundary);
        // Index to semantic memory - boundaries are ALWAYS indexed (critical trust data)
        indexBoundary(userId, {
            id: boundary.id,
            topic: boundary.topic,
            type: boundary.type,
            strength: boundary.strength,
            relatedTerms: boundary.relatedTerms,
            context: boundary.context,
        }, 'create');
        log.info({ userId, topic, type: 'explicit' }, '🚫 New boundary established');
        return boundary;
    }
    // 2. Check for distress-inferred boundary
    const showsDistress = DISTRESS_INDICATORS.some((pattern) => pattern.test(lower));
    if (showsDistress && context.emotionIntensity && context.emotionIntensity > 0.7) {
        const topic = context.currentTopic || context.recentTopic;
        if (!topic)
            return null;
        const existing = profile.boundaries.find((b) => b.topic.toLowerCase() === topic.toLowerCase());
        if (existing)
            return null; // Already tracking
        const boundary = {
            id: `boundary_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            topic,
            relatedTerms: extractRelatedTerms(topic),
            type: 'inferred_distress',
            strength: 'strong',
            establishedAt: new Date(),
            context: userMessage.slice(0, 200),
            userReopened: false,
        };
        profile.boundaries.push(boundary);
        // Index to semantic memory - boundaries are ALWAYS indexed (critical trust data)
        indexBoundary(userId, {
            id: boundary.id,
            topic: boundary.topic,
            type: boundary.type,
            strength: boundary.strength,
            relatedTerms: boundary.relatedTerms,
            context: boundary.context,
        }, 'create');
        log.info({ userId, topic, type: 'inferred_distress' }, '🚫 Distress boundary detected');
        return boundary;
    }
    return null;
}
/**
 * Extract the topic being bounded from the message
 */
function extractTopic(message) {
    // Common patterns: "don't talk about X", "not discuss X"
    const patterns = [
        /(?:talk|speak|discuss|mention|bring up) (?:about )?(.+?)(?:\.|$|,|\?)/i,
        /(?:the|my|that) (.+?) (?:is|are) (?:off limits|private)/i,
    ];
    for (const pattern of patterns) {
        const match = message.match(pattern);
        if (match && match[1]) {
            return match[1].trim().slice(0, 50);
        }
    }
    return null;
}
/**
 * Extract related terms for a topic
 */
function extractRelatedTerms(topic) {
    const terms = [topic.toLowerCase()];
    // Common related terms for sensitive topics
    const relatedMap = {
        divorce: ['ex', 'separated', 'custody', 'settlement'],
        death: ['passed', 'funeral', 'grief', 'loss', 'died'],
        father: ['dad', 'daddy', 'pa', 'papa'],
        mother: ['mom', 'mommy', 'ma', 'mama'],
        family: ['relatives', 'parents', 'siblings'],
        money: ['finances', 'debt', 'bills', 'broke'],
        work: ['job', 'boss', 'fired', 'laid off'],
        relationship: ['partner', 'girlfriend', 'boyfriend', 'spouse'],
        health: ['diagnosis', 'doctor', 'hospital', 'sick'],
        abuse: ['hurt', 'trauma', 'violence'],
    };
    const lowerTopic = topic.toLowerCase();
    for (const [key, related] of Object.entries(relatedMap)) {
        if (lowerTopic.includes(key)) {
            terms.push(...related);
        }
    }
    return [...new Set(terms)];
}
// ============================================================================
// BOUNDARY CHECKING
// ============================================================================
/**
 * Check if an AI response would cross any boundaries
 */
export function checkBoundary(userId, proposedContent, context) {
    const profile = boundaryProfiles.get(userId);
    if (!profile || profile.boundaries.length === 0) {
        return {
            crossesBoundary: false,
            recommendation: 'proceed_normally',
        };
    }
    const lower = proposedContent.toLowerCase();
    for (const boundary of profile.boundaries) {
        // Check if content mentions the bounded topic
        const mentionsTopic = lower.includes(boundary.topic.toLowerCase()) ||
            boundary.relatedTerms.some((term) => lower.includes(term));
        if (!mentionsTopic)
            continue;
        // If user reopened the topic themselves, it's okay to follow
        if (boundary.userReopened || context.userInitiatedTopic) {
            return {
                crossesBoundary: false,
                boundary,
                recommendation: 'okay_if_user_initiated',
            };
        }
        // Absolute boundaries are never okay to cross
        if (boundary.strength === 'absolute') {
            return {
                crossesBoundary: true,
                boundary,
                recommendation: 'avoid_completely',
            };
        }
        // Strong boundaries need careful approach
        if (boundary.strength === 'strong') {
            return {
                crossesBoundary: true,
                boundary,
                recommendation: 'approach_carefully',
                carefulApproach: `I know ${boundary.topic} is sensitive. I won't go there unless you want to.`,
            };
        }
        // Moderate - just be careful
        return {
            crossesBoundary: false,
            boundary,
            recommendation: 'approach_carefully',
            carefulApproach: `I want to be thoughtful about how we discuss ${boundary.topic}.`,
        };
    }
    return {
        crossesBoundary: false,
        recommendation: 'proceed_normally',
    };
}
/**
 * Check if a topic should be avoided entirely
 */
export function isTopicOffLimits(userId, topic) {
    const profile = boundaryProfiles.get(userId);
    if (!profile)
        return false;
    const lower = topic.toLowerCase();
    return profile.boundaries.some((b) => b.strength === 'absolute' &&
        !b.userReopened &&
        (b.topic.toLowerCase() === lower || b.relatedTerms.some((t) => lower.includes(t))));
}
/**
 * Get all active boundaries for a user
 */
export function getActiveBoundaries(userId) {
    const profile = boundaryProfiles.get(userId);
    return profile?.boundaries || [];
}
/**
 * Record that user reopened a bounded topic
 */
export function recordUserReopened(userId, topic) {
    const profile = boundaryProfiles.get(userId);
    if (!profile)
        return;
    const lower = topic.toLowerCase();
    const boundary = profile.boundaries.find((b) => b.topic.toLowerCase() === lower || b.relatedTerms.some((t) => lower.includes(t)));
    if (boundary) {
        boundary.userReopened = true;
        boundary.lastUserMention = new Date();
        log.info({ userId, topic }, '🔓 User reopened bounded topic');
    }
}
/**
 * Record that we respected a boundary (for learning)
 */
export function recordBoundaryRespect(userId, boundaryId, wasAppreciated) {
    const profile = boundaryProfiles.get(userId);
    if (!profile)
        return;
    profile.boundaryRespects.push({
        boundaryId,
        timestamp: new Date(),
        wasAppreciated,
    });
}
// ============================================================================
// PROBING PREFERENCES
// ============================================================================
/**
 * Update user's probing tolerance based on reactions
 */
export function updateProbingTolerance(userId, reaction) {
    const profile = getOrCreateProfile(userId);
    if (reaction === 'welcomed') {
        if (profile.depthPreferences.probingTolerance === 'low') {
            profile.depthPreferences.probingTolerance = 'medium';
        }
        else if (profile.depthPreferences.probingTolerance === 'medium') {
            profile.depthPreferences.probingTolerance = 'high';
        }
    }
    else if (reaction === 'resisted') {
        if (profile.depthPreferences.probingTolerance === 'high') {
            profile.depthPreferences.probingTolerance = 'medium';
        }
        else if (profile.depthPreferences.probingTolerance === 'medium') {
            profile.depthPreferences.probingTolerance = 'low';
        }
    }
}
/**
 * Get recommended probing depth for this user
 */
export function getProbingDepth(userId) {
    const profile = boundaryProfiles.get(userId);
    return profile?.depthPreferences.probingTolerance || 'medium';
}
// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================
/**
 * Export boundaries for persistence
 */
export function exportBoundaries(userId) {
    return boundaryProfiles.get(userId) || null;
}
/**
 * Import boundaries from persistence
 */
export function importBoundaries(profile) {
    boundaryProfiles.set(profile.userId, profile);
    log.debug({ userId: profile.userId, boundaryCount: profile.boundaries.length }, 'Imported boundary profile');
}
// In-memory stores for protective memory
const prematureAdviceRecords = new Map();
const boundarySoftenings = new Map();
/**
 * Record when advice was given at the wrong time.
 */
export function recordPrematureAdvice(userId, advice, topic, reaction) {
    let records = prematureAdviceRecords.get(userId);
    if (!records) {
        records = [];
        prematureAdviceRecords.set(userId, records);
    }
    const record = {
        id: `advice_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        advice,
        context: topic,
        topic,
        userReaction: reaction,
        timestamp: new Date(),
        waitUntil: reaction === 'defensive' || reaction === 'overwhelmed' ? 'they_bring_it_up' : 'milestone',
        canRetryAfter: reaction === 'dismissed'
            ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 2 weeks
            : undefined,
    };
    records.push(record);
    // Keep last 20 records
    if (records.length > 20) {
        records.shift();
    }
    log.info({ userId, topic, reaction }, '📝 Recorded premature advice');
}
/**
 * Check if we should avoid giving advice about a topic.
 */
export function shouldAvoidAdviceAbout(userId, topic) {
    const records = prematureAdviceRecords.get(userId);
    if (!records)
        return { shouldAvoid: false };
    const lowerTopic = topic.toLowerCase();
    const relevantRecord = records.find((r) => r.topic.toLowerCase().includes(lowerTopic) || lowerTopic.includes(r.topic.toLowerCase()));
    if (!relevantRecord)
        return { shouldAvoid: false };
    // Check if waiting period has passed
    if (relevantRecord.canRetryAfter && new Date() > relevantRecord.canRetryAfter) {
        return { shouldAvoid: false };
    }
    // Still need to wait
    return {
        shouldAvoid: true,
        reason: `Advice about "${relevantRecord.topic}" wasn't welcome last time (${relevantRecord.userReaction})`,
        waitUntil: relevantRecord.waitUntil,
    };
}
/**
 * Get all premature advice records for context.
 */
export function getPrematureAdviceRecords(userId) {
    return prematureAdviceRecords.get(userId) || [];
}
/**
 * Detect signs that a boundary may be softening.
 */
export function detectBoundarySoftening(userId, topic, indicator) {
    const profile = boundaryProfiles.get(userId);
    if (!profile)
        return null;
    const lowerTopic = topic.toLowerCase();
    const boundary = profile.boundaries.find((b) => b.topic.toLowerCase() === lowerTopic || b.relatedTerms.some((t) => lowerTopic.includes(t)));
    if (!boundary)
        return null;
    let softenings = boundarySoftenings.get(userId);
    if (!softenings) {
        softenings = [];
        boundarySoftenings.set(userId, softenings);
    }
    let softening = softenings.find((s) => s.boundaryId === boundary.id);
    if (!softening) {
        softening = {
            boundaryId: boundary.id,
            topic: boundary.topic,
            signs: [],
            readyToReapproach: false,
        };
        softenings.push(softening);
    }
    // Add this sign
    softening.signs.push({
        timestamp: new Date(),
        indicator,
        confidenceOfSoftening: 0.3, // Base confidence per sign
    });
    // Calculate if ready to reapproach (3+ signs = ready)
    if (softening.signs.length >= 3) {
        softening.readyToReapproach = true;
        softening.suggestedApproach =
            `They've shown signs of being more open to discussing ${boundary.topic}. ` +
                `If relevant, you might gently check if they want to revisit this.`;
    }
    log.debug({ userId, topic, signCount: softening.signs.length }, 'Boundary softening detected');
    return softening;
}
/**
 * Check if a boundary is showing signs of softening.
 */
export function getBoundarySoftening(userId, topic) {
    const softenings = boundarySoftenings.get(userId);
    if (!softenings)
        return null;
    const lowerTopic = topic.toLowerCase();
    return (softenings.find((s) => s.topic.toLowerCase() === lowerTopic || lowerTopic.includes(s.topic.toLowerCase())) || null);
}
/**
 * Build protective memory context for LLM injection.
 */
export function buildProtectiveMemoryContext(userId) {
    const sections = ['[PROTECTIVE MEMORY]'];
    // Get boundaries
    const boundaries = getActiveBoundaries(userId);
    if (boundaries.length > 0) {
        sections.push('Topics to avoid:');
        for (const boundary of boundaries.filter((b) => !b.userReopened).slice(0, 5)) {
            const strength = boundary.strength === 'absolute' ? '🚫' : boundary.strength === 'strong' ? '⚠️' : '💡';
            sections.push(`${strength} ${boundary.topic} (${boundary.type})`);
        }
        sections.push('');
    }
    // Get premature advice records
    const adviceRecords = getPrematureAdviceRecords(userId);
    const activeAdviceWarnings = adviceRecords.filter((r) => r.waitUntil !== 'never' && (!r.canRetryAfter || new Date() < r.canRetryAfter));
    if (activeAdviceWarnings.length > 0) {
        sections.push('Advice to hold back on:');
        for (const record of activeAdviceWarnings.slice(0, 3)) {
            sections.push(`- ${record.topic}: Wait until ${record.waitUntil.replace(/_/g, ' ')}`);
        }
        sections.push('');
    }
    // Get boundary softenings
    const softenings = boundarySoftenings.get(userId) || [];
    const readyToReapproach = softenings.filter((s) => s.readyToReapproach);
    if (readyToReapproach.length > 0) {
        sections.push('Topics that may be reopening:');
        for (const softening of readyToReapproach) {
            sections.push(`- ${softening.topic}: ${softening.suggestedApproach}`);
        }
    }
    if (sections.length === 1) {
        return ''; // No protective memory to share
    }
    sections.push('');
    sections.push('Your friend forgets what not to bring up. You remember forever.');
    return sections.join('\n');
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    // Original exports
    detectNewBoundary,
    checkBoundary,
    isTopicOffLimits,
    getActiveBoundaries,
    recordUserReopened,
    recordBoundaryRespect,
    updateProbingTolerance,
    getProbingDepth,
    exportBoundaries,
    importBoundaries,
    // Protective Memory enhancements
    recordPrematureAdvice,
    shouldAvoidAdviceAbout,
    getPrematureAdviceRecords,
    detectBoundarySoftening,
    getBoundarySoftening,
    buildProtectiveMemoryContext,
};
//# sourceMappingURL=boundary-memory.js.map