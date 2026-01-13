/**
 * Deep Relationship Intelligence Context Builder
 *
 * "Better Than Human" - We build real relationships, not just conversations.
 *
 * This builder synthesizes the deepest relationship elements:
 * - Shared vocabulary (phrases only we use)
 * - Inside jokes and running gags
 * - Conversation callbacks (remember when...)
 * - Milestone awareness (50th conversation!)
 * - Relationship arc tracking
 *
 * Philosophy: These are the things that make someone feel truly known.
 * Not surveillance - celebration of shared history.
 *
 * PERFORMANCE:
 * - Session-scoped cache (1 min TTL) avoids repeated Firestore reads
 * - Parallel Firestore reads via Promise.all
 * - Early-turn skip (turns 0-2 don't need deep relationship data)
 * - Target: <10ms cache hit, <150ms cache miss
 *
 * @module DeepRelationshipContext
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildDeepRelationshipContext(input: ContextBuilderInput): Promise<ContextInjection[]>;
/**
 * Record a shared moment (joke, phrase, callback moment)
 * Call this when detecting significant moments
 */
declare function recordSharedMomentInternal(userId: string, moment: {
    type: 'phrase' | 'running_gag' | 'callback_moment';
    content: string;
    whatTheySaid: string;
    triggers?: string[];
    significance?: 'life_changing' | 'meaningful' | 'warm' | 'fun';
}): Promise<void>;
export { buildDeepRelationshipContext, recordSharedMomentInternal as recordSharedMoment };
//# sourceMappingURL=deep-relationship.d.ts.map