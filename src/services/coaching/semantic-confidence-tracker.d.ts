/**
 * Semantic Confidence Tracker
 *
 * Tracks detection confidence over time to identify pattern gaps.
 * Helps improve semantic matching by learning from failures.
 *
 * Key features:
 * - Tracks confidence scores for each detection type
 * - Identifies low-confidence patterns that need improvement
 * - Surfaces most common unmatched phrases
 * - Provides analytics for pattern tuning
 *
 * @module SemanticConfidenceTracker
 */
export type DetectionDomain = 'handoff' | 'calendar' | 'trust' | 'music' | 'contact' | 'habit';
export interface DetectionRecord {
    domain: DetectionDomain;
    timestamp: Date;
    userMessage: string;
    detectedType: string;
    confidence: number;
    wasCorrect?: boolean;
    matchedPatterns: string[];
}
export interface DomainStats {
    domain: DetectionDomain;
    totalDetections: number;
    averageConfidence: number;
    lowConfidenceCount: number;
    highConfidenceCount: number;
    missedDetections: number;
    commonMisses: Array<{
        phrase: string;
        count: number;
        expectedType?: string;
    }>;
    confidenceDistribution: {
        '0-0.3': number;
        '0.3-0.5': number;
        '0.5-0.7': number;
        '0.7-1.0': number;
    };
}
export interface PatternGap {
    domain: DetectionDomain;
    phrase: string;
    frequency: number;
    suggestedType?: string;
    suggestedPattern?: string;
}
/**
 * Record a detection attempt
 */
export declare function recordDetection(domain: DetectionDomain, userMessage: string, detectedType: string, confidence: number, matchedPatterns?: string[]): void;
/**
 * Mark a detection as correct or incorrect (for learning)
 */
export declare function recordFeedback(domain: DetectionDomain, userMessage: string, wasCorrect: boolean): void;
/**
 * Get statistics for a domain
 */
export declare function getDomainStats(domain: DetectionDomain): DomainStats;
/**
 * Get all domain statistics
 */
export declare function getAllStats(): DomainStats[];
/**
 * Identify pattern gaps that need improvement
 */
export declare function identifyPatternGaps(): PatternGap[];
/**
 * Generate a report for pattern improvement
 */
export declare function generateImprovementReport(): string;
/**
 * Clear tracking data (for testing)
 */
export declare function clearTrackingData(domain?: DetectionDomain): void;
//# sourceMappingURL=semantic-confidence-tracker.d.ts.map