/**
 * Fast Conditional Builder Loading
 *
 * PERFORMANCE OPTIMIZATION: Aggressively filter context builders to minimize
 * per-turn processing time. This module provides faster category detection
 * and cached decisions.
 *
 * Key optimizations:
 * 1. Fast-path detection for common scenarios
 * 2. Cached decisions within a turn
 * 3. Tiered builder execution (core → conditional → optional)
 * 4. Skip expensive builders when not needed
 *
 * @module intelligence/context-builders/fast-conditional-loading
 */
import { createLogger } from '../../utils/safe-logger.js';
import { BuilderCategory as BC, getBuilderCategory } from './core/categories.js';
import { DISTRESS } from '../distress-levels.js';
const log = createLogger({ module: 'FastConditionalLoading' });
// ============================================================================
// TIER DEFINITIONS
// ============================================================================
/**
 * MINIMAL tier - Only essential builders (crisis, safety, basic context)
 * Use when: User is in distress and needs focused support
 */
const MINIMAL_TIER_CATEGORIES = [BC.SAFETY, BC.EMOTIONAL, BC.CONTEXT];
/**
 * STANDARD tier - Core builders for most conversations
 * Use when: Normal conversation flow
 */
const STANDARD_TIER_CATEGORIES = [
    BC.SAFETY,
    BC.EMOTIONAL,
    BC.CONTEXT,
    BC.MEMORY,
    BC.PERSONA,
    BC.HUMANIZING,
];
/**
 * FULL tier - All categories (legacy behavior)
 * Use when: Complex scenario requiring all capabilities
 */
const FULL_TIER_CATEGORIES = Object.values(BC);
// ============================================================================
// FAST DETECTION FUNCTIONS
// ============================================================================
/**
 * Fast-path: Detect if user is in crisis
 * Uses simple string matching for speed
 */
function isCrisisMode(analysis) {
    if (!analysis)
        return false;
    return ((analysis.emotion.distressLevel ?? 0) >= DISTRESS.HIGH ||
        Boolean(analysis.emotion.needsSupport && (analysis.emotion.distressLevel ?? 0) >= DISTRESS.MODERATE));
}
/**
 * Fast-path: Detect if this is a greeting/simple turn
 * Greetings don't need coaching, cognitive, etc.
 */
function isSimpleGreeting(input) {
    const text = input.userText?.toLowerCase() || '';
    const turnCount = input.userData?.turnCount || 1;
    // First turn + short message = likely greeting
    if (turnCount === 1 && text.length < 50) {
        const greetingPatterns = ['hi', 'hello', 'hey', 'good morning', 'good afternoon'];
        return greetingPatterns.some((p) => text.includes(p));
    }
    return false;
}
/**
 * Fast-path: Detect if user is seeking specific help
 */
function isSeekingAdvice(analysis) {
    if (!analysis)
        return false;
    return (analysis.intent?.primary === 'seeking_advice' ||
        analysis.intent?.requiresAction ||
        analysis.state?.phase === 'advising');
}
/**
 * Fast-path: Detect if music/engagement is relevant
 */
function isEngagementRelevant(input) {
    const text = input.userText?.toLowerCase() || '';
    const topics = input.analysis?.topics?.detected || [];
    const engagementKeywords = ['music', 'song', 'play', 'game', 'story', 'celebrate', 'fun'];
    return (engagementKeywords.some((k) => text.includes(k)) ||
        topics.some((t) => engagementKeywords.includes(t.toLowerCase())));
}
/**
 * Fast-path: Detect if team/handoff is relevant
 *
 * PROACTIVE CROSS-PERSONA: Now also triggers for topics where other personas
 * have relevant insights, enabling the "six minds working together" promise.
 */
function isTeamRelevant(input) {
    const text = input.userText?.toLowerCase() || '';
    const topics = input.analysis?.topics?.detected || [];
    const turnCount = input.userData?.turnCount || 1;
    // Explicit handoff requests
    if (text.includes('talk to') ||
        text.includes('switch to') ||
        text.includes('peter') ||
        text.includes('maya') ||
        text.includes('alex') ||
        text.includes('jordan') ||
        text.includes('nayan') ||
        input.analysis?.intent?.primary === 'handoff_request') {
        return true;
    }
    // PROACTIVE: Topics where cross-persona insights are valuable
    // Peter's domain: finance, stocks, money, investing, budget
    // Maya's domain: habits, routines, productivity, self-care, wellness
    // Jordan's domain: goals, milestones, planning, career, future
    // Alex's domain: relationships, communication, calendar, meetings
    // Nayan's domain: meaning, purpose, values, life, wisdom
    const crossDomainTopics = [
        // Peter-relevant
        'money',
        'budget',
        'spending',
        'savings',
        'invest',
        'financial',
        'stock',
        // Maya-relevant
        'habit',
        'routine',
        'productivity',
        'exercise',
        'sleep',
        'wellness',
        'health',
        // Jordan-relevant
        'goal',
        'plan',
        'career',
        'future',
        'milestone',
        'dream',
        'aspiration',
        // Alex-relevant
        'relationship',
        'friend',
        'family',
        'meeting',
        'schedule',
        'calendar',
        'communicate',
        // Nayan-relevant
        'meaning',
        'purpose',
        'value',
        'life',
        'wisdom',
        'philosophy',
        'spiritual',
    ];
    const hasRelevantTopic = crossDomainTopics.some((topic) => text.includes(topic) || topics.some((t) => t.toLowerCase().includes(topic)));
    // PROACTIVE: Load team insights periodically every 5 turns
    // This allows personas to proactively share relevant insights
    const periodicTeamCheck = turnCount > 0 && turnCount % 5 === 0;
    return hasRelevantTopic || periodicTeamCheck;
}
// ============================================================================
// MAIN FAST LOADING FUNCTION
// ============================================================================
/**
 * Determine active categories using fast-path detection
 *
 * This is optimized for speed:
 * 1. First, determine tier (minimal/standard/full)
 * 2. Then, add/remove specific categories based on context
 */
export function fastDetermineActiveCategories(input) {
    const turnCount = input.userData?.turnCount || 1;
    const analysis = input.analysis;
    // =========================================================================
    // FAST-PATH: CRISIS MODE - Minimal tier
    // =========================================================================
    if (isCrisisMode(analysis)) {
        return {
            categories: MINIMAL_TIER_CATEGORIES,
            tier: 'minimal',
            reason: 'crisis_detected',
            skippedCategories: FULL_TIER_CATEGORIES.filter((c) => !MINIMAL_TIER_CATEGORIES.includes(c)),
            estimatedBuilderCount: 8,
        };
    }
    // =========================================================================
    // FAST-PATH: SIMPLE GREETING - Minimal tier
    // =========================================================================
    if (isSimpleGreeting(input)) {
        const greetingCategories = [...MINIMAL_TIER_CATEGORIES, BC.MEMORY, BC.PERSONA];
        return {
            categories: greetingCategories,
            tier: 'minimal',
            reason: 'simple_greeting',
            skippedCategories: FULL_TIER_CATEGORIES.filter((c) => !greetingCategories.includes(c)),
            estimatedBuilderCount: 12,
        };
    }
    // =========================================================================
    // STANDARD TIER - Most turns
    // =========================================================================
    const categories = new Set(STANDARD_TIER_CATEGORIES);
    // Add VOICE if we have voice emotion data
    if (input.voiceEmotion && input.voiceEmotion.confidence > 0.3) {
        categories.add(BC.VOICE);
    }
    // Add COACHING if seeking advice
    if (isSeekingAdvice(analysis)) {
        categories.add(BC.COACHING);
        categories.add(BC.COGNITIVE);
    }
    // Add ENGAGEMENT if relevant
    if (isEngagementRelevant(input)) {
        categories.add(BC.ENGAGEMENT);
    }
    // Add TEAM if relevant
    if (isTeamRelevant(input)) {
        categories.add(BC.TEAM);
    }
    // Add EXTERNAL periodically (every 10 turns)
    if (turnCount % 10 === 0) {
        categories.add(BC.EXTERNAL);
    }
    // Add LEARNING periodically (every 15 turns)
    if (turnCount % 15 === 0) {
        categories.add(BC.LEARNING);
    }
    const activeCategories = Array.from(categories);
    const isFullTier = activeCategories.length > STANDARD_TIER_CATEGORIES.length + 2;
    return {
        categories: activeCategories,
        tier: isFullTier ? 'full' : 'standard',
        reason: isFullTier ? 'complex_scenario' : 'normal_conversation',
        skippedCategories: FULL_TIER_CATEGORIES.filter((c) => !categories.has(c)),
        estimatedBuilderCount: activeCategories.length * 4, // ~4 builders per category average
    };
}
// ============================================================================
// METRICS TRACKING
// ============================================================================
const metrics = {
    totalDecisions: 0,
    minimalTierCount: 0,
    standardTierCount: 0,
    fullTierCount: 0,
    avgCategoriesPerTurn: 0,
    avgBuildersPerTurn: 0,
};
const categoryCounts = [];
const builderCounts = [];
/**
 * Record a loading decision for metrics
 */
export function recordLoadingDecision(result) {
    metrics.totalDecisions++;
    switch (result.tier) {
        case 'minimal':
            metrics.minimalTierCount++;
            break;
        case 'standard':
            metrics.standardTierCount++;
            break;
        case 'full':
            metrics.fullTierCount++;
            break;
    }
    categoryCounts.push(result.categories.length);
    builderCounts.push(result.estimatedBuilderCount);
    // Keep only last 100 samples
    if (categoryCounts.length > 100)
        categoryCounts.shift();
    if (builderCounts.length > 100)
        builderCounts.shift();
    // Update averages
    metrics.avgCategoriesPerTurn = categoryCounts.reduce((a, b) => a + b, 0) / categoryCounts.length;
    metrics.avgBuildersPerTurn = builderCounts.reduce((a, b) => a + b, 0) / builderCounts.length;
}
/**
 * Get fast loading metrics
 */
export function getFastLoadingMetrics() {
    return { ...metrics };
}
// ============================================================================
// BUILDER FILTERING
// ============================================================================
/**
 * Filter builders by active categories (optimized)
 *
 * Uses a pre-built category lookup for O(1) category checking
 */
export function fastFilterBuilders(builders, activeCategories) {
    const categorySet = new Set(activeCategories);
    return builders.filter((builder) => {
        // Use builder's category if defined, otherwise look up by name
        const category = builder.category || getBuilderCategory(builder.name);
        return categorySet.has(category);
    });
}
// ============================================================================
// INTEGRATION WITH EXISTING SYSTEM
// ============================================================================
/**
 * Drop-in replacement for determineActiveCategories with metrics tracking
 */
export function determineActiveCategoriesFast(input) {
    const result = fastDetermineActiveCategories(input);
    recordLoadingDecision(result);
    log.debug({
        tier: result.tier,
        categories: result.categories.length,
        skipped: result.skippedCategories.length,
        reason: result.reason,
    }, 'Fast conditional loading decision');
    return result.categories;
}
// ============================================================================
// EXPORTS
// ============================================================================
export default {
    fastDetermineActiveCategories,
    determineActiveCategoriesFast,
    fastFilterBuilders,
    recordLoadingDecision,
    getFastLoadingMetrics,
    MINIMAL_TIER_CATEGORIES,
    STANDARD_TIER_CATEGORIES,
    FULL_TIER_CATEGORIES,
};
//# sourceMappingURL=fast-conditional-loading.js.map