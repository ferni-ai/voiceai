/**
 * Breakthrough Proximity Detection - Better Than Human v4
 *
 * > "We see the insight forming before you do."
 *
 * SUPERHUMAN CAPABILITY: Detect when users are approaching a breakthrough
 * and create optimal conditions for it to happen.
 *
 * A human mentor might sense "they're close to figuring something out" but can't:
 * - Systematically track the indicators across conversations
 * - Know the optimal catalyst question
 * - Understand what's blocking the breakthrough
 * - Create the precise conditions needed
 *
 * Breakthroughs have PATTERNS:
 * 1. Increased questioning of old beliefs
 * 2. More reflection and "I've been thinking" statements
 * 3. Circling back to the same topic from different angles
 * 4. Emotional intensity building around an issue
 * 5. Contradictions surfacing in their narrative
 *
 * @module intelligence/predictive/breakthrough-proximity
 */
/** Types of breakthroughs we can detect */
export type BreakthroughType = 'self_understanding' | 'pattern_recognition' | 'belief_shift' | 'emotional_release' | 'decision_clarity' | 'relationship_insight' | 'value_alignment' | 'forgiveness' | 'acceptance' | 'integration' | 'purpose_clarity' | 'boundary_recognition' | 'grief_movement' | 'identity_evolution';
/** Indicators that a breakthrough is approaching */
export interface BreakthroughIndicator {
    type: IndicatorType;
    strength: number;
    timestamp: number;
    content: string;
    topic: string;
}
export type IndicatorType = 'questioning_beliefs' | 'circling_topic' | 'increasing_reflection' | 'emotional_intensity' | 'contradiction_surfacing' | 'connecting_dots' | 'future_visualization' | 'past_reframing' | 'resistance_softening' | 'language_shift' | 'aha_adjacency' | 'vulnerability_increase' | 'asking_deeper_questions' | 'silence_processing';
/** What's blocking the breakthrough */
export interface BreakthroughBlockage {
    type: BlockageType;
    strength: number;
    description: string;
    addressingStrategy: string;
}
export type BlockageType = 'fear_of_change' | 'identity_threat' | 'grief_avoidance' | 'shame_protection' | 'relationship_stakes' | 'overwhelm' | 'intellectualization' | 'external_validation' | 'timing' | 'safety' | 'language_gap';
/** Breakthrough proximity assessment */
export interface BreakthroughProximity {
    userId: string;
    topic: string;
    potentialBreakthroughType: BreakthroughType;
    /** How close they are to the breakthrough */
    proximity: 'distant' | 'approaching' | 'imminent' | 'threshold';
    /** Probability of breakthrough in next conversation */
    probability: number;
    /** Confidence in our assessment */
    confidence: number;
    /** All indicators we've observed */
    indicators: BreakthroughIndicator[];
    /** What's blocking the breakthrough */
    blockages: BreakthroughBlockage[];
    /** The insight we predict they're approaching */
    predictedInsight: string;
    /** Optimal conditions to facilitate */
    optimalConditions: {
        conversationTone: ConversationTone;
        topics: string[];
        avoidTopics: string[];
        timing: string;
        environment: string;
        pacing: 'slow' | 'moderate' | 'follow_their_lead';
    };
    /** Questions that might catalyze the breakthrough */
    catalystQuestions: string[];
    /** What NOT to do */
    antiPatterns: string[];
    /** How valuable this breakthrough would be (0-1) */
    impactPotential: number;
}
type ConversationTone = 'socratic' | 'validating' | 'challenging' | 'witnessing' | 'reflecting' | 'grounding' | 'celebratory';
interface PastBreakthrough {
    topic: string;
    type: BreakthroughType;
    timestamp: number;
    precursorIndicators: IndicatorType[];
    catalystType: 'question' | 'reflection' | 'connection' | 'emotion' | 'external_event';
    timeFromFirstIndicator: number;
    impact: number;
}
/**
 * Record a breakthrough indicator
 *
 * @param userId - User ID
 * @param indicator - The observed indicator
 * @param topic - Topic this relates to
 */
export declare function recordIndicator(userId: string, indicator: Omit<BreakthroughIndicator, 'timestamp' | 'topic'>, topic: string): void;
/**
 * Record a blockage observation
 *
 * @param userId - User ID
 * @param topic - Topic this relates to
 * @param blockage - The observed blockage
 */
export declare function recordBlockage(userId: string, topic: string, blockage: Omit<BreakthroughBlockage, 'addressingStrategy'>): void;
/**
 * Record that a breakthrough happened
 *
 * @param userId - User ID
 * @param topic - Topic of the breakthrough
 * @param type - Type of breakthrough
 * @param catalyst - What triggered it
 */
export declare function recordBreakthrough(userId: string, topic: string, type: BreakthroughType, catalyst: PastBreakthrough['catalystType']): void;
/**
 * Assess how close a user is to a breakthrough on a topic
 *
 * @param userId - User ID
 * @param topic - Topic to assess
 * @returns Breakthrough proximity assessment
 */
export declare function assessProximity(userId: string, topic: string): BreakthroughProximity | null;
/**
 * Get all active breakthrough assessments for a user
 *
 * @param userId - User ID
 * @returns All proximity assessments sorted by probability
 */
export declare function getAllBreakthroughAssessments(userId: string): BreakthroughProximity[];
/**
 * Get imminent breakthroughs (high probability)
 *
 * @param userId - User ID
 * @returns High-probability breakthrough assessments
 */
export declare function getImminentBreakthroughs(userId: string): BreakthroughProximity[];
/**
 * Build breakthrough context for LLM injection
 *
 * @param userId - User ID
 * @returns Context string for prompt injection
 */
export declare function buildBreakthroughContext(userId: string): string;
export declare const breakthroughProximity: {
    recordIndicator: typeof recordIndicator;
    recordBlockage: typeof recordBlockage;
    recordBreakthrough: typeof recordBreakthrough;
    assessProximity: typeof assessProximity;
    getAllBreakthroughAssessments: typeof getAllBreakthroughAssessments;
    getImminentBreakthroughs: typeof getImminentBreakthroughs;
    buildBreakthroughContext: typeof buildBreakthroughContext;
};
export default breakthroughProximity;
//# sourceMappingURL=breakthrough-proximity.d.ts.map