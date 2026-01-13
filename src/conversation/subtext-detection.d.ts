/**
 * Subtext Detection Engine
 *
 * > "We hear what you're not saying."
 *
 * Reads between the lines to detect what users really mean:
 *
 * - **Deflection**: "I'm fine" when they're not
 * - **Minimizing**: "It's not a big deal" when it IS
 * - **Testing Waters**: Gauging safety before revealing
 * - **Hidden Asks**: Wanting something but not saying it directly
 * - **Protective Denial**: Protecting themselves from vulnerability
 * - **Seeking Permission**: Wanting to talk but needing invitation
 *
 * This is SUPERHUMAN: detecting emotional truth beneath words.
 *
 * @module @ferni/subtext-detection
 */
export type SubtextType = 'deflection' | 'minimizing' | 'testing_waters' | 'hidden_ask' | 'protective_denial' | 'seeking_permission' | 'masked_emotion' | 'indirect_admission' | 'rhetorical_distance' | 'none';
export interface SubtextDetection {
    /** Type of subtext detected */
    type: SubtextType;
    /** Confidence in detection (0-1) */
    confidence: number;
    /** What we think they really mean */
    inferredMeaning: string;
    /** Evidence that led to detection */
    evidence: string[];
    /** Suggested gentle probe */
    gentleProbe: string | null;
    /** Whether to act on this detection */
    shouldAct: boolean;
}
export interface SubtextContext {
    userMessage: string;
    turnCount: number;
    recentTopics?: string[];
    previousSubtexts?: SubtextType[];
    emotionalState?: string;
    relationshipDepth: 'new' | 'developing' | 'established' | 'deep';
}
export declare class SubtextDetectionEngine {
    private detectionHistory;
    private lastDetectionTurn;
    private consecutiveDeflections;
    constructor();
    /**
     * Analyze a message for subtext
     *
     * @param context - Current conversation context
     * @returns Detection result with confidence and suggested response
     */
    detect(context: SubtextContext): SubtextDetection;
    /**
     * Check message against pattern set
     */
    private checkPatterns;
    /**
     * Determine if we should act on a detection
     */
    private shouldActOnDetection;
    /**
     * Generate inferred meaning based on subtext type
     */
    private generateInferredMeaning;
    /**
     * Get detection statistics
     */
    getStats(): {
        totalDetections: number;
        actedCount: number;
        typeBreakdown: Record<SubtextType, number>;
    };
    /**
     * Reset for new conversation
     */
    reset(): void;
}
export declare function getSubtextDetectionEngine(sessionId: string): SubtextDetectionEngine;
export declare function resetSubtextDetectionEngine(sessionId: string): void;
export declare function clearSubtextDetectionEngine(sessionId: string): void;
export declare function getActiveSubtextDetectionCount(): number;
export default SubtextDetectionEngine;
//# sourceMappingURL=subtext-detection.d.ts.map