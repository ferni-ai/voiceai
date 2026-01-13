/**
 * Deep Understanding Context Builder
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * Integrates all the "superhuman understanding" intelligence systems:
 *
 * 1. Silence Intelligence - What different pauses mean
 * 2. Life Rhythm Prediction - Anticipating when they'll need support
 * 3. Relational Network - Understanding people in their life
 * 4. Resistance Detection - What they're avoiding
 * 5. Energy State - Physical/mental capacity
 * 6. Subconscious Goals - What they want but haven't articulated
 * 7. Conversational Flow - When to go deep vs light
 * 8. Repair Intelligence - Fixing misunderstandings
 * 9. Hope Trajectory - Long-term resilience tracking
 * 10. Life Chapter - Major life phases and transitions
 * 11. Voice-Text Mismatch - Detecting incongruence between words and tone
 *
 * This builder synthesizes all these signals into coherent guidance
 * for truly superhuman emotional intelligence.
 *
 * @module intelligence/context-builders/intelligence/deep-understanding
 */
import { type ContextBuilderInput, type ContextInjection } from '../index.js';
/**
 * Clear session data for a specific session (prevents memory leaks).
 */
export declare function clearDeepUnderstandingSession(sessionId: string): void;
/**
 * Clear all session data (for shutdown).
 */
export declare function clearAllDeepUnderstandingSessions(): void;
/**
 * Deep Understanding Context Builder
 *
 * Integrates all intelligence systems for superhuman emotional awareness
 */
declare function buildDeepUnderstanding(input: ContextBuilderInput): Promise<ContextInjection[]>;
export declare function recordResponse(sessionId: string, response: string): void;
export { buildDeepUnderstanding };
//# sourceMappingURL=deep-understanding.d.ts.map