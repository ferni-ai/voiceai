/**
 * Wellbeing Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates continuous wellbeing tracking into the context pipeline.
 * Detects wellbeing signals from conversation and surfaces alerts
 * when patterns indicate concern.
 *
 * PHILOSOPHY:
 * A great coach notices patterns over time—not just what you're saying
 * today, but how it compares to last week. This builder tracks wellbeing
 * signals across conversations and alerts when something seems off.
 *
 * @module ContextBuilders/WellbeingContext
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build wellbeing awareness context for the current turn.
 */
declare function buildWellbeingContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildWellbeingContext };
declare const _default: {
    buildWellbeingContext: typeof buildWellbeingContext;
};
export default _default;
//# sourceMappingURL=wellbeing-context.d.ts.map