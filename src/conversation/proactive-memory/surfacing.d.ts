/**
 * Proactive Surfacing
 *
 * Generates suggestions for proactively surfacing memories.
 * Handles time-based, topic-based, pattern-based, and opening suggestions.
 *
 * @module conversation/proactive-memory/surfacing
 */
import type { PatternDetection, ProactiveMemorySuggestion, StoredMemory, SuggestionContext } from './types.js';
export declare class SurfacingEngine {
    private currentSessionId;
    constructor(sessionId: string);
    /**
     * Get opening suggestion for session start
     */
    getOpeningSuggestion(memories: StoredMemory[]): ProactiveMemorySuggestion | null;
    /**
     * Get time-based suggestions
     */
    getTimeBasedSuggestions(memories: StoredMemory[], now: Date): ProactiveMemorySuggestion[];
    /**
     * Get topic-based suggestions
     */
    getTopicBasedSuggestions(memories: StoredMemory[], currentTopic: string): ProactiveMemorySuggestion[];
    /**
     * Get pattern-based suggestions
     */
    getPatternBasedSuggestions(patterns: PatternDetection[], context: SuggestionContext): ProactiveMemorySuggestion[];
}
//# sourceMappingURL=surfacing.d.ts.map