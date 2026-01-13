/**
 * Behavioral Pattern Detector
 *
 * Detects recurring behavioral patterns across conversations.
 * Helps personas respond appropriately to user tendencies.
 *
 * Philosophy: The deepest kind of understanding isn't remembering what someone
 * said, but noticing patterns they might not even see themselves. "You always
 * doubt yourself before big decisions, but you always figure it out."
 *
 * @module memory/behavioral-pattern-detector
 */
import type { BehavioralPatternDetector as BehavioralPatternDetectorInterface, BehavioralPattern, PatternType, ConversationTurn } from './interfaces/index.js';
interface PatternDefinition {
    type: PatternType;
    description: string;
    implication: string;
    suggestedResponse: string;
    detectPatterns: {
        /** Regex patterns that indicate this behavior */
        indicators: RegExp[];
        /** Minimum matches to consider a potential pattern */
        minMatches: number;
        /** Context indicators (what situation they're in when this happens) */
        contextIndicators?: RegExp[];
    };
}
export declare class BehavioralPatternDetectorImpl implements BehavioralPatternDetectorInterface {
    private patterns;
    /**
     * Analyze conversation turns for behavioral patterns
     */
    analyzeForPatterns(turns: ConversationTurn[], existingPatterns: BehavioralPattern[]): Promise<BehavioralPattern[]>;
    /**
     * Get all patterns for a user
     */
    getPatterns(userId: string): Promise<BehavioralPattern[]>;
    /**
     * Save patterns for a user
     */
    savePatterns(userId: string, patterns: BehavioralPattern[]): Promise<void>;
    /**
     * Get guidance based on currently active patterns
     */
    getActivePatternGuidance(userId: string, currentContext: string): Promise<{
        activePattern: BehavioralPattern | null;
        guidance: string;
    }>;
    /**
     * Get context around a turn (previous user message + assistant response)
     */
    private getContext;
    export(): Array<[string, BehavioralPattern[]]>;
    import(data: Array<[string, BehavioralPattern[]]>): void;
    /**
     * Get stats
     */
    getStats(userId: string): {
        totalPatterns: number;
        highConfidencePatterns: string[];
        mostFrequent: PatternType | null;
    };
}
export declare function getBehavioralPatternDetector(): BehavioralPatternDetectorInterface;
/**
 * Load patterns from Firestore for a user (call once per session)
 */
export declare function loadPatternsFromPersistence(userId: string): Promise<void>;
/**
 * Save patterns to Firestore
 */
export declare function savePatternsToPeristence(userId: string): Promise<void>;
export declare function resetBehavioralPatternDetector(): void;
declare const _default: {
    BehavioralPatternDetectorImpl: typeof BehavioralPatternDetectorImpl;
    getBehavioralPatternDetector: typeof getBehavioralPatternDetector;
    loadPatternsFromPersistence: typeof loadPatternsFromPersistence;
    savePatternsToPeristence: typeof savePatternsToPeristence;
    resetBehavioralPatternDetector: typeof resetBehavioralPatternDetector;
    PATTERN_DEFINITIONS: PatternDefinition[];
};
export default _default;
//# sourceMappingURL=behavioral-pattern-detector.d.ts.map