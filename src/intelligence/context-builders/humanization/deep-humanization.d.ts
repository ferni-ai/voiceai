/**
 * Deep Humanization Context Builder
 *
 * Integrates all the humanization systems into the prompt pipeline:
 * - Relationship Artifacts (shared moments, callbacks)
 * - Arc-Aware Behavior Selection (phase-appropriate behaviors)
 * - Internal Monologue (thoughts that may surface)
 * - Story Unlocks (relationship-gated stories)
 * - Vocabulary Mirroring (adopted language)
 *
 * This is the orchestration layer that makes Ferni feel ALIVE.
 *
 * @module @ferni/context-builders/deep-humanization
 */
import { type ContextBuilder } from '../index.js';
declare const deepHumanizationBuilder: ContextBuilder;
/**
 * Clean up session state
 */
export declare function cleanupDeepHumanization(sessionId: string): void;
export { deepHumanizationBuilder };
export default deepHumanizationBuilder;
//# sourceMappingURL=deep-humanization.d.ts.map