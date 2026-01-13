/**
 * Conversational Imperfections Context Builder
 *
 * "Actually wait, let me rephrase that..."
 *
 * Philosophy: Perfect speech feels robotic. Real conversations have:
 * - Mid-sentence course corrections
 * - Word-finding pauses
 * - Thought pivots
 * - Self-interruptions
 * - Trailing off
 * - Restatements for clarity
 *
 * This injects humanizing imperfections into Ferni's responses.
 *
 * @module intelligence/context-builders/conversational-imperfections
 */
import { type ContextBuilder } from '../index.js';
export declare const conversationalImperfectionsBuilder: ContextBuilder;
/**
 * Clear session state (for testing)
 */
export declare function clearSessionImperfections(sessionId: string): void;
/**
 * Get imperfection stats for debugging
 */
export declare function getImperfectionStats(sessionId: string): {
    totalUsed: number;
    types: string[];
} | null;
export default conversationalImperfectionsBuilder;
//# sourceMappingURL=conversational-imperfections.d.ts.map