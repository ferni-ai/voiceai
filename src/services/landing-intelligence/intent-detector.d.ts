/**
 * Intent Detector
 *
 * Analyzes visitor behavior signals to infer intent and optimize content.
 * Uses Gemini for sophisticated pattern analysis.
 *
 * @module services/landing-intelligence/intent-detector
 */
export interface BehaviorSignals {
    /** Scroll pattern based on speed and pauses */
    scrollPattern: 'scanning' | 'reading' | 'searching' | 'bouncing';
    /** Sections they spent time on */
    sectionsViewed: string[];
    /** Time spent per section in seconds */
    timePerSection: Record<string, number>;
    /** Scroll depth percentage */
    scrollDepth: number;
    /** Total time on page in seconds */
    timeOnPage: number;
    /** Number of clicks (excluding navigation) */
    clickCount: number;
    /** Sections they hovered over but didn't engage */
    sectionsHovered: string[];
    /** Mouse movement pattern */
    mousePattern: 'calm' | 'erratic' | 'decisive' | 'hesitant';
    /** CTA hover without click */
    ctaHoverWithoutClick: boolean;
    /** Scroll direction changes (indicates searching) */
    scrollReversals: number;
    /** Device type */
    device: 'mobile' | 'tablet' | 'desktop';
    /** Referrer source category */
    referrerType: 'search' | 'social' | 'direct' | 'ad' | 'referral' | 'unknown';
}
export interface VisitorIntent {
    /** Primary concern or need */
    primaryConcern: 'anxiety' | 'loneliness' | 'career' | 'relationship' | 'habits' | 'overwhelm' | 'self-improvement' | 'curiosity' | 'unknown';
    /** Where they are in the buying journey */
    buyingStage: 'awareness' | 'consideration' | 'decision' | 'skeptical';
    /** Confidence in this assessment (0-1) */
    confidence: number;
    /** Emotional state indicators */
    emotionalState: 'calm' | 'anxious' | 'hopeful' | 'skeptical' | 'urgent';
    /** What content would resonate */
    recommendedContent: string[];
    /** Suggested action to take */
    suggestedAction: string;
    /** Why we think this */
    reasoning: string;
}
export interface IntentDetectionResult {
    intent: VisitorIntent;
    signals: BehaviorSignals;
    timestamp: Date;
}
export declare function detectVisitorIntent(signals: BehaviorSignals): Promise<IntentDetectionResult>;
export interface AggregatedIntentData {
    totalVisitors: number;
    concernDistribution: Record<VisitorIntent['primaryConcern'], number>;
    stageDistribution: Record<VisitorIntent['buyingStage'], number>;
    averageConfidence: number;
    topRecommendedContent: string[];
}
export declare function aggregateIntentData(results: IntentDetectionResult[]): AggregatedIntentData;
//# sourceMappingURL=intent-detector.d.ts.map