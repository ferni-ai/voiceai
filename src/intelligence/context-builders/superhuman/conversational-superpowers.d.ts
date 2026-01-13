/**
 * Conversational Superpowers Context Builder
 *
 * Integrates all the "better than human" conversational features:
 *
 * Phase 1 (Original):
 * - Quote memory ("Last time you said...")
 * - Relationship milestones ("It's been 3 months!")
 * - Micro-celebrations (real-time wins)
 * - Natural speech patterns
 * - Inside jokes
 * - Nicknames
 * - Story continuity (people in their life)
 *
 * Phase 2 (Enhanced):
 * - Vulnerability matching (reciprocal depth)
 * - Empathetic reflections (structured empathy)
 * - Presence mode ("just be here")
 * - Shared language ("our words")
 * - Conversational rituals ("our thing")
 * - Emotional forecasting ("tomorrow might be tough")
 * - Gentle challenges ("I love you, and...")
 * - Meta-moments ("this is nice")
 *
 * @module intelligence/context-builders/conversational-superpowers
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Clear session data for a specific session (prevents memory leaks).
 */
export declare function clearSuperpowersSession(sessionId: string): void;
/**
 * Clear all session data (for shutdown).
 */
export declare function clearAllSuperpowersSessions(): void;
declare function buildConversationalSuperpowers(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildConversationalSuperpowers };
//# sourceMappingURL=conversational-superpowers.d.ts.map