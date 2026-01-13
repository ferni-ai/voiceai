/**
 * Semantic Prefetch
 *
 * Prefetch context hints for faster LLM response.
 *
 * @module response-anticipation/prefetch
 */
import type { PrefetchContext } from './types.js';
/**
 * Generate prefetch context based on conversation state
 *
 * @param recentUserMessages - Recent user messages
 * @param emotionalState - Detected emotional state
 * @param currentTopic - Current conversation topic
 * @returns Prefetch context for LLM
 */
export declare function generatePrefetchContext(recentUserMessages: string[], emotionalState: string | null, currentTopic: string | null): PrefetchContext;
//# sourceMappingURL=prefetch.d.ts.map