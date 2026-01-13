/**
 * Energy Wave Mapping - Better Than Human Timing Intelligence
 *
 * Maps when users are most receptive to different types of interactions:
 * - Peak times for deep conversations
 * - Best times for practical planning
 * - When they're most open to vulnerability
 * - Energy patterns throughout the day/week
 *
 * WHY IT'S SUPERHUMAN: Ferni knows to save heavy conversations for
 * Sunday mornings (when you're reflective) vs Friday nights (when you want light chat).
 *
 * @module services/superhuman/energy-wave-mapping
 */
export type ConversationType = 'deep_emotional' | 'practical_planning' | 'light_chat' | 'problem_solving' | 'creative' | 'reflective' | 'motivational' | 'learning';
export type EnergyLevel = 'high' | 'medium' | 'low' | 'variable';
export interface ConversationInteraction {
    userId: string;
    type: ConversationType;
    dayOfWeek: number;
    hourOfDay: number;
    engagement: number;
    depth: number;
    outcome: 'positive' | 'neutral' | 'negative';
    timestamp: number;
}
export interface TimeSlot {
    dayOfWeek: number;
    hourStart: number;
    hourEnd: number;
}
export interface EnergyWaveProfile {
    userId: string;
    /** Best times for each conversation type */
    optimalTimes: Record<ConversationType, TimeSlot[]>;
    /** Times to avoid heavy topics */
    lowEnergyTimes: TimeSlot[];
    /** General energy pattern */
    dailyPattern: {
        peakHours: number[];
        lowHours: number[];
    };
    /** Weekly pattern */
    weeklyPattern: {
        highEnergyDays: number[];
        lowEnergyDays: number[];
    };
    /** Last updated */
    lastUpdated: number;
}
export interface TimingRecommendation {
    conversationType: ConversationType;
    isGoodTime: boolean;
    confidence: number;
    reason: string;
    betterTimes?: string[];
}
/**
 * Record a conversation interaction for pattern learning.
 */
export declare function recordInteraction(userId: string, type: ConversationType, engagement: number, depth: number, outcome: 'positive' | 'neutral' | 'negative'): Promise<void>;
/**
 * Load interaction history.
 */
export declare function loadInteractions(userId: string, daysBack?: number): Promise<ConversationInteraction[]>;
/**
 * Analyze interactions to build energy wave profile.
 */
export declare function analyzeEnergyPatterns(interactions: ConversationInteraction[]): EnergyWaveProfile | null;
/**
 * Get timing recommendation for a conversation type.
 */
export declare function getTimingRecommendation(conversationType: ConversationType, profile: EnergyWaveProfile | null): TimingRecommendation;
/**
 * Build context for LLM injection.
 */
export declare function buildEnergyWaveContext(userId: string): Promise<string>;
export declare const energyWaveMapping: {
    record: typeof recordInteraction;
    load: typeof loadInteractions;
    analyze: typeof analyzeEnergyPatterns;
    getRecommendation: typeof getTimingRecommendation;
    buildContext: typeof buildEnergyWaveContext;
};
//# sourceMappingURL=energy-wave-mapping.d.ts.map