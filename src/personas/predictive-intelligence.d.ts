/**
 * Predictive Intelligence Loader
 *
 * > "We hear what you're not saying."
 *
 * Loads and processes predictive intelligence behaviors from persona bundles.
 * Detects patterns, generates proactive follow-ups, and anticipates user needs.
 */
import type { EmotionalTrajectory, RelationshipMemory } from './relationship-memory/types.js';
/**
 * Pattern detection result
 */
export interface DetectedPattern {
    patternId: string;
    patternType: 'temporal' | 'emotional' | 'behavioral' | 'habit' | 'existential' | 'wisdom';
    name: string;
    description: string;
    confidence: number;
    triggers: string[];
    proactiveResponses: string[];
}
/**
 * Proactive follow-up suggestion
 */
export interface ProactiveFollowUp {
    type: string;
    timing: string;
    phrases: string[];
    context?: string;
}
/**
 * Anticipatory insight
 */
export interface AnticipatoryInsight {
    category: 'seasonal' | 'life_stage' | 'temporal' | 'spiritual' | 'behavioral';
    id: string;
    period?: string;
    detection?: string;
    proactiveResponses: string[];
}
/**
 * Concern detection result
 */
export interface DetectedConcern {
    concernId: string;
    severity: 'low' | 'medium' | 'high';
    detection: string;
    responses: string[];
}
/**
 * Complete predictive intelligence for a persona
 */
export interface PredictiveIntelligence {
    personaId: string;
    patterns: {
        temporal: Record<string, PatternConfig>;
        emotional: Record<string, PatternConfig>;
        behavioral: Record<string, PatternConfig>;
    };
    proactiveFollowUps: Record<string, ProactiveFollowUpConfig>;
    anticipatoryInsights: {
        seasonal?: Record<string, SeasonalConfig>;
        lifeStage?: Record<string, LifeStageConfig>;
        temporal?: Record<string, TemporalConfig>;
    };
    concernDetection?: {
        warningSigns: Record<string, ConcernConfig>;
    };
    usageRules: UsageRules;
}
interface PatternConfig {
    triggers?: string[];
    detection: string;
    insight?: string;
    response?: string[];
    proactive_response?: string[];
}
interface ProactiveFollowUpConfig {
    timing: string;
    phrases: string[];
}
interface SeasonalConfig {
    period: string;
    proactive: string[];
}
interface LifeStageConfig {
    detection: string;
    proactive: string[];
}
interface TemporalConfig {
    detection: string;
    proactive: string[];
}
interface ConcernConfig {
    detection: string;
    response: string[];
}
interface UsageRules {
    pattern_recognition_min_sessions: number;
    proactive_followup_min_sessions: number;
    concern_detection_immediate?: boolean;
    max_proactive_mentions_per_session: number;
    min_sessions_between_same_pattern: number;
    seasonal_insights_per_season?: number;
}
export interface PatternMatchContext {
    /** Current message text */
    currentMessage: string;
    /** Current time */
    timestamp: Date;
    /** Day of week (0-6, Sunday = 0) */
    dayOfWeek: number;
    /** Hour of day (0-23) */
    hour: number;
    /** User's relationship memory */
    relationshipMemory?: RelationshipMemory;
    /** Recent topics discussed */
    recentTopics?: string[];
    /** Recent emotional trajectory */
    emotionalTrajectory?: EmotionalTrajectory;
    /** Session number */
    sessionNumber: number;
}
/**
 * Load predictive intelligence for a persona
 */
export declare function loadPredictiveIntelligence(personaId: string): Promise<PredictiveIntelligence | null>;
/**
 * Detect patterns in the current context
 */
export declare function detectPatterns(personaId: string, context: PatternMatchContext): Promise<DetectedPattern[]>;
/**
 * Get proactive follow-up suggestions
 */
export declare function getProactiveFollowUps(personaId: string, context: PatternMatchContext): Promise<ProactiveFollowUp[]>;
/**
 * Detect potential concerns
 */
export declare function detectConcerns(personaId: string, context: PatternMatchContext): Promise<DetectedConcern[]>;
/**
 * Get anticipatory insights based on current date/context
 */
export declare function getAnticipatoryInsights(personaId: string, context: PatternMatchContext): Promise<AnticipatoryInsight[]>;
/**
 * Complete predictive analysis result
 */
export interface PredictiveAnalysis {
    patterns: DetectedPattern[];
    followUps: ProactiveFollowUp[];
    concerns: DetectedConcern[];
    insights: AnticipatoryInsight[];
    promptInjection: string;
}
/**
 * Run complete predictive analysis
 */
export declare function analyzePredictively(personaId: string, context: PatternMatchContext): Promise<PredictiveAnalysis>;
declare const _default: {
    loadPredictiveIntelligence: typeof loadPredictiveIntelligence;
    detectPatterns: typeof detectPatterns;
    getProactiveFollowUps: typeof getProactiveFollowUps;
    detectConcerns: typeof detectConcerns;
    getAnticipatoryInsights: typeof getAnticipatoryInsights;
    analyzePredictively: typeof analyzePredictively;
};
export default _default;
//# sourceMappingURL=predictive-intelligence.d.ts.map