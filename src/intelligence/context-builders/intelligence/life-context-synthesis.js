/**
 * Life Context Synthesis Context Builder
 *
 * Phase 6: Cross-Domain Synthesis
 *
 * "Better Than Human" - Responds to LIFE CONTEXT, not just words.
 *
 * This builder injects cross-domain awareness that no human friend
 * could consistently provide. It synthesizes signals from all personas'
 * domains to understand the user's full life situation.
 *
 * Example pattern detection:
 * - Maya sees poor sleep + Alex sees packed calendar + Peter sees market anxiety
 *   → Ferni surfaces: "You're carrying a lot right now"
 *
 * @module LifeContextSynthesis
 */
import { createHighInjection, createStandardInjection, registerContextBuilder, } from '../index.js';
import { BuilderCategory } from '../core/categories.js';
import { createLogger } from '../../../utils/safe-logger.js';
const log = createLogger({ module: 'LifeContextSynthesis' });
// ============================================================================
// CONFIGURATION
// ============================================================================
/**
 * Minimum load score to surface support context
 */
const HIGH_LOAD_THRESHOLD = 0.6;
/**
 * Minimum wellbeing score to surface celebration context
 */
const HIGH_WELLBEING_THRESHOLD = 0.7;
/**
 * Minimum turns between surfacing life context
 */
const MIN_TURNS_BETWEEN_SURFACING = 10;
/**
 * Probability of surfacing when triggered (to avoid overuse)
 */
const SURFACING_PROBABILITY = 0.25;
/**
 * Track when we last surfaced life context per session
 */
const lastLifeContextSurfaced = new Map();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Check if we should surface life context this turn
 */
function shouldSurfaceThisTurn(sessionId, turnCount) {
    const lastTurn = lastLifeContextSurfaced.get(sessionId) ?? -MIN_TURNS_BETWEEN_SURFACING;
    if (turnCount - lastTurn < MIN_TURNS_BETWEEN_SURFACING) {
        return false;
    }
    // Random chance to avoid predictability
    return Math.random() < SURFACING_PROBABILITY;
}
/**
 * Format trigger for injection
 */
function formatTriggerGuidance(trigger) {
    const parts = [];
    parts.push(`[Cross-Domain Insight - ${trigger.category.toUpperCase()}]`);
    parts.push(`Confidence: ${(trigger.confidence * 100).toFixed(0)}%`);
    parts.push(`Contributing domains: ${trigger.contributingDomains.join(', ')}`);
    parts.push('');
    parts.push('Suggested natural way to surface this:');
    parts.push(`"${trigger.suggestedResponse}"`);
    parts.push('');
    parts.push(`Reasoning: ${trigger.reasoning}`);
    return parts.join('\n');
}
/**
 * Format patterns for injection
 */
function formatPatternGuidance(patterns) {
    if (patterns.length === 0)
        return '';
    const negativePatterns = patterns.filter((p) => p.impact === 'negative');
    const positivePatterns = patterns.filter((p) => p.impact === 'positive');
    const parts = [];
    if (negativePatterns.length > 0) {
        parts.push('[Cross-Domain Patterns Detected - Handle with Care]');
        for (const pattern of negativePatterns) {
            parts.push(`• ${pattern.description} (${pattern.domains.join(' + ')})`);
        }
        parts.push('');
    }
    if (positivePatterns.length > 0) {
        parts.push('[Positive Momentum]');
        for (const pattern of positivePatterns) {
            parts.push(`• ${pattern.description}`);
        }
        parts.push('');
    }
    return parts.join('\n');
}
/**
 * Format load/wellbeing summary
 */
function formatLifeContextSummary(snapshot) {
    const parts = [];
    parts.push('[Life Context Awareness]');
    parts.push(`Overall load: ${(snapshot.overallLoadScore * 100).toFixed(0)}%`);
    parts.push(`Wellbeing: ${(snapshot.wellbeingScore * 100).toFixed(0)}%`);
    const highStressDomains = snapshot.stressIndicators
        .filter((i) => i.stressLevel > 0.5)
        .map((i) => i.domain);
    if (highStressDomains.length > 0) {
        parts.push(`High stress areas: ${highStressDomains.join(', ')}`);
    }
    parts.push(`Data quality: ${snapshot.metadata.dataQuality}`);
    return parts.join('\n');
}
// ============================================================================
// CONTEXT BUILDER
// ============================================================================
export const lifeContextSynthesisBuilder = {
    name: 'life-context-synthesis',
    description: 'Injects cross-domain life context awareness for "Better Than Human" support',
    priority: 35, // After emotional/memory but before engagement
    category: BuilderCategory.COGNITIVE,
    build: async (input) => {
        const { userData, services, analysis } = input;
        const injections = [];
        // Get life context snapshot from userData (loaded during session init)
        const lifeContext = userData?.lifeContextSnapshot;
        if (!lifeContext) {
            // Life context not available - skip silently
            return [];
        }
        const sessionId = services?.sessionId || 'unknown';
        const turnCount = userData?.turnCount || 0;
        // Check if we should surface this turn
        if (!shouldSurfaceThisTurn(sessionId, turnCount)) {
            // Still provide background awareness but don't surface actively
            if (lifeContext.overallLoadScore > HIGH_LOAD_THRESHOLD) {
                injections.push(createStandardInjection('life_context_background', `[Background Awareness] User's life load is elevated (${(lifeContext.overallLoadScore * 100).toFixed(0)}%). ` +
                    'Be extra gentle and supportive. Avoid adding pressure.', { category: 'life-context' }));
            }
            return injections;
        }
        // Mark that we're surfacing this turn
        lastLifeContextSurfaced.set(sessionId, turnCount);
        log.debug({
            sessionId,
            turnCount,
            loadScore: lifeContext.overallLoadScore,
            wellbeingScore: lifeContext.wellbeingScore,
            triggers: lifeContext.synthesizedTriggers.length,
            patterns: lifeContext.patterns.length,
        }, 'Surfacing life context synthesis');
        // Add life context summary
        injections.push(createStandardInjection('life_context_summary', formatLifeContextSummary(lifeContext), {
            category: 'life-context',
        }));
        // Add pattern guidance if we have patterns
        if (lifeContext.patterns.length > 0) {
            const patternGuidance = formatPatternGuidance(lifeContext.patterns);
            if (patternGuidance) {
                injections.push(createStandardInjection('life_context_patterns', patternGuidance, {
                    category: 'life-context',
                }));
            }
        }
        // Add primary synthesis trigger if available
        if (lifeContext.synthesizedTriggers.length > 0) {
            const primaryTrigger = lifeContext.synthesizedTriggers[0];
            // High priority triggers get high injection priority
            if (primaryTrigger.priority === 'urgent' || primaryTrigger.priority === 'high') {
                injections.push(createHighInjection('life_context_trigger', formatTriggerGuidance(primaryTrigger), {
                    category: 'life-context',
                }));
            }
            else {
                injections.push(createStandardInjection('life_context_trigger', formatTriggerGuidance(primaryTrigger), {
                    category: 'life-context',
                }));
            }
        }
        // Special handling for high load or low wellbeing
        if (lifeContext.overallLoadScore > HIGH_LOAD_THRESHOLD) {
            injections.push(createHighInjection('life_context_high_load', '[HIGH LOAD DETECTED] User is carrying significant stress across multiple life domains. ' +
                "Consider: (1) Acknowledging the weight they're carrying, (2) Not adding tasks or pressure, " +
                '(3) Offering space to just be heard, (4) Gentle check-in on what would help most right now.', { category: 'life-context' }));
        }
        if (lifeContext.wellbeingScore > HIGH_WELLBEING_THRESHOLD) {
            injections.push(createStandardInjection('life_context_high_wellbeing', "[POSITIVE MOMENTUM] User's life is in a good place across domains. " +
                'Consider: (1) Acknowledging the balance, (2) Celebrating progress, ' +
                "(3) Exploring what's working well.", { category: 'life-context' }));
        }
        return injections;
    },
};
// Register builder
registerContextBuilder(lifeContextSynthesisBuilder);
// ============================================================================
// EXPORTS
// ============================================================================
export { shouldSurfaceThisTurn, formatTriggerGuidance, formatPatternGuidance };
/**
 * Clear surfacing history (for testing)
 */
export function clearLifeContextSurfacingHistory() {
    lastLifeContextSurfaced.clear();
}
//# sourceMappingURL=life-context-synthesis.js.map