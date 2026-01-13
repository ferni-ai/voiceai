/**
 * Somatic Intelligence Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates somatic awareness and body-based interventions into
 * the context pipeline. Suggests grounding and breathing exercises
 * when users are in distress.
 *
 * PHILOSOPHY:
 * Sometimes the best thing isn't to talk more—it's to help someone
 * breathe, ground, and regulate their nervous system. This builder
 * detects when somatic intervention might help and provides guidance.
 *
 * @module ContextBuilders/SomaticContext
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build somatic awareness context for the current turn.
 */
declare function buildSomaticContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildSomaticContext };
declare const _default: {
    buildSomaticContext: typeof buildSomaticContext;
};
export default _default;
//# sourceMappingURL=somatic-context.d.ts.map