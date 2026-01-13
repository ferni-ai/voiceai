/**
 * Response Naturalness Module
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Makes AI responses feel more human through:
 * - Acknowledgment prefixes ("Mm-hmm. So...")
 * - Thinking fillers during delays ("Let me think...")
 * - Catchphrase integration
 * - Response warmth markers
 *
 * The little things matter. A simple "mm-hmm" before answering,
 * a natural pause while "thinking" - these micro-moments are what
 * transform a response into a conversation.
 *
 * NOTE: Persona phrases are now consolidated in persona-phrases.ts.
 * This module re-exports them for backward compatibility.
 */
export { ACKNOWLEDGMENT_PREFIXES, getAcknowledgmentPrefix, getCatchphraseWithSsml, getContextAwareThinkingFiller, // Dynamic context-aware version (PREFERRED)
normalizePersonaId, PERSONA_CATCHPHRASES, } from './persona-phrases.js';
/**
 * Determine the appropriate acknowledgment mood based on context
 */
export declare function determineAcknowledgmentMood(userEmotion?: string, topicWeight?: 'light' | 'medium' | 'heavy', isQuestion?: boolean, isExciting?: boolean): 'neutral' | 'engaged' | 'empathetic' | 'excited' | 'thoughtful';
/**
 * Should we add a prefix? (Not every response needs one)
 *
 * HUMANIZATION FIX (Dec 2025): Reduced from 70% to 30% base rate.
 * Real humans don't say "mm-hmm" before most responses - it feels
 * performative and robotic when overdone. The absence of acknowledgment
 * is also a form of natural communication.
 */
export declare function shouldAddPrefix(turnCount: number, isFollowUp: boolean, isGreeting: boolean): boolean;
interface CatchphraseConfig {
    maxPerSession: number;
    minTurnsBetween: number;
    positiveChance: number;
    defaultChance: number;
}
/**
 * Session-scoped catchphrase usage tracker.
 */
export declare class CatchphraseTracker {
    private usage;
    private config;
    constructor(config?: Partial<CatchphraseConfig>);
    shouldInject(personaId: string, turnCount: number, isPositiveMoment: boolean): boolean;
    reset(): void;
}
/**
 * Get or create a session-scoped catchphrase tracker.
 */
export declare function getSessionCatchphraseTracker(sessionId: string): CatchphraseTracker;
/**
 * Reset catchphrase tracker for a session
 */
export declare function resetSessionCatchphraseTracker(sessionId: string): void;
/**
 * Reset all session catchphrase trackers
 */
export declare function resetAllCatchphraseTrackers(): void;
export declare function shouldInjectCatchphrase(sessionId: string, personaId: string, turnCount: number, isPositiveMoment: boolean): boolean;
export declare function shouldInjectCatchphrase(personaId: string, turnCount: number, isPositiveMoment: boolean): boolean;
/**
 * Reset catchphrase tracking (for new session)
 */
export declare function resetCatchphraseTracking(): void;
export interface ResponseEnhancementOptions {
    personaId: string;
    turnCount: number;
    userEmotion?: string;
    topicWeight?: 'light' | 'medium' | 'heavy';
    isQuestion?: boolean;
    isFollowUp?: boolean;
    isGreeting?: boolean;
    isPositiveMoment?: boolean;
    /** Session ID for feedback coordination (optional for backward compatibility) */
    sessionId?: string;
}
export interface ResponseEnhancement {
    prefix: string | null;
    suffix: string | null;
    shouldAddThinkingFiller: boolean;
}
/**
 * Get all response enhancements for a response
 *
 * HUMANIZATION FIX (Dec 2025): Now coordinates with global feedback budget
 * to prevent stacking (backchannel + prefix + catchphrase in same turn).
 */
export declare function getResponseEnhancements(options: ResponseEnhancementOptions): ResponseEnhancement;
declare const _default: {
    determineAcknowledgmentMood: typeof determineAcknowledgmentMood;
    shouldAddPrefix: typeof shouldAddPrefix;
    getResponseEnhancements: typeof getResponseEnhancements;
    resetCatchphraseTracking: typeof resetCatchphraseTracking;
    shouldInjectCatchphrase: typeof shouldInjectCatchphrase;
};
export default _default;
//# sourceMappingURL=response-naturalness.d.ts.map