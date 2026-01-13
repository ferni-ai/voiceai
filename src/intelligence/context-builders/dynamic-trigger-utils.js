/**
 * Dynamic Trigger Utilities
 *
 * Shared utilities for checking proactive_triggers from behavior JSON files.
 * This powers the "Better than Human" dynamic behavior system across all context builders.
 *
 * Pattern: Define CONDITIONS for when to act, not just scripts of what to say.
 *
 * @module DynamicTriggerUtils
 */
import { createLogger } from '../../utils/safe-logger.js';
const log = createLogger({ module: 'DynamicTriggerUtils' });
const analytics = {
    totalTriggersChecked: 0,
    totalTriggersMatched: 0,
    totalTriggersFired: 0,
    byTriggerName: new Map(),
    byBuilderSource: new Map(),
    recentActivations: [],
};
const MAX_RECENT_ACTIVATIONS = 100;
/**
 * Record a trigger check for analytics
 */
export function recordTriggerCheck(builderSource) {
    analytics.totalTriggersChecked++;
    const builderStats = analytics.byBuilderSource.get(builderSource) || {
        checked: 0,
        matched: 0,
        fired: 0,
    };
    builderStats.checked++;
    analytics.byBuilderSource.set(builderSource, builderStats);
}
/**
 * Record a trigger match for analytics
 */
export function recordTriggerMatch(triggerName, builderSource, confidence, userId) {
    analytics.totalTriggersMatched++;
    // Update trigger stats
    const triggerStats = analytics.byTriggerName.get(triggerName) || {
        checked: 0,
        matched: 0,
        fired: 0,
    };
    triggerStats.matched++;
    analytics.byTriggerName.set(triggerName, triggerStats);
    // Update builder stats
    const builderStats = analytics.byBuilderSource.get(builderSource) || {
        checked: 0,
        matched: 0,
        fired: 0,
    };
    builderStats.matched++;
    analytics.byBuilderSource.set(builderSource, builderStats);
    // Add to recent activations
    analytics.recentActivations.unshift({
        triggerName,
        builderSource,
        confidence,
        timestamp: new Date(),
        userId,
        fired: false, // Will be updated if actually fired
    });
    // Trim to max size
    if (analytics.recentActivations.length > MAX_RECENT_ACTIVATIONS) {
        analytics.recentActivations = analytics.recentActivations.slice(0, MAX_RECENT_ACTIVATIONS);
    }
}
/**
 * Record when a trigger actually fires (passed probability gate)
 */
export function recordTriggerFired(triggerName, builderSource) {
    analytics.totalTriggersFired++;
    // Update trigger stats
    const triggerStats = analytics.byTriggerName.get(triggerName) || {
        checked: 0,
        matched: 0,
        fired: 0,
    };
    triggerStats.fired++;
    analytics.byTriggerName.set(triggerName, triggerStats);
    // Update builder stats
    const builderStats = analytics.byBuilderSource.get(builderSource) || {
        checked: 0,
        matched: 0,
        fired: 0,
    };
    builderStats.fired++;
    analytics.byBuilderSource.set(builderSource, builderStats);
    // Update most recent matching activation to show it fired
    const recentMatch = analytics.recentActivations.find((a) => a.triggerName === triggerName && a.builderSource === builderSource && !a.fired);
    if (recentMatch) {
        recentMatch.fired = true;
    }
    log.debug({ triggerName, builderSource }, '🎯 Trigger fired');
}
/**
 * Get analytics summary for debug panel
 */
export function getTriggerAnalytics() {
    const summary = {
        totalChecked: analytics.totalTriggersChecked,
        totalMatched: analytics.totalTriggersMatched,
        totalFired: analytics.totalTriggersFired,
        matchRate: analytics.totalTriggersChecked > 0
            ? analytics.totalTriggersMatched / analytics.totalTriggersChecked
            : 0,
        fireRate: analytics.totalTriggersMatched > 0
            ? analytics.totalTriggersFired / analytics.totalTriggersMatched
            : 0,
    };
    const byTrigger = Array.from(analytics.byTriggerName.entries())
        .map(([name, stats]) => ({
        name,
        ...stats,
        fireRate: stats.matched > 0 ? stats.fired / stats.matched : 0,
    }))
        .sort((a, b) => b.fired - a.fired);
    const byBuilder = Array.from(analytics.byBuilderSource.entries())
        .map(([name, stats]) => ({
        name,
        ...stats,
        fireRate: stats.matched > 0 ? stats.fired / stats.matched : 0,
    }))
        .sort((a, b) => b.fired - a.fired);
    return {
        summary,
        byTrigger,
        byBuilder,
        recentActivations: analytics.recentActivations.slice(0, 20), // Last 20
    };
}
/**
 * Reset analytics (for testing)
 */
export function resetTriggerAnalytics() {
    analytics.totalTriggersChecked = 0;
    analytics.totalTriggersMatched = 0;
    analytics.totalTriggersFired = 0;
    analytics.byTriggerName.clear();
    analytics.byBuilderSource.clear();
    analytics.recentActivations = [];
}
// ============================================================================
// KEYWORD DETECTION HELPERS
// ============================================================================
const EMOTION_KEYWORDS = {
    distress: ['anxious', 'stressed', 'overwhelmed', 'panicked', 'crisis'],
    sad: ['sad', 'depressed', 'down', 'heavy', 'grief', 'mourning'],
    worried: ['worried', 'concerned', 'nervous', 'afraid', 'scared'],
    tired: ['tired', 'exhausted', 'drained', 'depleted', 'burnt out'],
    frustrated: ['frustrated', 'angry', 'irritated', 'annoyed'],
    positive: ['happy', 'excited', 'hopeful', 'grateful', 'peaceful'],
};
const TEXT_PATTERNS = {
    falseFine: [/i['']?m fine/i, /i['']?m okay/i, /it['']?s fine/i, /i['']?m good/i, /no big deal/i],
    deflection: [
        /anyway/i,
        /let['']?s move on/i,
        /never ?mind/i,
        /forget (it|i said)/i,
        /but enough about/i,
    ],
    avoidance: [
        /i don['']?t (want to|wanna) talk about/i,
        /can we (change|talk about something)/i,
        /let['']?s not go there/i,
    ],
    meaning: [
        /what['']?s the point/i,
        /why bother/i,
        /is this all there is/i,
        /what does it matter/i,
    ],
    comparison: [/everyone else/i, /other people/i, /i should be/i, /why can['']?t i/i],
    selfCriticism: [
        /i should have/i,
        /i shouldn['']?t have/i,
        /what['']?s wrong with me/i,
        /i['']?m so (stupid|dumb|bad)/i,
    ],
    permission: [/can i (tell|say|ask)/i, /is it okay (if|to)/i, /would you mind/i],
    sleep: [
        /can['']?t sleep/i,
        /couldn['']?t sleep/i,
        /insomnia/i,
        /up all night/i,
        /3 ?am/i,
        /2 ?am/i,
    ],
    work: [/email/i, /boss/i, /meeting/i, /deadline/i, /presentation/i, /work/i],
    relationship: [/text/i, /respond/i, /friend/i, /family/i, /relationship/i, /conversation/i],
    habit: [/habit/i, /routine/i, /streak/i, /missed/i, /skipped/i, /consistency/i],
    planning: [/milestone/i, /goal/i, /plan/i, /decision/i, /transition/i, /change/i],
    financial: [/market/i, /portfolio/i, /stock/i, /invest/i, /money/i, /retire/i],
    grief: [/miss/i, /lost/i, /gone/i, /anniversary/i, /passed/i, /died/i],
};
// ============================================================================
// TRIGGER MATCHING
// ============================================================================
/**
 * Check if a specific text pattern is present
 */
function matchesTextPattern(text, patternKey) {
    const patterns = TEXT_PATTERNS[patternKey];
    return patterns?.some((pattern) => pattern.test(text)) ?? false;
}
/**
 * Check if emotion matches a category
 */
function matchesEmotionCategory(emotion, category) {
    if (!emotion)
        return false;
    const emotions = EMOTION_KEYWORDS[category];
    return emotions?.includes(emotion.toLowerCase()) ?? false;
}
/**
 * Main trigger checking function
 * Matches proactive_triggers conditions against current context
 */
export function checkDynamicTriggers(triggers, context) {
    if (!triggers)
        return null;
    const lowerText = (context.userText ?? '').toLowerCase();
    const matches = [];
    for (const [name, trigger] of Object.entries(triggers)) {
        // Skip internal notes
        if (name === '_note')
            continue;
        const triggerLower = trigger.trigger.toLowerCase();
        let matched = false;
        let confidence = 0.5;
        // === EMOTIONAL TRIGGERS ===
        // Distress/crisis detection
        if (triggerLower.includes('distress') || triggerLower.includes('crisis')) {
            if (matchesEmotionCategory(context.emotion, 'distress')) {
                matched = true;
                confidence = context.emotionIntensity ?? 0.7;
            }
        }
        // Voice/text contradiction (false fine)
        if (triggerLower.includes('contradict') ||
            triggerLower.includes('false') ||
            triggerLower.includes('fine')) {
            if (matchesTextPattern(lowerText, 'falseFine') &&
                matchesEmotionCategory(context.emotion, 'sad')) {
                matched = true;
                confidence = 0.85;
            }
        }
        // Sadness/grief
        if (triggerLower.includes('grief') ||
            triggerLower.includes('loss') ||
            triggerLower.includes('sad')) {
            if (matchesEmotionCategory(context.emotion, 'sad') ||
                matchesTextPattern(lowerText, 'grief')) {
                matched = true;
                confidence = context.emotionIntensity ?? 0.6;
            }
        }
        // Worry/anxiety
        if (triggerLower.includes('worr') || triggerLower.includes('anxi')) {
            if (matchesEmotionCategory(context.emotion, 'worried')) {
                matched = true;
                confidence = context.emotionIntensity ?? 0.6;
            }
        }
        // === TEXT PATTERN TRIGGERS ===
        // Deflection
        if (triggerLower.includes('deflect') ||
            triggerLower.includes('pivot') ||
            triggerLower.includes('topic')) {
            if (matchesTextPattern(lowerText, 'deflection')) {
                matched = true;
                confidence = 0.7;
            }
        }
        // Avoidance
        if (triggerLower.includes('avoid')) {
            if (matchesTextPattern(lowerText, 'avoidance')) {
                matched = true;
                confidence = 0.75;
            }
        }
        // Meaning/existential questions
        if (triggerLower.includes('meaning') ||
            triggerLower.includes('point') ||
            triggerLower.includes('existential')) {
            if (matchesTextPattern(lowerText, 'meaning')) {
                matched = true;
                confidence = 0.8;
            }
        }
        // Self-criticism/should language
        if (triggerLower.includes('should') ||
            triggerLower.includes('self-criticism') ||
            triggerLower.includes('critic')) {
            if (matchesTextPattern(lowerText, 'selfCriticism')) {
                matched = true;
                confidence = 0.7;
            }
        }
        // Comparison
        if (triggerLower.includes('comparison') || triggerLower.includes('others')) {
            if (matchesTextPattern(lowerText, 'comparison')) {
                matched = true;
                confidence = 0.65;
            }
        }
        // Permission seeking
        if (triggerLower.includes('permission')) {
            if (matchesTextPattern(lowerText, 'permission')) {
                matched = true;
                confidence = 0.6;
            }
        }
        // Minimizing
        if (triggerLower.includes('minimiz') || triggerLower.includes('not that bad')) {
            if (lowerText.includes('not that bad') || lowerText.includes('not a big deal')) {
                matched = true;
                confidence = 0.7;
            }
        }
        // === CONTEXTUAL TRIGGERS ===
        // Late night specific
        if (triggerLower.includes('late night') ||
            triggerLower.includes('2am') ||
            triggerLower.includes('midnight')) {
            if (context.isLateNight) {
                matched = true;
                confidence = 0.6;
            }
        }
        // Can't sleep
        if (triggerLower.includes('sleep') || triggerLower.includes('insomnia')) {
            if (matchesTextPattern(lowerText, 'sleep')) {
                matched = true;
                confidence = 0.75;
            }
        }
        // Work anxiety
        if (triggerLower.includes('work') ||
            triggerLower.includes('email') ||
            triggerLower.includes('meeting')) {
            if (matchesTextPattern(lowerText, 'work') && context.isLateNight) {
                matched = true;
                confidence = 0.7;
            }
        }
        // Relationship replay
        if (triggerLower.includes('relationship') ||
            triggerLower.includes('conversation') ||
            triggerLower.includes('replay')) {
            if (matchesTextPattern(lowerText, 'relationship')) {
                matched = true;
                confidence = 0.65;
            }
        }
        // === DOMAIN-SPECIFIC TRIGGERS ===
        // Habit-related
        if (triggerLower.includes('habit') ||
            triggerLower.includes('streak') ||
            triggerLower.includes('routine')) {
            if (matchesTextPattern(lowerText, 'habit')) {
                matched = true;
                confidence = 0.7;
            }
        }
        // Planning/milestone
        if (triggerLower.includes('milestone') ||
            triggerLower.includes('planning') ||
            triggerLower.includes('transition')) {
            if (matchesTextPattern(lowerText, 'planning')) {
                matched = true;
                confidence = 0.65;
            }
        }
        // Financial/market
        if (triggerLower.includes('market') ||
            triggerLower.includes('portfolio') ||
            triggerLower.includes('financial')) {
            if (matchesTextPattern(lowerText, 'financial')) {
                matched = true;
                confidence = 0.7;
            }
        }
        // === TIME-BASED TRIGGERS ===
        // Extended silence/returning user
        if (triggerLower.includes('silence') ||
            triggerLower.includes('returning') ||
            triggerLower.includes('absence')) {
            if (context.daysSinceLastSession && context.daysSinceLastSession > 7) {
                matched = true;
                confidence = 0.6;
            }
        }
        // Early turns
        if (triggerLower.includes('greeting') || triggerLower.includes('opening')) {
            if ((context.turnCount ?? 0) <= 2) {
                matched = true;
                confidence = 0.5;
            }
        }
        // Voice exhaustion (check emotion + intensity)
        if (triggerLower.includes('exhaustion') ||
            triggerLower.includes('fatigue') ||
            triggerLower.includes('tired')) {
            if (matchesEmotionCategory(context.emotion, 'tired') &&
                (context.emotionIntensity ?? 0) > 0.5) {
                matched = true;
                confidence = context.emotionIntensity ?? 0.6;
            }
        }
        // Growth moment
        if (triggerLower.includes('growth') ||
            triggerLower.includes('different') ||
            triggerLower.includes('changed')) {
            // Growth moments are harder to detect from text alone
            // Usually need memory comparison - mark as low confidence
            if (lowerText.includes('i used to') || lowerText.includes('before i would')) {
                matched = true;
                confidence = 0.5;
            }
        }
        if (matched) {
            matches.push({
                triggerName: name,
                trigger: trigger.trigger,
                behavior: trigger.behavior,
                confidence,
            });
        }
    }
    // Return highest confidence match
    if (matches.length === 0)
        return null;
    const best = matches.sort((a, b) => b.confidence - a.confidence)[0];
    log.debug({ triggerName: best.triggerName, confidence: best.confidence, matchCount: matches.length }, 'Dynamic trigger matched');
    return best;
}
/**
 * Check "more_likely_when" conditions and return probability multiplier
 */
export function calculateProbabilityBoost(moreLikelyWhen, context, matchedTrigger) {
    if (!moreLikelyWhen)
        return 1.0;
    let multiplier = 1.0;
    for (const condition of moreLikelyWhen) {
        const conditionLower = condition.toLowerCase();
        // Emotional conditions
        if (conditionLower.includes('voice_text_mismatch') &&
            matchedTrigger?.triggerName.includes('false')) {
            multiplier *= 1.5;
        }
        if (conditionLower.includes('contradiction') &&
            matchedTrigger?.triggerName.includes('contradict')) {
            multiplier *= 1.4;
        }
        if (conditionLower.includes('distress') &&
            matchesEmotionCategory(context.emotion, 'distress')) {
            multiplier *= 1.3;
        }
        // Time-based conditions
        if (conditionLower.includes('late_night') && context.isLateNight) {
            multiplier *= 1.3;
        }
        if (conditionLower.includes('extended_silence') &&
            context.daysSinceLastSession &&
            context.daysSinceLastSession > 7) {
            multiplier *= 1.2;
        }
        if (conditionLower.includes('returning') &&
            context.daysSinceLastSession &&
            context.daysSinceLastSession > 3) {
            multiplier *= 1.2;
        }
        // Topic conditions
        if (conditionLower.includes('heavy_topic') && matchesEmotionCategory(context.emotion, 'sad')) {
            multiplier *= 1.3;
        }
        if (conditionLower.includes('growth_moment') &&
            matchedTrigger?.triggerName.includes('growth')) {
            multiplier *= 1.4;
        }
        // Domain-specific
        const userTextLower = (context.userText ?? '').toLowerCase();
        if (conditionLower.includes('habit') && matchesTextPattern(userTextLower, 'habit')) {
            multiplier *= 1.2;
        }
        if (conditionLower.includes('market') && matchesTextPattern(userTextLower, 'financial')) {
            multiplier *= 1.2;
        }
        if (conditionLower.includes('transition') && matchesTextPattern(userTextLower, 'planning')) {
            multiplier *= 1.2;
        }
        // If the matched trigger name matches a more_likely_when condition
        if (matchedTrigger && conditionLower.includes(matchedTrigger.triggerName.replace(/_/g, ' '))) {
            multiplier *= 1.3;
        }
    }
    return Math.min(multiplier, 2.5); // Cap at 2.5x
}
/**
 * Check "never_when" conditions - returns true if we should skip
 */
export function shouldSkipDueToNeverWhen(neverWhen, context) {
    if (!neverWhen)
        return false;
    for (const condition of neverWhen) {
        const conditionLower = condition.toLowerCase();
        if (conditionLower.includes('first') && (context.turnCount ?? 0) < 3) {
            return true;
        }
        if (conditionLower.includes('crisis') && matchesEmotionCategory(context.emotion, 'distress')) {
            // Don't skip for crisis - we actually want to help
            // But respect if persona says "user_in_acute_crisis"
            if (conditionLower.includes('acute')) {
                return true;
            }
        }
        if (conditionLower.includes('distressed') &&
            matchesEmotionCategory(context.emotion, 'distress')) {
            return true;
        }
        if (conditionLower.includes('practical') &&
            context.recentTopics?.some((t) => t.includes('help'))) {
            return true;
        }
        if (conditionLower.includes('energized') &&
            matchesEmotionCategory(context.emotion, 'positive')) {
            // Some contexts want to skip when user is energized
            if (context.isLateNight === false) {
                return true;
            }
        }
        if (conditionLower.includes('daytime') &&
            context.currentHour &&
            context.currentHour >= 6 &&
            context.currentHour < 22) {
            // Skip if it's daytime and condition says never during daytime
            return true;
        }
    }
    return false;
}
/**
 * Build a context object from ContextBuilderInput
 */
export function buildTriggerContext(userText, analysis, userData, additionalContext) {
    const hour = new Date().getHours();
    const isLateNight = hour >= 22 || hour < 5;
    let daysSinceLastSession;
    if (userData?.lastSessionDate) {
        const lastDate = new Date(userData.lastSessionDate);
        daysSinceLastSession = Math.floor((Date.now() - lastDate.getTime()) / (24 * 60 * 60 * 1000));
    }
    return {
        userText,
        emotion: analysis?.emotion?.primary,
        emotionIntensity: analysis?.emotion?.intensity,
        turnCount: userData?.turnCount ?? 0,
        relationshipStage: userData?.relationshipStage ?? 'stranger',
        isLateNight,
        recentTopics: userData?.recentTopics,
        daysSinceLastSession,
        currentHour: hour,
        ...additionalContext,
    };
}
// ============================================================================
// HYBRID MATCHING (PHASE 1: SEMANTIC CORE)
// ============================================================================
/**
 * Check triggers using hybrid semantic + pattern matching.
 * Falls back to pattern-only if semantic matching is unavailable.
 *
 * @param triggers - Proactive triggers from behavior JSON
 * @param context - Trigger context with user text, emotion, etc.
 * @param personaId - The persona ID for embedding lookup
 * @param options - Optional configuration
 * @returns The best matched trigger or null
 */
export async function checkTriggersHybrid(triggers, context, personaId, options = {}) {
    if (!triggers)
        return null;
    const { enableSemantic = true, semanticThreshold = 0.65, patternThreshold = 0.5 } = options;
    // Track analytics
    recordTriggerCheck('hybrid-matcher');
    // Try semantic matching if enabled
    if (enableSemantic) {
        try {
            // Dynamic import to avoid circular dependencies
            const { matchTriggersHybrid, recordSemanticMatch } = await import('../triggers/index.js');
            const result = await matchTriggersHybrid(context.userText ?? '', context, triggers, personaId, { semanticThreshold, patternThreshold });
            // Record for semantic analytics
            recordSemanticMatch(result);
            if (result.bestMatch) {
                // Convert to MatchedTrigger format
                const matched = {
                    triggerName: result.bestMatch.triggerName,
                    trigger: result.bestMatch.trigger,
                    behavior: result.bestMatch.behavior,
                    confidence: result.bestMatch.combinedScore,
                };
                recordTriggerMatch(matched.triggerName, 'hybrid-matcher', matched.confidence, context.userData?.userId);
                log.debug({
                    triggerName: matched.triggerName,
                    semanticScore: result.bestMatch.semanticScore.toFixed(3),
                    patternScore: result.bestMatch.patternScore.toFixed(3),
                    combined: result.bestMatch.combinedScore.toFixed(3),
                    strategy: result.matchingStrategy,
                    processingMs: result.processingTimeMs.toFixed(2),
                }, 'Hybrid trigger matched');
                return matched;
            }
        }
        catch (error) {
            log.warn({ error: String(error) }, 'Semantic matching failed, falling back to pattern');
        }
    }
    // Fallback to pattern-only matching
    return checkDynamicTriggers(triggers, context);
}
export default {
    checkDynamicTriggers,
    checkTriggersHybrid,
    calculateProbabilityBoost,
    shouldSkipDueToNeverWhen,
    buildTriggerContext,
    // Analytics
    recordTriggerCheck,
    recordTriggerMatch,
    recordTriggerFired,
    getTriggerAnalytics,
    resetTriggerAnalytics,
};
//# sourceMappingURL=dynamic-trigger-utils.js.map