/**
 * Therapeutic Frameworks Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates evidence-based therapeutic frameworks (ACT, DBT, MI)
 * into the voice agent's context pipeline.
 *
 * PHILOSOPHY:
 * These frameworks represent decades of research on what helps people.
 * We adapt them for conversational coaching—not replacing therapy,
 * but making research-backed support accessible in everyday moments.
 *
 * @module ContextBuilders/TherapeuticFrameworks
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build therapeutic framework context for the current turn.
 */
declare function buildTherapeuticFrameworksContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildTherapeuticFrameworksContext };
declare const _default: {
    buildTherapeuticFrameworksContext: typeof buildTherapeuticFrameworksContext;
};
export default _default;
//# sourceMappingURL=therapeutic-frameworks.d.ts.map