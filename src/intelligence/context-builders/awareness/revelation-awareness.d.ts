/**
 * Revelation Awareness Context Builder
 *
 * > "The capability is felt, not explained."
 *
 * Injects guidance to ensure Ferni:
 * 1. Doesn't overwhelm with capabilities
 * 2. Uses human language, not surveillance language
 * 3. Asks permission before going deep
 * 4. Spaces out impressive moments
 *
 * This builder runs on EVERY turn to provide guardrails.
 *
 * @module intelligence/context-builders/revelation-awareness
 */
import { type ContextBuilder } from '../index.js';
export declare const revelationAwarenessBuilder: ContextBuilder;
export default revelationAwarenessBuilder;
/**
 * Check if a capability can be used and get guidance
 *
 * Use this in other builders before surfacing patterns, memories, etc.
 */
export declare function checkBeforeReveal(userId: string, sessionId: string, capability: 'memory' | 'pattern' | 'anticipation' | 'growth' | 'challenge' | 'synthesis' | 'team', context: {
    sessionNumber: number;
    trustLevel?: number;
}): Promise<{
    canReveal: boolean;
    reason?: string;
    permissionPrompt?: string;
    isFirstTime: boolean;
}>;
/**
 * Record that we revealed a capability
 *
 * Call this AFTER successfully using a capability
 */
export declare function afterReveal(userId: string, sessionId: string, capability: 'memory' | 'pattern' | 'anticipation' | 'growth' | 'challenge' | 'synthesis' | 'team', personaId: string, context: string): Promise<void>;
//# sourceMappingURL=revelation-awareness.d.ts.map