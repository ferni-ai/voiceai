/**
 * Cross-Session Threading Context Builder
 *
 * Surfaces open threads from previous conversations:
 * - Interrupted topics that need follow-up
 * - Promised follow-ups that weren't delivered
 * - Emotional continuity from last session
 * - "Where were we?" conversational memory
 *
 * This makes conversations feel continuous across sessions.
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
declare function buildCrossSessionThreadingContext(input: ContextBuilderInput): ContextInjection[];
export { buildCrossSessionThreadingContext };
//# sourceMappingURL=cross-session-threading.d.ts.map