/**
 * Semantic Intelligence Types
 *
 * "Better than Human" semantic persistence that connects dots
 * humans can't see, remembers trajectories not just moments,
 * and reveals growth patterns invisible to the user.
 *
 * @module services/superhuman/semantic-intelligence/types
 */
/**
 * Semantic embedding with metadata
 */
export interface SemanticVector {
    embedding: number[];
    text: string;
    timestamp: number;
    source: 'conversation' | 'memory' | 'pattern' | 'inference';
}
/**
 * Correlation between two semantic domains
 */
export interface SemanticCorrelation {
    id: string;
    userId: string;
    domainA: {
        type: CorrelationDomain;
        pattern: string;
        embedding?: number[];
    };
    domainB: {
        type: CorrelationDomain;
        pattern: string;
        embedding?: number[];
    };
    strength: number;
    confidence: number;
    observationCount: number;
    coOccurrences: CoOccurrence[];
    insight: string;
    insightType: InsightType;
    firstObserved: number;
    lastObserved: number;
    lastTriggered?: number;
}
export type CorrelationDomain = 'emotion' | 'topic' | 'person' | 'time' | 'energy' | 'behavior' | 'sleep' | 'work' | 'relationship' | 'health' | 'goal';
export type InsightType = 'causal' | 'predictive' | 'contextual' | 'protective' | 'amplifying';
export interface CoOccurrence {
    timestamp: number;
    contextSnippet: string;
    strengthAtTime: number;
}
/**
 * A point on the emotional trajectory
 */
export interface EmotionalWaypoint {
    timestamp: number;
    emotion: string;
    intensity: number;
    valence: number;
    arousal: number;
    context?: string;
    trigger?: string;
    embedding?: number[];
}
/**
 * An emotional arc over time
 */
export interface EmotionalArc {
    id: string;
    userId: string;
    theme: string;
    themeEmbedding?: number[];
    emotion?: string;
    triggers?: string[];
    frequency?: 'rare' | 'occasional' | 'frequent' | 'constant';
    intensity?: number;
    waypoints: EmotionalWaypoint[];
    phase: ArcPhase;
    trend: 'rising' | 'falling' | 'stable' | 'volatile';
    narrative: string;
    peakMoment?: {
        timestamp: number;
        description: string;
    };
    turningPoint?: {
        timestamp: number;
        description: string;
        catalyst?: string;
    };
    startedAt: number;
    lastUpdated: number;
    resolvedAt?: number;
}
export type ArcPhase = 'emerging' | 'building' | 'peak' | 'resolving' | 'resolved' | 'recurring';
/**
 * A person in the user's life and their semantic signature
 */
export interface RelationalNode {
    id: string;
    userId: string;
    name: string;
    relationship: string;
    aliases: string[];
    topicAssociations: TopicAssociation[];
    emotionalSignature: EmotionalSignature;
    mentionCount: number;
    lastMentioned: number;
    firstMentioned: number;
    averageValence: number;
    valenceVariance: number;
    insights: string[];
    supportLevel: 'draining' | 'neutral' | 'supportive' | 'energizing';
}
export interface TopicAssociation {
    topic: string;
    frequency: number;
    sentiment: number;
    embedding?: number[];
}
export interface EmotionalSignature {
    primaryEmotions: Array<{
        emotion: string;
        frequency: number;
    }>;
    triggerPatterns: string[];
    recoveryPatterns: string[];
}
/**
 * Edge in the relational graph
 */
export interface RelationalEdge {
    fromPerson: string;
    toPerson: string;
    connectionType: 'family' | 'work' | 'friend' | 'romantic' | 'unknown';
    interactionFrequency: number;
    jointSentiment: number;
}
/**
 * A decision point where advice was given
 */
export interface DecisionPoint {
    id: string;
    userId: string;
    advice: string;
    adviceEmbedding?: number[];
    context: string;
    timestamp: number;
    pathTaken: 'followed' | 'ignored' | 'modified' | 'unknown';
    followUpTimestamp?: number;
    outcome?: CounterfactualOutcome;
    lesson?: string;
    patternId?: string;
    domain?: string;
}
export interface CounterfactualOutcome {
    timestamp: number;
    result: 'positive' | 'negative' | 'neutral' | 'mixed';
    description: string;
    emotionalImpact: number;
    userReflection?: string;
}
/**
 * A learned pattern from multiple decision points
 */
export interface CounterfactualPattern {
    id: string;
    userId: string;
    pattern: string;
    patternEmbedding?: number[];
    decisionPoints: string[];
    followedOutcomes: {
        positive: number;
        negative: number;
        neutral: number;
    };
    ignoredOutcomes: {
        positive: number;
        negative: number;
        neutral: number;
    };
    insight: string;
    confidence: number;
    lastUsed?: number;
}
/**
 * A snapshot of the user's semantic signature at a point in time
 */
export interface SemanticSnapshot {
    timestamp: number;
    topicDistribution: Array<{
        topic: string;
        weight: number;
        embedding?: number[];
    }>;
    emotionalVocabulary: Array<{
        word: string;
        frequency: number;
    }>;
    emotionalRange: number;
    languagePatterns: {
        avgSentenceLength: number;
        questionRatio: number;
        certaintyLevel: number;
        futureOrientation: number;
        selfReferenceRatio: number;
    };
    cognitivePatterns: {
        problemSolvingRatio: number;
        growthMindsetSignals: number;
        selfCompassionLevel: number;
    };
}
/**
 * The user's growth over time
 */
export interface GrowthFingerprint {
    id: string;
    userId: string;
    snapshots: SemanticSnapshot[];
    snapshotInterval: 'weekly' | 'monthly';
    growth: GrowthMetrics;
    growthNarrative: string;
    significantShifts: GrowthShift[];
    firstSnapshot: number;
    lastSnapshot: number;
}
export interface GrowthMetrics {
    emotionalRangeGrowth: number;
    topicEvolution: Array<{
        topic: string;
        trend: 'growing' | 'shrinking' | 'stable';
    }>;
    topicDiversityGrowth?: number;
    languageMaturation: {
        questionToStatementShift: number;
        certaintyGrowth: number;
        futureOrientationGrowth: number;
    };
    cognitiveGrowth: {
        problemSolvingImprovement: number;
        growthMindsetProgress: number;
        selfCompassionGrowth: number;
    };
}
export interface GrowthShift {
    timestamp: number;
    description: string;
    magnitude: number;
    domain: 'emotional' | 'cognitive' | 'relational' | 'behavioral';
    dimension?: string;
    interpretation?: string;
    embedding?: number[];
}
/**
 * A semantic thread connecting related moments across sessions
 */
export interface SemanticThread {
    id: string;
    userId: string;
    theme: string;
    themeEmbedding?: number[];
    moments: ThreadMoment[];
    depth: number;
    coherence: number;
    userAwareness: 'conscious' | 'unconscious' | 'mixed';
    connectionInsight: string;
    surfacedToUser: boolean;
    userReaction?: 'resonated' | 'surprised' | 'dismissed' | 'explored';
    firstMoment: number;
    lastMoment: number;
    discoveredAt: number;
}
export interface ThreadMoment {
    sessionId: string;
    timestamp: number;
    content: string;
    embedding?: number[];
    similarity: number;
    emotionalContext?: string;
}
/**
 * Combined semantic intelligence context for LLM injection
 */
export interface SemanticIntelligenceContext {
    activeCorrelations: string[];
    emotionalArcs: string[];
    relationalInsights: string[];
    relevantPatterns: string[];
    growthContext: string;
    hiddenConnections: string[];
    proactiveInsights: string;
    openLoops: string;
    ferniCommitments: string;
    relationshipGraph: string;
    temporalPatterns: string;
    behavioralIntelligence: string;
    coachingIntelligence: string;
    selfAwareness: string;
}
export interface SemanticIntelligenceProfile {
    userId: string;
    correlations: SemanticCorrelation[];
    emotionalArcs: EmotionalArc[];
    relationalNodes: RelationalNode[];
    decisionPoints: DecisionPoint[];
    counterfactualPatterns: CounterfactualPattern[];
    growthFingerprint: GrowthFingerprint | null;
    threads: SemanticThread[];
    lastUpdated: number;
    version: number;
}
//# sourceMappingURL=types.d.ts.map