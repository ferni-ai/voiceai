import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Market panic keywords and phrases
 */
declare const MARKET_PANIC_PATTERNS: RegExp;
/**
 * Grief patterns with loss type categorization
 */
declare const GRIEF_PATTERNS: {
    pattern: RegExp;
    lossType: string;
}[];
/**
 * Life event patterns with specific guidance
 */
declare const LIFE_EVENT_PATTERNS: {
    pattern: RegExp;
    eventType: string;
}[];
/**
 * Build crisis-related context injections
 *
 * Uses centralized DISTRESS constants for consistent thresholds:
 * - DISTRESS.ELEVATED (0.4) for market panic trigger
 * - DISTRESS.MODERATE (0.5) for grief detection
 */
declare function buildCrisisContext(input: ContextBuilderInput): ContextInjection[];
export { buildCrisisContext, GRIEF_PATTERNS, LIFE_EVENT_PATTERNS, MARKET_PANIC_PATTERNS };
//# sourceMappingURL=crisis.d.ts.map