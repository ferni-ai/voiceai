/**
 * Semantic Intelligence Types
 *
 * "Better than Human" semantic persistence that connects dots
 * humans can't see, remembers trajectories not just moments,
 * and reveals growth patterns invisible to the user.
 *
 * @module services/superhuman/semantic-intelligence/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

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

  // The two domains being correlated
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

  // Correlation strength and evidence
  strength: number; // 0-1
  confidence: number; // 0-1, increases with observations
  observationCount: number;
  coOccurrences: CoOccurrence[];

  // The insight this correlation reveals
  insight: string;
  insightType: InsightType;

  // Timestamps
  firstObserved: number;
  lastObserved: number;
  lastTriggered?: number; // When we last surfaced this to user
}

export type CorrelationDomain =
  | 'emotion'
  | 'topic'
  | 'person'
  | 'time'
  | 'energy'
  | 'behavior'
  | 'sleep'
  | 'work'
  | 'relationship'
  | 'health'
  | 'goal';

export type InsightType =
  | 'causal' // A causes B
  | 'predictive' // A predicts B
  | 'contextual' // A and B co-occur
  | 'protective' // A prevents B
  | 'amplifying'; // A amplifies B

export interface CoOccurrence {
  timestamp: number;
  contextSnippet: string;
  strengthAtTime: number;
}

// ============================================================================
// EMOTIONAL TRAJECTORY TYPES
// ============================================================================

/**
 * A point on the emotional trajectory
 */
export interface EmotionalWaypoint {
  timestamp: number;
  emotion: string;
  intensity: number; // 0-1
  valence: number; // -1 to 1
  arousal: number; // 0-1
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

  // The emotion or theme being tracked
  theme: string; // e.g., "career anxiety", "relationship joy"
  themeEmbedding?: number[];

  // The trajectory
  waypoints: EmotionalWaypoint[];
  phase: ArcPhase;
  trend: 'rising' | 'falling' | 'stable' | 'volatile';

  // Narrative
  narrative: string; // Natural language description
  peakMoment?: {
    timestamp: number;
    description: string;
  };
  turningPoint?: {
    timestamp: number;
    description: string;
    catalyst?: string;
  };

  // Time bounds
  startedAt: number;
  lastUpdated: number;
  resolvedAt?: number;
}

export type ArcPhase =
  | 'emerging' // Just starting to see this pattern
  | 'building' // Intensity increasing
  | 'peak' // At maximum intensity
  | 'resolving' // Intensity decreasing
  | 'resolved' // Arc completed
  | 'recurring'; // Pattern that comes back

// ============================================================================
// RELATIONAL SEMANTICS TYPES
// ============================================================================

/**
 * A person in the user's life and their semantic signature
 */
export interface RelationalNode {
  id: string;
  userId: string;

  // Identity
  name: string;
  relationship: string; // "mom", "boss", "friend Sarah"
  aliases: string[]; // Other ways they're mentioned

  // Semantic signature
  topicAssociations: TopicAssociation[];
  emotionalSignature: EmotionalSignature;

  // Interaction patterns
  mentionCount: number;
  lastMentioned: number;
  firstMentioned: number;
  averageValence: number; // -1 to 1
  valenceVariance: number; // How much their impact varies

  // Insights
  insights: string[];
  supportLevel: 'draining' | 'neutral' | 'supportive' | 'energizing';
}

export interface TopicAssociation {
  topic: string;
  frequency: number;
  sentiment: number; // -1 to 1
  embedding?: number[];
}

export interface EmotionalSignature {
  primaryEmotions: Array<{ emotion: string; frequency: number }>;
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

// ============================================================================
// COUNTER-FACTUAL MEMORY TYPES
// ============================================================================

/**
 * A decision point where advice was given
 */
export interface DecisionPoint {
  id: string;
  userId: string;

  // The advice/suggestion
  advice: string;
  adviceEmbedding?: number[];
  context: string;
  timestamp: number;

  // What happened
  pathTaken: 'followed' | 'ignored' | 'modified' | 'unknown';
  followUpTimestamp?: number;

  // Outcome tracking
  outcome?: CounterfactualOutcome;

  // Learning
  lesson?: string;
  patternId?: string; // Links to broader pattern
}

export interface CounterfactualOutcome {
  timestamp: number;
  result: 'positive' | 'negative' | 'neutral' | 'mixed';
  description: string;
  emotionalImpact: number; // -1 to 1
  userReflection?: string;
}

/**
 * A learned pattern from multiple decision points
 */
export interface CounterfactualPattern {
  id: string;
  userId: string;

  // The pattern
  pattern: string; // e.g., "When you don't set boundaries at work..."
  patternEmbedding?: number[];

  // Evidence
  decisionPoints: string[]; // IDs
  followedOutcomes: { positive: number; negative: number; neutral: number };
  ignoredOutcomes: { positive: number; negative: number; neutral: number };

  // Insight
  insight: string;
  confidence: number;
  lastUsed?: number;
}

// ============================================================================
// GROWTH FINGERPRINT TYPES
// ============================================================================

/**
 * A snapshot of the user's semantic signature at a point in time
 */
export interface SemanticSnapshot {
  timestamp: number;

  // Topic distribution
  topicDistribution: Array<{ topic: string; weight: number; embedding?: number[] }>;

  // Emotional vocabulary
  emotionalVocabulary: Array<{ word: string; frequency: number }>;
  emotionalRange: number; // 0-1, how diverse their emotional expression

  // Language patterns
  languagePatterns: {
    avgSentenceLength: number;
    questionRatio: number; // How often they ask vs state
    certaintyLevel: number; // 0-1, how definitive their language
    futureOrientation: number; // 0-1, how much they talk about future
    selfReferenceRatio: number; // How much they talk about self vs others
  };

  // Cognitive patterns
  cognitivePatterns: {
    problemSolvingRatio: number; // Problem-solve vs catastrophize
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

  // Snapshots over time
  snapshots: SemanticSnapshot[];
  snapshotInterval: 'weekly' | 'monthly';

  // Computed growth metrics
  growth: GrowthMetrics;

  // Narrative
  growthNarrative: string;
  significantShifts: GrowthShift[];

  // Metadata
  firstSnapshot: number;
  lastSnapshot: number;
}

export interface GrowthMetrics {
  emotionalRangeGrowth: number; // Change in emotional vocabulary diversity
  topicEvolution: Array<{ topic: string; trend: 'growing' | 'shrinking' | 'stable' }>;
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
  magnitude: number; // 0-1
  domain: 'emotional' | 'cognitive' | 'relational' | 'behavioral';
  embedding?: number[];
}

// ============================================================================
// CROSS-SESSION THREADING TYPES
// ============================================================================

/**
 * A semantic thread connecting related moments across sessions
 */
export interface SemanticThread {
  id: string;
  userId: string;

  // Thread identity
  theme: string;
  themeEmbedding?: number[];

  // Connected moments
  moments: ThreadMoment[];

  // Thread properties
  depth: number; // How many sessions this spans
  coherence: number; // 0-1, how semantically tight the connection
  userAwareness: 'conscious' | 'unconscious' | 'mixed';

  // Insights
  connectionInsight: string;
  surfacedToUser: boolean;
  userReaction?: 'resonated' | 'surprised' | 'dismissed' | 'explored';

  // Timestamps
  firstMoment: number;
  lastMoment: number;
  discoveredAt: number;
}

export interface ThreadMoment {
  sessionId: string;
  timestamp: number;
  content: string;
  embedding?: number[];
  similarity: number; // To thread theme
  emotionalContext?: string;
}

// ============================================================================
// CONTEXT INJECTION TYPES
// ============================================================================

/**
 * Combined semantic intelligence context for LLM injection
 */
export interface SemanticIntelligenceContext {
  // V3.0 Core Capabilities
  // Correlations that are currently relevant
  activeCorrelations: string[];

  // Emotional arcs in progress
  emotionalArcs: string[];

  // Relational context
  relationalInsights: string[];

  // Counter-factual wisdom
  relevantPatterns: string[];

  // Growth awareness
  growthContext: string;

  // Threads to potentially surface
  hiddenConnections: string[];

  // V3.2 Proactive Intelligence
  proactiveInsights: string;
  openLoops: string;
  ferniCommitments: string;

  // V3.3 Relational Network
  relationshipGraph: string;

  // V3.4 Temporal Intelligence
  temporalPatterns: string;

  // V3.5 Behavioral Intelligence
  behavioralIntelligence: string;

  // V3.6 Coaching Intelligence
  coachingIntelligence: string;

  // V3.7 Self-Awareness Coaching
  selfAwareness: string;
}

// ============================================================================
// PERSISTENCE TYPES
// ============================================================================

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

