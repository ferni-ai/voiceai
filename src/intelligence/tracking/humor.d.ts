/**
 * Humor Calibration Engine
 *
 * Learns what types of humor resonate with each user through:
 * - Tracking humor usage and user reactions
 * - Detecting laughter/engagement signals in voice and text
 * - Building personalized humor preferences
 * - Providing real-time guidance on when/how to be funny
 *
 * Humor Types:
 * - callbacks: Referencing earlier jokes/moments
 * - self_deprecating: Making fun of oneself
 * - observational: Commenting on shared situations
 * - dry_wit: Subtle, understated humor
 * - puns: Wordplay and word jokes
 * - playful: Light teasing and banter
 * - absurdist: Unexpected/surreal humor
 */
export type HumorType = 'callbacks' | 'self_deprecating' | 'observational' | 'dry_wit' | 'puns' | 'playful' | 'absurdist';
export type HumorReaction = 'laughed' | 'engaged' | 'acknowledged' | 'ignored' | 'negative';
export interface HumorAttempt {
    id: string;
    timestamp: Date;
    type: HumorType;
    content: string;
    context: string;
    reaction?: HumorReaction;
    reactionTimestamp?: Date;
}
export interface HumorPreferences {
    typeScores: Record<HumorType, number>;
    goodContexts: string[];
    badContexts: string[];
    preferredFrequency: 'frequent' | 'moderate' | 'rare';
    preferredTiming: 'early' | 'rapport_built' | 'tension_break';
    totalAttempts: number;
    positiveReactions: number;
    averageScore: number;
    shouldUseHumor: boolean;
    recommendedTypes: HumorType[];
}
export interface HumorGuidance {
    shouldAttempt: boolean;
    recommendedType?: HumorType;
    suggestedApproach?: string;
    avoidTypes: HumorType[];
    contextNote?: string;
    confidence: number;
}
export declare class HumorCalibrationEngine {
    private attempts;
    private pendingAttempt;
    private userLaughsDetected;
    private sessionHumorCount;
    constructor();
    /**
     * Record when humor is used in a response
     */
    recordHumorAttempt(content: string, context: string, type?: HumorType): string;
    /**
     * Detect what type of humor was used
     */
    private detectHumorType;
    /**
     * Analyze user response for humor reaction
     */
    analyzeReaction(userResponse: string, userLaughed?: boolean): HumorReaction | null;
    /**
     * Record voice-detected laughter
     */
    recordVoiceLaughter(): void;
    /**
     * Calculate humor preferences from history
     */
    calculatePreferences(): HumorPreferences;
    private reactionToScore;
    /**
     * Get guidance on whether/how to use humor now
     */
    getHumorGuidance(currentContext: string, currentEmotion?: string, turnCount?: number): HumorGuidance;
    private getSuggestedApproach;
    /**
     * Format guidance for LLM context injection
     */
    formatGuidanceForPrompt(): string;
    /**
     * Reset for new session
     */
    reset(): void;
    /**
     * Get session stats
     */
    getSessionStats(): {
        humorAttempts: number;
        laughsDetected: number;
        pendingReaction: boolean;
    };
}
export declare function getHumorCalibration(userId: string): HumorCalibrationEngine;
export declare function removeHumorCalibration(userId: string): void;
export declare function resetAllHumorCalibration(): void;
//# sourceMappingURL=humor.d.ts.map