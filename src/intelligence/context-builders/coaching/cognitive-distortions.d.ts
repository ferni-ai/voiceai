/**
 * Cognitive Distortions Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates the Cognitive Intelligence system into the voice agent's
 * context pipeline. Detects cognitive distortions in real-time and
 * provides guidance for gentle Socratic intervention.
 *
 * This builder surfaces:
 * - Detected cognitive distortions with confidence scores
 * - Recommended response approach (validate, Socratic, gentle name, etc.)
 * - Suggested questions and reframes
 * - Pattern information (is this recurring?)
 *
 * PHILOSOPHY:
 * A great coach notices when someone is stuck in a thinking trap—
 * not to lecture, but to invite curiosity. The goal is never to
 * dismiss feelings. It's to question thoughts that may not be serving them.
 *
 * @module ContextBuilders/CognitiveDistortions
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build cognitive distortion awareness context for the current turn.
 */
declare function buildCognitiveDistortionsContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildCognitiveDistortionsContext };
declare const _default: {
    buildCognitiveDistortionsContext: typeof buildCognitiveDistortionsContext;
};
export default _default;
//# sourceMappingURL=cognitive-distortions.d.ts.map