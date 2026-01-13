/**
 * Advanced Memory Context Builder
 *
 * "Better than human" memory retrieval that uses semantic understanding,
 * temporal decay, emotional salience, and relationship context.
 *
 * Philosophy: A great friend remembers what matters - not everything, but the
 * things that shaped you, the commitments made, and the context needed to
 * continue where you left off naturally.
 *
 * Features:
 * - Semantic similarity (meaning, not just keywords)
 * - Temporal decay (recent = more relevant, unless emotionally significant)
 * - Emotional salience (heavy moments persist longer)
 * - Commitment tracking (promises made are remembered)
 * - Natural memory callbacks ("Remember when you mentioned...")
 *
 * @module AdvancedMemoryContextBuilder
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
import { type RetrievedMemory } from '../../../memory/advanced-retrieval.js';
/**
 * Ensure memory index is built/refreshed for user
 */
declare function ensureMemoryIndex(userId: string, profile: ContextBuilderInput['userProfile'], turnCount: number): Promise<boolean>;
/**
 * Retrieve relevant memories for the current conversation turn
 */
declare function retrieveRelevantMemories(userId: string, userText: string, input: ContextBuilderInput): Promise<RetrievedMemory[]>;
/**
 * Get priming memories for session start
 */
declare function getPrimingMemories(userId: string, personaId: string, sessionCount: number): Promise<RetrievedMemory[]>;
/**
 * Format retrieved memories for LLM context injection
 */
declare function formatMemoriesForContext(memories: RetrievedMemory[], isSessionStart: boolean): string;
/**
 * Build advanced memory context for the current turn
 */
declare function buildAdvancedMemoryContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
export { buildAdvancedMemoryContext, ensureMemoryIndex, retrieveRelevantMemories, getPrimingMemories, formatMemoriesForContext, };
declare const _default: {
    buildAdvancedMemoryContext: typeof buildAdvancedMemoryContext;
    ensureMemoryIndex: typeof ensureMemoryIndex;
    retrieveRelevantMemories: typeof retrieveRelevantMemories;
    getPrimingMemories: typeof getPrimingMemories;
};
export default _default;
//# sourceMappingURL=advanced-memory.d.ts.map