/**
 * Handoff Context Builder
 *
 * Handles handoff-related context injections:
 * - IMMEDIATE handoffs for wake words ("Hey Alex", "Hey Ferni", etc.)
 * - Suggests handoffs when conversation topic matches another team member's specialty
 * - Provides current agent context for response styling
 * - Tracks handoff history for continuity
 *
 * Wake words and triggers are now loaded from persona bundle manifests!
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
interface WakeWordResult {
    isWakeWord: boolean;
    targetAgent: string | null;
    targetName: string | null;
    tool: string | null;
}
/**
 * Check if user said a wake word that should trigger IMMEDIATE handoff
 * Uses triggers from bundle manifests with fallback to hardcoded triggers
 */
declare function detectWakeWord(userText: string): WakeWordResult;
/**
 * Build handoff-related context injections
 */
declare function buildHandoffContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildHandoffContext, detectWakeWord };
//# sourceMappingURL=handoff.d.ts.map