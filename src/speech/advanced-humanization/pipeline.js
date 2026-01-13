/**
 * Humanization Pipeline
 *
 * Main entry point for the advanced humanization system.
 * Combines all techniques for maximum natural speech effect.
 *
 * @module advanced-humanization/pipeline
 */
import { createLogger } from '../../utils/safe-logger.js';
import { addBreathGroupPauses } from './breath-groups.js';
import { mapContextToEmotion } from './emotions.js';
import { injectNaturalFillers } from './fillers.js';
import { analyzeRhythm, applyRhythmVariations, hasSignificantVariation } from './rhythm.js';
import { DEFAULT_HUMANIZATION_OPTIONS } from './types.js';
const log = createLogger({ module: 'AdvancedHumanization' });
// ============================================================================
// MAIN PIPELINE
// ============================================================================
/**
 * Apply full humanization pipeline to text
 *
 * This is the main entry point for the advanced humanization system.
 * It combines all techniques for maximum natural speech effect:
 *
 * 1. **Emotion mapping** - Applies appropriate Cartesia emotion based on context
 * 2. **Natural fillers** - Injects "um", "well", "you know" for spontaneity
 * 3. **Breath group pacing** - Natural pauses at phrase boundaries
 * 4. **Speech rhythm variation** - Prevents monotonous delivery
 *
 * @param text - The text to humanize
 * @param options - Humanization options
 * @returns Humanized text with SSML enhancements
 *
 * @example
 * ```typescript
 * const humanized = humanizeText("I think this is important.", {
 *   personaId: 'ferni',
 *   emotionContext: {
 *     agentIntent: 'explaining',
 *     topicWeight: 'medium',
 *     relationshipStage: 'friend'
 *   }
 * });
 * ```
 */
export function humanizeText(text, options = {}) {
    const opts = { ...DEFAULT_HUMANIZATION_OPTIONS, ...options };
    let result = text;
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Emotion mapping (if context provided)
    // ═══════════════════════════════════════════════════════════════════════════
    if (opts.emotionMapping && opts.emotionContext) {
        const emotion = mapContextToEmotion(opts.emotionContext);
        // Prepend emotion tag
        result = `<emotion value="${emotion}"/>${result}`;
        log.debug({ emotion, intent: opts.emotionContext.agentIntent }, 'Applied emotion mapping');
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Natural filler injection
    // ═══════════════════════════════════════════════════════════════════════════
    if (opts.fillers) {
        result = injectNaturalFillers(result, opts.fillerConfig, opts.personaId);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Breath group pacing
    // ═══════════════════════════════════════════════════════════════════════════
    if (opts.breathGroups) {
        result = addBreathGroupPauses(result, opts.breathConfig);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Rhythm variation
    // ═══════════════════════════════════════════════════════════════════════════
    if (opts.rhythmVariation && !result.includes('<speed')) {
        const variations = analyzeRhythm(result);
        // Only apply if there's meaningful variation
        if (hasSignificantVariation(variations)) {
            result = applyRhythmVariations(variations);
        }
    }
    return result;
}
//# sourceMappingURL=pipeline.js.map