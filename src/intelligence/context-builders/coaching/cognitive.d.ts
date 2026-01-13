/**
 * Cognitive Context Builder
 *
 * Integrates persona-specific cognitive intelligence into context injections.
 * Makes each persona THINK differently - not just feel differently.
 *
 * This builder:
 * - Analyzes the current context and selects appropriate reasoning approach
 * - Generates attention cues for what this persona naturally notices
 * - Alerts to potential cognitive biases
 * - Adjusts for user expertise level
 * - Signals appropriate confidence levels
 * - Detects user cognitive style for better matching
 * - Builds reasoning chains for complex situations
 * - Resolves cognitive conflicts between persona style and user needs
 * - Tracks cognitive learning over time
 * - Manages knowledge state to avoid re-explaining
 * - Adapts cognitive approach based on relationship depth
 * - Generates cognitive-appropriate questions
 * - Integrates team cognitive perspectives
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build cognitive intelligence context
 *
 * Uses centralized SessionStateManager for session tracking.
 */
declare function buildCognitiveContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildCognitiveContext };
export default buildCognitiveContext;
//# sourceMappingURL=cognitive.d.ts.map