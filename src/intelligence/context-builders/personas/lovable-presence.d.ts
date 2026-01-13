/**
 * Lovable Presence Context Builder
 *
 * > "The difference between 'warm professional' and 'someone you love' is SURPRISE."
 *
 * This builder orchestrates the moments that make people smile and fall in love.
 * It decides WHEN to inject personality, tangents, reactions, and delight.
 *
 * BETTER THAN HUMAN:
 * - Humans forget to be charming when stressed. We never forget.
 * - Humans miss patterns. We notice what makes THIS person light up.
 * - Humans can't remember every throwaway comment. We do.
 * - Humans get tired. We're always ready to surprise and delight.
 *
 * INTEGRATION:
 * - Loads content from persona bundle (lovable-moments.json, etc.)
 * - Falls back to hardcoded examples if bundle content unavailable
 *
 * @module LovablePresenceContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildLovablePresenceContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/** Clear content cache (for testing) */
export declare function clearLovableContentCache(): void;
/**
 * Clear session states (for testing)
 *
 * NOTE: Session state is now managed centrally by SessionStateManager.
 * Use SessionStateManager.clearAll() to clear all session state.
 * This function is kept for backward compatibility but is a no-op.
 */
export declare function clearLovableSessionStates(): void;
export { buildLovablePresenceContext };
//# sourceMappingURL=lovable-presence.d.ts.map