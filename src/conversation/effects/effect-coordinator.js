/**
 * Effect Coordinator
 *
 * Coordinates effect selection and application.
 * This is the main orchestration point for the composable effect pattern.
 *
 * Features:
 * - Registers and manages all effects
 * - Selects applicable effects based on context
 * - Enforces cooldowns, limits, and probability checks
 * - Applies effects to responses in priority order
 * - Tracks what was applied/skipped for debugging
 *
 * @module @ferni/conversation/effects/effect-coordinator
 */
import { createLogger } from '../../utils/safe-logger.js';
import { shouldFireFeature, getPersonaTuning } from '../humanization-tuning.js';
import { getEffectTracker } from './effect-tracker.js';
const log = createLogger({ module: 'EffectCoordinator' });
// ============================================================================
// IMPLEMENTATION
// ============================================================================
class EffectCoordinatorImpl {
    sessionId;
    personaId;
    effects = [];
    lastSkipped = [];
    constructor(sessionId, personaId) {
        this.sessionId = sessionId;
        this.personaId = personaId;
    }
    registerEffect(effect) {
        // Avoid duplicates
        if (!this.effects.find((e) => e.id === effect.id)) {
            this.effects.push(effect);
        }
    }
    getEffects() {
        return [...this.effects];
    }
    getApplicableEffects(context) {
        const tracker = getEffectTracker(this.sessionId);
        const applicable = [];
        this.lastSkipped = [];
        for (const effect of this.effects) {
            // Check if effect is applicable to this context
            if (!effect.isApplicable(context)) {
                this.lastSkipped.push({ effectId: effect.id, reason: 'not_applicable' });
                continue;
            }
            // Check cooldown and max per session
            if (!tracker.canFire(effect.id, context.turnNumber, effect.config)) {
                const usageCount = tracker.getUsageCount(effect.id);
                const reason = usageCount >= effect.config.maxPerSession ? 'max_reached' : 'cooldown';
                this.lastSkipped.push({ effectId: effect.id, reason });
                continue;
            }
            // Check probability (using deterministic seed)
            const seed = `${this.sessionId}:${this.personaId}:${context.turnNumber}:${effect.id}`;
            if (!shouldFireFeature(effect.config.probability, seed)) {
                this.lastSkipped.push({ effectId: effect.id, reason: 'probability' });
                continue;
            }
            applicable.push(effect);
        }
        log.debug({
            turn: context.turnNumber,
            applicable: applicable.map((e) => e.id),
            skipped: this.lastSkipped.length,
        }, 'Effect applicability check complete');
        return applicable;
    }
    async applyEffects(text, ssml, effects, context) {
        const tracker = getEffectTracker(this.sessionId);
        const tuning = getPersonaTuning(this.personaId);
        const maxEffects = tuning.global.maxEffectsPerResponse;
        // Sort effects by capability priority (presence first, then attunement, etc.)
        const priorityOrder = {
            attunement: 1, // Highest - "they see me" moments
            reactions: 2, // Responding to user
            presence: 3, // Aliveness
            naturalness: 4,
            memory: 5,
            questions: 6,
            silence: 7,
        };
        const sortedEffects = [...effects].sort((a, b) => (priorityOrder[a.capability] ?? 10) - (priorityOrder[b.capability] ?? 10));
        // Limit to max effects
        const limitedEffects = sortedEffects.slice(0, maxEffects);
        const applied = [];
        let modifiedText = text;
        let modifiedSsml = ssml;
        // Track effects that weren't selected due to limit
        for (const effect of sortedEffects.slice(maxEffects)) {
            this.lastSkipped.push({ effectId: effect.id, reason: 'max_reached' });
        }
        // Apply each effect
        for (const effect of limitedEffects) {
            try {
                const result = await effect.generate(context);
                if (!result) {
                    this.lastSkipped.push({ effectId: effect.id, reason: 'generation_failed' });
                    continue;
                }
                // Apply based on placement
                const { text: newText, ssml: newSsml } = this.applyPlacement(modifiedText, modifiedSsml, result.content, result.ssml ?? result.content, effect.placement);
                modifiedText = newText;
                modifiedSsml = newSsml;
                // Record usage
                tracker.recordUsage(effect.id, context.turnNumber);
                applied.push({
                    effectId: effect.id,
                    effectName: effect.name,
                    capability: effect.capability,
                    placement: effect.placement,
                    content: result.content,
                    ssml: result.ssml,
                });
            }
            catch (error) {
                log.debug({ effectId: effect.id, error: String(error) }, 'Effect generation failed');
                this.lastSkipped.push({ effectId: effect.id, reason: 'generation_failed' });
            }
        }
        log.debug({
            turn: context.turnNumber,
            applied: applied.map((a) => a.effectId),
        }, 'Effects applied');
        return {
            text: modifiedText,
            ssml: modifiedSsml,
            applied,
            skipped: this.lastSkipped,
        };
    }
    getSkippedEffects() {
        return [...this.lastSkipped];
    }
    reset() {
        this.lastSkipped = [];
        // Note: Effect registrations are kept; only tracking state resets
    }
    // ==========================================================================
    // PRIVATE HELPERS
    // ==========================================================================
    applyPlacement(text, ssml, content, contentSsml, placement) {
        switch (placement) {
            case 'prefix':
                return {
                    text: `${content} ${text}`,
                    ssml: `${contentSsml} ${ssml}`,
                };
            case 'suffix':
                return {
                    text: `${text} ${content}`,
                    ssml: `${ssml} ${contentSsml}`,
                };
            case 'interrupt':
                // Interrupt adds a break for emphasis
                return {
                    text: `${content} ${text}`,
                    ssml: `${contentSsml}<break time="200ms"/> ${ssml}`,
                };
            case 'standalone':
                return { text: content, ssml: contentSsml };
            case 'inline':
            default:
                // For inline, just prepend (more sophisticated inline placement would
                // require parsing the response structure)
                return {
                    text: `${content} ${text}`,
                    ssml: `${contentSsml} ${ssml}`,
                };
        }
    }
}
// ============================================================================
// FACTORY
// ============================================================================
const coordinators = new Map();
/**
 * Get or create an effect coordinator for a session
 */
export function getEffectCoordinator(sessionId, personaId) {
    const key = `${sessionId}:${personaId}`;
    let coordinator = coordinators.get(key);
    if (!coordinator) {
        coordinator = new EffectCoordinatorImpl(sessionId, personaId);
        coordinators.set(key, coordinator);
    }
    return coordinator;
}
/**
 * Reset coordinator for a session
 */
export function resetEffectCoordinator(sessionId, personaId) {
    const key = `${sessionId}:${personaId}`;
    const coordinator = coordinators.get(key);
    if (coordinator) {
        coordinator.reset();
    }
    coordinators.delete(key);
}
/**
 * Reset all coordinators
 */
export function resetAllEffectCoordinators() {
    coordinators.clear();
}
//# sourceMappingURL=effect-coordinator.js.map