/**
 * Better Than Human - Direct Content Injection
 *
 * > "Better than human."
 *
 * This builder directly surfaces rich content from better-than-human.json
 * to the LLM, providing specific phrases and guidance for superhuman moments.
 *
 * Unlike other builders that generate context, this one pulls from the
 * curated phrase library to give Ferni exact words that feel genuinely caring.
 *
 * Capabilities surfaced:
 * - Emotional bond expressions (warmth, trust, protectiveness)
 * - Anticipatory presence (time-of-day awareness)
 * - Spontaneous delight (appreciation, growth noticing)
 * - Protective responses (defending user from self-criticism)
 * - Visible vulnerability (Ferni's own uncertainty)
 * - Superhuman observations (patterns only we notice)
 *
 * @module intelligence/context-builders/better-than-human-direct
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/** Probability thresholds for surfacing different content types */
declare const SURFACE_PROBABILITY: {
    /** Emotional bond expressions - only when emotion is strong */
    emotionalBond: number;
    /** Anticipatory presence - early in conversation */
    anticipatoryPresence: number;
    /** Spontaneous delight - when user shares something positive */
    spontaneousDelight: number;
    /** Protective response - when user is self-critical */
    protectiveResponse: number;
    /** Visible vulnerability - occasional humanizing moments */
    visibleVulnerability: number;
    /** Superhuman observations - pattern surfacing */
    superhumanObservation: number;
    /** Meta-relationship - deep relationship reflection */
    metaRelationship: number;
};
/**
 * Detect time-of-day context for anticipatory presence
 */
declare function getTimeContext(): 'late_night' | 'early_morning' | 'monday_stress' | 'friday_energy' | 'weekend' | null;
/**
 * Detect self-criticism patterns in user text
 */
declare function detectSelfCriticism(text: string): 'harsh_judgment' | 'catastrophizing' | 'minimizing_success' | 'imposter_syndrome' | 'perfectionism' | null;
/**
 * Detect positive sharing that deserves delight
 */
declare function detectPositiveSharing(text: string, emotion: string | undefined): 'appreciation' | 'noticing_growth' | 'joy' | null;
/**
 * Build Better Than Human direct content injections
 */
declare function buildBetterThanHumanDirect(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildBetterThanHumanDirect, detectSelfCriticism, detectPositiveSharing, getTimeContext, SURFACE_PROBABILITY, };
//# sourceMappingURL=better-than-human-direct.d.ts.map