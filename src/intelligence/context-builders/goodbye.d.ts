import { type ContextBuilderInput, type ContextInjection } from './index.js';
import type { PersonaConfig } from '../../personas/types.js';
interface SilenceFillers {
    early?: string[];
    mid?: string[];
    late?: string[];
}
interface GoodbyePersonaExtensions {
    communication?: {
        silenceFillers?: SilenceFillers;
        interruptionRecoveries?: string[];
    };
}
type ExtendedPersona = PersonaConfig & GoodbyePersonaExtensions;
declare const GOODBYE_PATTERNS: RegExp;
/**
 * PRE-GOODBYE DETECTION
 * Detect when user is winding down BEFORE they explicitly say goodbye.
 * This allows us to anticipate and make the ending feel natural.
 */
declare const PRE_GOODBYE_PATTERNS: RegExp[];
/**
 * Detect if user is winding down (pre-goodbye)
 */
declare function detectWindingDown(userText: string, turnCount: number): boolean;
/**
 * Get time-aware goodbye suggestion based on user's local time
 */
declare function getTimeAwareGoodbye(timezone?: string): {
    timeOfDay: string;
    suggestion: string;
};
/**
 * Detect if the conversation was emotionally heavy
 */
declare function detectHeavyConversation(conversationHistory: string[]): {
    isHeavy: boolean;
    topics: string[];
};
/**
 * Generate personalized sign-off based on conversation topics
 */
declare function generatePersonalizedSignoff(topics: string[], userName?: string): string | null;
/**
 * Get silence filler phrase - uses persona config if available
 */
declare function getSilenceFiller(turnCount: number, persona?: ExtendedPersona): string;
/**
 * Get interruption recovery phrase - uses persona config if available
 */
declare function getInterruptionRecovery(persona?: ExtendedPersona): string;
/**
 * Get closing behavior suggestion
 */
declare function getClosingBehavior(turnCount: number, intent: string): string | null;
/**
 * Build goodbye-related context injections
 */
declare function buildGoodbyeContext(input: ContextBuilderInput): ContextInjection[];
export { buildGoodbyeContext, getSilenceFiller, getInterruptionRecovery, getClosingBehavior, GOODBYE_PATTERNS, PRE_GOODBYE_PATTERNS, detectWindingDown, getTimeAwareGoodbye, detectHeavyConversation, generatePersonalizedSignoff, };
//# sourceMappingURL=goodbye.d.ts.map