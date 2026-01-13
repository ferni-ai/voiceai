/**
 * Behavioral Economics Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates behavioral economics techniques into the voice agent's
 * context pipeline to help bridge intention-action gaps.
 *
 * PHILOSOPHY:
 * People know what they should do. The gap between knowing and doing
 * is where behavioral economics shines. These tools work with human
 * nature, not against it.
 *
 * @module ContextBuilders/BehavioralEconomics
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Build behavioral economics context for the current turn.
 */
declare function buildBehavioralEconContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildBehavioralEconContext };
declare const _default: {
    buildBehavioralEconContext: typeof buildBehavioralEconContext;
};
export default _default;
//# sourceMappingURL=behavioral-economics.d.ts.map