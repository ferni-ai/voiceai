/**
 * Insight Generation Engine - Types
 *
 * Types for the superhuman insight generation system that transforms
 * captured data into proactive, surfaceable insights.
 *
 * @module services/superhuman/insight-generation/types
 */
/**
 * The 10 categories of superhuman insights we generate
 */
export type InsightCategory = 'cross_domain_correlation' | 'unspoken_awareness' | 'voice_content_mismatch' | 'growth_trajectory' | 'relationship_network' | 'commitment_pattern' | 'temporal_rhythm' | 'dream_decay' | 'anticipatory' | 'first_time_celebration';
/**
 * Priority levels for insight surfacing
 */
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';
/**
 * When an insight should be surfaced
 */
export type SurfacingMoment = 'session_start' | 'natural_pause' | 'topic_relevant' | 'check_in' | 'celebration' | 'gentle_probe' | 'end_of_session';
/**
 * Tone guidance for how to deliver the insight
 */
export type InsightTone = 'warm_observation' | 'gentle_curiosity' | 'celebratory' | 'protective_care' | 'reflective' | 'playful' | 'direct_but_kind';
/**
 * A generated insight ready for surfacing
 */
export interface GeneratedInsight {
    id: string;
    userId: string;
    category: InsightCategory;
    priority: InsightPriority;
    headline: string;
    message: string;
    evidence: string[];
    surfacingMoment: SurfacingMoment;
    tone: InsightTone;
    triggerTopics?: string[];
    triggerEmotions?: string[];
    triggerPerson?: string;
    generatedAt: Date;
    expiresAt?: Date;
    confidence: number;
    dataPoints: number;
    surfaced: boolean;
    surfacedAt?: Date;
    userReaction?: 'acknowledged' | 'deflected' | 'explored' | 'rejected';
    dismissed: boolean;
}
/**
 * Context available to insight generators
 */
export interface InsightGeneratorContext {
    userId?: string;
    currentEmotion?: string;
    currentTopic?: string;
    currentPerson?: string;
    isSessionStart?: boolean;
    hourOfDay?: number;
    dayOfWeek?: number;
    recentTopics?: string[];
    voiceMetrics?: {
        energy?: number;
        stress?: number;
        pace?: number;
    };
}
/**
 * Base interface for all insight generators
 */
export interface InsightGenerator {
    category: InsightCategory;
    name: string;
    description: string;
    /**
     * Generate insights for a user
     * @param userId - The user ID
     * @param context - Current context for relevance filtering
     * @returns Array of generated insights (may be empty)
     */
    generate(userId: string, context: InsightGeneratorContext): Promise<GeneratedInsight[]>;
    /**
     * Check if this generator has enough data to produce insights
     */
    hasEnoughData(userId: string): Promise<boolean>;
}
/**
 * Cross-domain correlation data
 */
export interface CorrelationInsightData {
    domain1: string;
    domain2: string;
    pattern1: string;
    pattern2: string;
    correlation: 'positive' | 'negative';
    strength: number;
    occurrences: number;
    examples: Array<{
        date: Date;
        domain1Value: string;
        domain2Value: string;
    }>;
}
/**
 * Unspoken/avoidance data
 */
export interface UnspokenInsightData {
    topic: string;
    lastMentioned?: Date;
    mentionCount: number;
    recentMentions: number;
    deflectionCount: number;
    relatedContext?: string;
    sensitivity: 'low' | 'medium' | 'high';
}
/**
 * Voice-content mismatch data
 */
export interface VoiceContentMismatchData {
    statement: string;
    declaredEmotion: string;
    detectedEmotion: string;
    voiceMetrics: {
        energy: number;
        stress: number;
        confidence: number;
    };
    frequency: number;
    timestamp: Date;
}
/**
 * Growth trajectory data
 */
export interface GrowthTrajectoryData {
    area: string;
    startingPoint: {
        description: string;
        date: Date;
        severity?: number;
    };
    currentPoint: {
        description: string;
        date: Date;
        severity?: number;
    };
    milestones: Array<{
        description: string;
        date: Date;
    }>;
    progressPercentage: number;
}
/**
 * Relationship insight data
 */
export interface RelationshipInsightData {
    personName: string;
    relationship: string;
    mentionCount: number;
    recentMentionCount: number;
    averageSentiment: number;
    energyImpact: 'energizing' | 'neutral' | 'draining';
    topicsDiscussed: string[];
    lastMentioned?: Date;
    silenceDays?: number;
}
/**
 * Commitment pattern data
 */
export interface CommitmentPatternData {
    commitmentType: string;
    totalCommitments: number;
    keptCount: number;
    brokenCount: number;
    keepRate: number;
    commonReasons?: string[];
    bestDays?: string[];
    averageDaysToComplete?: number;
}
/**
 * Temporal rhythm data
 */
export interface TemporalRhythmData {
    timeframe: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'seasonal';
    pattern: string;
    timeKey: string;
    emotionalTrend: 'positive' | 'negative' | 'mixed';
    intensity: number;
    occurrences: number;
    recentOccurrences: number;
}
/**
 * Dream decay data
 */
export interface DreamDecayData {
    dream: string;
    category: string;
    firstMentioned: Date;
    lastMentioned: Date;
    mentionCount: number;
    initialExcitement: number;
    daysSilent: number;
    status: 'active' | 'dormant' | 'abandoned' | 'achieved';
}
/**
 * Anticipatory data
 */
export interface AnticipatoryData {
    upcomingEvent: string;
    eventDate: Date;
    daysUntil: number;
    historicalPattern?: {
        description: string;
        typicalOnset: number;
        typicalIntensity: number;
    };
    preparationOpportunity: string;
}
/**
 * First-time celebration data
 */
export interface FirstTimeCelebrationData {
    topic: string;
    firstSharedDate: Date;
    subsequentMentions: number;
    daysSinceFirstShare: number;
    depth: 'surface' | 'moderate' | 'deep' | 'profound';
    growthSince: string;
}
/**
 * Options for querying insights
 */
export interface InsightQueryOptions {
    categories?: InsightCategory[];
    minPriority?: InsightPriority;
    surfacingMoments?: SurfacingMoment[];
    triggerTopic?: string;
    triggerEmotion?: string;
    triggerPerson?: string;
    includeExpired?: boolean;
    includeSurfaced?: boolean;
    includeDismissed?: boolean;
    limit?: number;
}
/**
 * Result of insight generation run
 */
export interface InsightGenerationResult {
    userId: string;
    generatedAt: Date;
    insights: GeneratedInsight[];
    byCategory: Record<InsightCategory, number>;
    totalGenerated: number;
    errors: string[];
}
//# sourceMappingURL=types.d.ts.map