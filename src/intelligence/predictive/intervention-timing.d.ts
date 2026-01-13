/**
 * Intervention Timing Optimization - Better Than Human v4
 *
 * > "We know the exact right moment for every type of support."
 *
 * SUPERHUMAN CAPABILITY: Learn the optimal timing for specific types
 * of interventions for each user.
 *
 * Not just "when to reach out" but "when to challenge vs validate vs
 * celebrate vs stay silent" - for THIS specific person.
 *
 * A human friend might know you're a morning person, but can't:
 * - Track which interventions work at which times
 * - Know when challenges land vs when they backfire
 * - Learn your personal rhythm for different support types
 * - Optimize based on emotional state, topic, and timing together
 *
 * @module intelligence/predictive/intervention-timing
 */
/** Types of interventions we can time */
export type InterventionType = 'gentle_challenge' | 'reframe_suggestion' | 'habit_reminder' | 'emotional_check_in' | 'celebration' | 'hard_truth' | 'silence' | 'proactive_outreach' | 'deep_question' | 'practical_advice' | 'validation' | 'accountability' | 'encouragement' | 'perspective_shift' | 'grounding' | 'humor' | 'boundary_support' | 'presence';
/** Conditions for optimal timing */
export interface OptimalConditions {
    /** Best emotional states for this intervention */
    emotionalStates: string[];
    /** Required context/topics */
    requiredContext: string[];
    /** Best time of day */
    timeOfDay: ('morning' | 'afternoon' | 'evening' | 'night' | 'early_evening' | 'late_night' | 'any')[];
    /** Best days of week */
    dayOfWeek: number[];
    /** Days since last meaningful conversation */
    recencyRange: {
        min: number;
        max: number;
    };
    /** Contraindications - when NOT to do this */
    contraindications: string[];
}
/** Intervention outcome */
export interface InterventionOutcome {
    interventionType: InterventionType;
    timestamp: number;
    conditions: {
        emotionalState?: string;
        topic?: string;
        timeOfDay: string;
        dayOfWeek: number;
        daysSinceLastConversation: number;
    };
    outcome: 'positive' | 'neutral' | 'negative';
    /** How they responded */
    responseType: 'accepted' | 'deflected' | 'rejected' | 'ignored' | 'engaged';
    /** Did it achieve the intended effect? */
    effectivenessScore: number;
    /** Notes about what happened */
    notes?: string;
}
/** Learned timing pattern */
export interface TimingPattern {
    interventionType: InterventionType;
    /** Optimal conditions learned for this user */
    optimalConditions: OptimalConditions;
    /** Historical success rate */
    successRate: number;
    /** Number of observations */
    observations: number;
    /** Confidence in pattern */
    confidence: number;
    /** Last updated */
    lastUpdated: number;
}
/** Timing recommendation */
export interface TimingRecommendation {
    interventionType: InterventionType;
    /** Should we do this now? */
    recommended: boolean;
    /** How good is now for this intervention? (0-1) */
    optimalityScore: number;
    /** Why or why not */
    reasoning: string;
    /** Better alternative if not recommended */
    alternative?: {
        type: InterventionType;
        optimalityScore: number;
    };
    /** When would be better */
    betterTiming?: string;
    /** Risk of doing it now */
    riskLevel: 'low' | 'moderate' | 'high';
    /** Historical success at this time */
    historicalSuccess: number;
}
/**
 * Record an intervention outcome
 *
 * @param userId - User ID
 * @param outcome - What happened
 */
export declare function recordInterventionOutcome(userId: string, outcome: Omit<InterventionOutcome, 'timestamp'>): void;
/**
 * Record a quick success/failure for an intervention
 *
 * @param userId - User ID
 * @param interventionType - What was tried
 * @param success - Did it work?
 * @param context - Current context
 */
export declare function recordQuickOutcome(userId: string, interventionType: InterventionType, success: boolean, context?: {
    emotionalState?: string;
    topic?: string;
}): void;
/**
 * Get recommendation for a specific intervention
 *
 * @param userId - User ID
 * @param interventionType - What intervention to evaluate
 * @param context - Current context
 * @returns Timing recommendation
 */
export declare function getTimingRecommendation(userId: string, interventionType: InterventionType, context?: {
    emotionalState?: string;
    topic?: string;
    daysSinceLastConversation?: number;
}): TimingRecommendation;
/**
 * Get all intervention recommendations for current moment
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns All recommendations sorted by optimality
 */
export declare function getAllTimingRecommendations(userId: string, context?: {
    emotionalState?: string;
    topic?: string;
    daysSinceLastConversation?: number;
}): TimingRecommendation[];
/**
 * Get the best intervention for right now
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns Best recommendation
 */
export declare function getBestIntervention(userId: string, context?: {
    emotionalState?: string;
    topic?: string;
    daysSinceLastConversation?: number;
}): TimingRecommendation;
/**
 * Build intervention timing context for LLM injection
 *
 * @param userId - User ID
 * @param context - Current context
 * @returns Context string for prompt injection
 */
export declare function buildInterventionTimingContext(userId: string, context?: {
    emotionalState?: string;
    topic?: string;
}): string;
export declare const interventionTiming: {
    recordInterventionOutcome: typeof recordInterventionOutcome;
    recordQuickOutcome: typeof recordQuickOutcome;
    getTimingRecommendation: typeof getTimingRecommendation;
    getAllTimingRecommendations: typeof getAllTimingRecommendations;
    getBestIntervention: typeof getBestIntervention;
    buildInterventionTimingContext: typeof buildInterventionTimingContext;
};
export default interventionTiming;
//# sourceMappingURL=intervention-timing.d.ts.map