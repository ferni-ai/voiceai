/**
 * Natural Uncertainty Context Builder
 *
 * Humans aren't always certain. They think out loud, admit when they don't know,
 * change their minds, and express genuine doubt. This makes Ferni feel more human
 * by occasionally injecting uncertainty expressions.
 *
 * Key behaviors:
 * - "I'm not sure, but..." - genuine uncertainty
 * - "Hmm, let me think about that..." - processing out loud
 * - "Actually, wait..." - course correction
 * - "I might be wrong, but..." - humble opinions
 * - Comfortable silence / not always having an answer
 *
 * @module NaturalUncertaintyContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Check if user message triggers natural uncertainty
 */
declare function detectUncertaintyTrigger(message: string): string | null;
/**
 * Build natural uncertainty context
 */
declare function buildNaturalUncertaintyContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildNaturalUncertaintyContext, detectUncertaintyTrigger };
//# sourceMappingURL=natural-uncertainty.d.ts.map