/**
 * Hyper-Specific Quoted Memory
 *
 * The "magic" that makes Ferni's memory feel superhuman.
 * Extracts and stores specific quotable phrases that can be referenced back
 * with uncanny specificity: "That thing you said about feeling like a hamster wheel..."
 *
 * @module conversation/conversational-memory/quoted-memory
 */
import type { MemoryCallback, QuotedMemory, RecordMessageContext } from './types.js';
export declare class QuotedMemoryEngine {
    private quotedMemories;
    /**
     * Extract quotable phrases from user message
     */
    extractQuotedMemories(text: string, turn: number, context: RecordMessageContext): void;
    /**
     * Get a hyper-specific memory callback
     * Returns the most impactful unused quoted memory
     */
    getCallback(currentTurn: number): MemoryCallback | null;
    /**
     * Get all quoted memories for persistence
     */
    getAll(): QuotedMemory[];
    /**
     * Import quoted memories from a previous session
     */
    import(memories: QuotedMemory[]): void;
    /**
     * Reset all quoted memories
     */
    reset(): void;
    /**
     * Check if we have any quoted memories
     */
    hasMemories(): boolean;
    private trimToMax;
}
//# sourceMappingURL=quoted-memory.d.ts.map