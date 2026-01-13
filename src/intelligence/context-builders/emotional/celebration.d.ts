import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Financial milestone patterns
 */
declare const MILESTONE_PATTERNS: RegExp[];
/**
 * Good news patterns
 */
declare const GOOD_NEWS_PATTERNS: RegExp;
/**
 * Build celebration-related context injections
 * Now includes PERSONA-SPECIFIC celebration responses!
 */
declare function buildCelebrationContext(input: ContextBuilderInput): ContextInjection[];
export { buildCelebrationContext, GOOD_NEWS_PATTERNS, MILESTONE_PATTERNS };
//# sourceMappingURL=celebration.d.ts.map