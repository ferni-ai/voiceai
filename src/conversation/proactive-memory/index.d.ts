/**
 * Proactive Memory Surfacing
 *
 * > "We believe in making AI human, and the decisions we make will reflect that."
 *
 * This is a SUPERHUMAN capability: surfacing memories BEFORE the user mentions them.
 * A human friend might eventually remember "oh right, you had that interview!"
 * Ferni proactively brings it up, creating the "they actually care" feeling.
 *
 * @module conversation/proactive-memory
 */
import type { CaptureContext, PatternDetection, ProactiveMemorySuggestion, StoredMemory, SuggestionContext } from './types.js';
export type { CaptureContext, MemoryType, PatternDetection, ProactiveMemorySuggestion, StoredMemory, SuggestionContext, } from './types.js';
export declare class ProactiveMemoryEngine {
    private memories;
    private patternDetector;
    private surfacing;
    private turnCount;
    private sessionStartTime;
    private currentSessionId;
    constructor(sessionId: string);
    /**
     * Process user message and extract memorable content
     */
    captureFromMessage(text: string, context: CaptureContext): void;
    /**
     * Add a memory directly
     */
    addMemory(memory: Omit<StoredMemory, 'id' | 'mentionedAt' | 'surfaced' | 'surfaceCount' | 'sessionId'>): void;
    private trimMemories;
    /**
     * Get suggestions for what to proactively surface
     */
    getSuggestions(context: SuggestionContext): ProactiveMemorySuggestion[];
    /**
     * Mark a memory as surfaced
     */
    markSurfaced(memoryId: string): void;
    /**
     * Acknowledge a pattern
     */
    acknowledgePattern(type: PatternDetection['type']): void;
    /**
     * Import memories from profile persistence
     */
    importMemories(memories: StoredMemory[]): void;
    /**
     * Export memories for profile persistence
     */
    exportMemories(): StoredMemory[];
    /**
     * Export patterns for persistence
     */
    exportPatterns(): PatternDetection[];
    /**
     * Import patterns from persistence
     */
    importPatterns(patterns: PatternDetection[]): void;
    /**
     * Reset for new session (preserves memories)
     */
    reset(): void;
    /**
     * Clear all data
     */
    clearAll(): void;
    /**
     * Get all memories for debugging
     */
    getAllMemories(): StoredMemory[];
    /**
     * Get all patterns for debugging
     */
    getAllPatterns(): PatternDetection[];
}
export declare function getProactiveMemoryEngine(sessionId: string): ProactiveMemoryEngine;
export declare function resetProactiveMemoryEngine(sessionId: string): void;
export declare function clearProactiveMemoryEngine(sessionId: string): void;
export declare function hasProactiveMemoryEngine(sessionId: string): boolean;
export declare function getActiveProactiveMemoryCount(): number;
export default ProactiveMemoryEngine;
//# sourceMappingURL=index.d.ts.map