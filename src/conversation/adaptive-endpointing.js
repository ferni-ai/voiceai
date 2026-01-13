/**
 * Adaptive Endpointing System
 *
 * Phase 23: Context-aware pause detection that adapts to:
 * - Topic weight (heavy topics = more thinking time)
 * - User speaking rhythm (fast/slow speakers)
 * - Sentence completeness (finished thought or still forming?)
 * - Emotional state (distress = more space)
 *
 * PROBLEM: Fixed 400-1200ms endpointing doesn't account for:
 * - Thinking pauses (user is formulating, not done)
 * - Topic complexity (heavy topics need more silence)
 * - User's natural speaking rhythm
 *
 * RESEARCH BASIS:
 * - Conversation analysis: Turn-taking is context-dependent
 * - Therapy research: Silence after heavy content is therapeutic
 * - UX research: Premature interruption frustrates users
 *
 * @module AdaptiveEndpointing
 */
import { getLogger } from '../utils/safe-logger.js';
// 🦀 Rust-accelerated word counting
import { countWordsRust, isTokenCountingAvailable } from '../memory/rust-accelerator.js';
import { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';
const log = getLogger().child({ module: 'adaptive-endpointing' });
// Check Rust availability at module load
const RUST_COUNTING_AVAILABLE = isTokenCountingAvailable();
// ============================================================================
// CONSTANTS
// ============================================================================
/** Base endpointing delays in milliseconds - TIGHTENED Jan 2026 */
const BASE_DELAYS = {
    min: 200, // Was 400ms - human turn gaps are 200-400ms
    max: 500, // Was 1200ms - don't wait too long
};
/** Adjustments for different contexts - REDUCED for snappier turns */
const ADJUSTMENTS = {
    // Topic weight - reduced by ~50%
    heavyTopic: { minAdd: 150, maxAdd: 300 }, // Was 300/600
    mediumTopic: { minAdd: 50, maxAdd: 100 }, // Was 100/200
    // Sentence completeness - reduced significantly
    incompleteThought: { minAdd: 150, maxAdd: 300 }, // Was 400/700
    partialThought: { minAdd: 100, maxAdd: 200 }, // Was 200/400
    // Emotional intensity - reduced
    highEmotion: { minAdd: 100, maxAdd: 200 }, // Was 200/400
    crisisLevel: { minAdd: 200, maxAdd: 400 }, // Was 400/800
    // Speaking rate
    slowSpeaker: { minAdd: 100, maxAdd: 150 }, // Was 200/300
    fastSpeaker: { minSub: 100, maxSub: 150 }, // Keep same
    // Conversation phase - reduced
    supporting: { minAdd: 75, maxAdd: 150 }, // Was 150/300
    // Utterance type - reduced
    incompleteUtterance: { minAdd: 150, maxAdd: 250 }, // Was 300/500
};
/** Signals that suggest incomplete thought */
const INCOMPLETE_SIGNALS = [
    /\b(and|but|so|because|like|um|uh|well|I mean)\s*$/i,
    /,\s*$/,
    /\.\.\.\s*$/,
    /^(I think|I feel|I guess|Maybe|Perhaps|I wonder)/i,
];
// ============================================================================
// STORAGE
// ============================================================================
const userProfiles = new Map();
// ============================================================================
// CORE FUNCTIONS
// ============================================================================
/**
 * Calculate optimal endpointing delays for current context.
 */
export function calculateEndpointingDelay(context, userId) {
    let minDelay = BASE_DELAYS.min;
    let maxDelay = BASE_DELAYS.max;
    const reasoning = [];
    // =========================================================================
    // TOPIC WEIGHT
    // =========================================================================
    if (context.topicWeight === 'heavy') {
        minDelay += ADJUSTMENTS.heavyTopic.minAdd;
        maxDelay += ADJUSTMENTS.heavyTopic.maxAdd;
        reasoning.push('Heavy topic: +300ms min, +600ms max');
    }
    else if (context.topicWeight === 'medium') {
        minDelay += ADJUSTMENTS.mediumTopic.minAdd;
        maxDelay += ADJUSTMENTS.mediumTopic.maxAdd;
        reasoning.push('Medium topic: +100ms min, +200ms max');
    }
    // =========================================================================
    // SENTENCE COMPLETENESS
    // =========================================================================
    if (context.sentenceCompleteness < 0.3) {
        minDelay += ADJUSTMENTS.incompleteThought.minAdd;
        maxDelay += ADJUSTMENTS.incompleteThought.maxAdd;
        reasoning.push('Incomplete thought: +400ms min, +700ms max');
    }
    else if (context.sentenceCompleteness < 0.6) {
        minDelay += ADJUSTMENTS.partialThought.minAdd;
        maxDelay += ADJUSTMENTS.partialThought.maxAdd;
        reasoning.push('Partial thought: +200ms min, +400ms max');
    }
    // =========================================================================
    // EMOTIONAL INTENSITY
    // =========================================================================
    if (context.emotionalIntensity > 0.8) {
        minDelay += ADJUSTMENTS.crisisLevel.minAdd;
        maxDelay += ADJUSTMENTS.crisisLevel.maxAdd;
        reasoning.push('Crisis-level emotion: +400ms min, +800ms max');
    }
    else if (context.emotionalIntensity > 0.6) {
        minDelay += ADJUSTMENTS.highEmotion.minAdd;
        maxDelay += ADJUSTMENTS.highEmotion.maxAdd;
        reasoning.push('High emotion: +200ms min, +400ms max');
    }
    // =========================================================================
    // USER SPEAKING RATE
    // =========================================================================
    const profile = userId ? userProfiles.get(userId) : undefined;
    const speakingRate = context.userSpeakingRate ?? profile?.averageWpm ?? 130;
    if (speakingRate < 100) {
        minDelay += ADJUSTMENTS.slowSpeaker.minAdd;
        maxDelay += ADJUSTMENTS.slowSpeaker.maxAdd;
        reasoning.push(`Slow speaker (${speakingRate} WPM): +200ms min, +300ms max`);
    }
    else if (speakingRate > 160) {
        minDelay -= ADJUSTMENTS.fastSpeaker.minSub;
        maxDelay -= ADJUSTMENTS.fastSpeaker.maxSub;
        reasoning.push(`Fast speaker (${speakingRate} WPM): -100ms min, -150ms max`);
    }
    // =========================================================================
    // CONVERSATION PHASE
    // =========================================================================
    if (context.conversationPhase === 'supporting') {
        minDelay += ADJUSTMENTS.supporting.minAdd;
        maxDelay += ADJUSTMENTS.supporting.maxAdd;
        reasoning.push('Supporting phase: +150ms min, +300ms max');
    }
    // =========================================================================
    // UTTERANCE TYPE
    // =========================================================================
    if (context.utteranceType === 'incomplete') {
        minDelay += ADJUSTMENTS.incompleteUtterance.minAdd;
        maxDelay += ADJUSTMENTS.incompleteUtterance.maxAdd;
        reasoning.push('Incomplete utterance: +300ms min, +500ms max');
    }
    // =========================================================================
    // HEAVY CONTENT DETECTION
    // =========================================================================
    if (context.heavyContentSignals && context.heavyContentSignals.length > 0) {
        const heavyCount = context.heavyContentSignals.length;
        const adjustment = Math.min(heavyCount * 100, 400);
        minDelay += adjustment;
        maxDelay += adjustment * 1.5;
        reasoning.push(`Heavy content signals (${heavyCount}): +${adjustment}ms`);
    }
    // =========================================================================
    // CLAMP VALUES
    // =========================================================================
    minDelay = Math.max(300, Math.min(minDelay, 1200)); // 300ms - 1200ms
    maxDelay = Math.max(minDelay + 200, Math.min(maxDelay, 3000)); // At least 200ms range, max 3s
    // Calculate confidence based on available context
    let confidence = 0.7;
    if (profile && profile.samples >= 10)
        confidence += 0.1;
    if (context.sentenceCompleteness !== undefined)
        confidence += 0.1;
    if (context.emotionalIntensity !== undefined)
        confidence += 0.05;
    confidence = Math.min(confidence, 0.95);
    log.debug({ minDelay, maxDelay, confidence, reasoning }, 'Calculated adaptive endpointing');
    return {
        minDelay,
        maxDelay,
        confidence,
        reasoning,
    };
}
// Re-export for backwards compatibility
export { detectHeavyContentKeywords as detectHeavyContent } from './utils/detection.js';
/**
 * Estimate sentence completeness from text.
 */
export function estimateSentenceCompleteness(text) {
    const trimmed = text.trim();
    // Empty or very short
    if (trimmed.length < 3)
        return 0;
    // Check for incomplete signals
    for (const pattern of INCOMPLETE_SIGNALS) {
        if (pattern.test(trimmed)) {
            return 0.3;
        }
    }
    // Check for sentence-ending punctuation
    if (/[.!?]$/.test(trimmed)) {
        return 0.9;
    }
    // Check for trailing comma or ellipsis
    if (/[,…]$/.test(trimmed)) {
        return 0.4;
    }
    // Basic heuristic: longer = more likely complete
    // 🦀 Use Rust for O(1) word counting when available
    const wordCount = RUST_COUNTING_AVAILABLE ? countWordsRust(trimmed) : trimmed.split(/\s+/).length;
    if (wordCount >= 10)
        return 0.7;
    if (wordCount >= 5)
        return 0.6;
    if (wordCount >= 3)
        return 0.5;
    return 0.4;
}
/**
 * Determine topic weight from context.
 */
export function determineTopicWeight(context) {
    const { topic, emotionalIntensity = 0.5, keywords = [] } = context;
    // High emotion = at least medium
    if (emotionalIntensity > 0.7) {
        return 'heavy';
    }
    // Check for heavy keywords
    const heavyKeywords = detectHeavyContent(keywords.join(' '));
    if (heavyKeywords.length > 0) {
        return 'heavy';
    }
    // Check topic
    const heavyTopics = [
        'death',
        'grief',
        'trauma',
        'abuse',
        'crisis',
        'divorce',
        'illness',
        'suicide',
        'depression',
    ];
    const mediumTopics = [
        'relationship',
        'conflict',
        'anxiety',
        'stress',
        'work',
        'money',
        'family',
        'health',
    ];
    if (topic) {
        const lowerTopic = topic.toLowerCase();
        if (heavyTopics.some((t) => lowerTopic.includes(t)))
            return 'heavy';
        if (mediumTopics.some((t) => lowerTopic.includes(t)))
            return 'medium';
    }
    if (emotionalIntensity > 0.5)
        return 'medium';
    return 'light';
}
/**
 * Update user speaking profile from observed data.
 */
export function updateUserProfile(userId, observation) {
    const { wordCount, durationMs, pauseMs } = observation;
    // Calculate WPM
    const wpm = (wordCount / durationMs) * 60000;
    // Get or create profile
    let profile = userProfiles.get(userId);
    if (!profile) {
        profile = {
            averageWpm: wpm,
            typicalPauseMs: pauseMs ?? 400,
            pauseVariability: 'consistent',
            samples: 0,
        };
        userProfiles.set(userId, profile);
    }
    // Update with exponential moving average
    const alpha = 0.2; // Weight for new observation
    profile.averageWpm = profile.averageWpm * (1 - alpha) + wpm * alpha;
    if (pauseMs !== undefined) {
        profile.typicalPauseMs = profile.typicalPauseMs * (1 - alpha) + pauseMs * alpha;
    }
    profile.samples++;
    log.debug({ userId, wpm: Math.round(profile.averageWpm), samples: profile.samples }, 'Updated user speaking profile');
}
/**
 * Get user speaking profile.
 */
export function getUserProfile(userId) {
    return userProfiles.get(userId) ?? null;
}
/**
 * Detect if user utterance is likely incomplete.
 */
export function isLikelyIncomplete(text) {
    const completeness = estimateSentenceCompleteness(text);
    return completeness < 0.5;
}
/**
 * Get endpointing recommendation for voice agent.
 */
export function getEndpointingRecommendation(text, context) {
    const heavyContent = detectHeavyContent(text);
    const completeness = estimateSentenceCompleteness(text);
    const topicWeight = determineTopicWeight({
        emotionalIntensity: context?.emotionalIntensity,
        keywords: text.split(/\s+/),
    });
    const fullContext = {
        topicWeight,
        sentenceCompleteness: completeness,
        emotionalIntensity: context?.emotionalIntensity ?? 0.5,
        conversationPhase: context?.conversationPhase ?? 'exploring',
        heavyContentSignals: heavyContent,
        ...context,
    };
    return calculateEndpointingDelay(fullContext);
}
// ============================================================================
// EXPORTS
// ============================================================================
export const adaptiveEndpointing = {
    calculate: calculateEndpointingDelay,
    detectHeavyContent,
    estimateCompleteness: estimateSentenceCompleteness,
    determineTopicWeight,
    updateProfile: updateUserProfile,
    getProfile: getUserProfile,
    isIncomplete: isLikelyIncomplete,
    getRecommendation: getEndpointingRecommendation,
};
export default adaptiveEndpointing;
//# sourceMappingURL=adaptive-endpointing.js.map