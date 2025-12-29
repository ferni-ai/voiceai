/**
 * Better Than Human - Validation Framework Types
 *
 * Type definitions for the BTH validation system that proves
 * Ferni is actually better than human, not just different.
 *
 * @module services/bth-validation/types
 */

// ============================================================================
// TIER 1: HUMAN BASELINE TYPES
// ============================================================================

/**
 * Categories of superhuman capabilities we validate.
 */
export type BTHCapabilityCategory =
  | 'emotional_support'
  | 'commitment_tracking'
  | 'crisis_detection'
  | 'pattern_recognition'
  | 'life_coaching'
  | 'memory_recall'
  | 'reading_between_lines'
  | 'emotional_vocabulary'
  | 'silence_interpretation'
  | 'voice_biomarkers';

/**
 * Difficulty levels for test scenarios.
 */
export type ScenarioDifficulty = 'easy' | 'medium' | 'hard' | 'adversarial';

/**
 * Relationship types for human baseline responders.
 */
export type ResponderRelationship =
  | 'close_friend'
  | 'acquaintance'
  | 'therapist'
  | 'family'
  | 'colleague';

/**
 * A scenario used for baseline comparison.
 */
export interface HumanBaselineScenario {
  id: string;
  category: BTHCapabilityCategory;
  createdAt: Date;
  updatedAt: Date;

  /** The input scenario presented to both human and Ferni */
  scenario: {
    /** The user's message */
    userMessage: string;

    /** Optional conversation context */
    context?: {
      previousMessages?: Array<{
        role: 'user' | 'assistant';
        content: string;
      }>;
      userProfile?: {
        recentStruggles?: string[];
        knownCommitments?: string[];
        emotionalHistory?: string[];
        relationshipContext?: string[];
      };
      sessionContext?: {
        timeOfDay?: string;
        dayOfWeek?: string;
        sessionNumber?: number;
      };
    };

    /** Voice data if relevant */
    voiceData?: {
      strain?: number;
      speechRate?: number;
      pauseFrequency?: number;
      tremor?: number;
    };
  };

  /** Human responses collected from real people */
  humanResponses: HumanResponse[];

  /** Ferni's response (generated during evaluation) */
  ferniResponse?: FerniResponse;

  /** Which superhuman capabilities should be demonstrated */
  expectedCapabilities: string[];

  /** Difficulty rating */
  difficulty: ScenarioDifficulty;

  /** Tags for filtering */
  tags: string[];
}

/**
 * A response from a human responder.
 */
export interface HumanResponse {
  id: string;
  responderId: string;
  relationship: ResponderRelationship;
  response: string;
  responseTimeSeconds: number;
  collectedAt: Date;

  /** Self-reported confidence */
  confidence?: number;

  /** Any notes from the responder */
  notes?: string;
}

/**
 * Ferni's response to a scenario.
 */
export interface FerniResponse {
  id: string;
  scenarioId: string;
  response: string;
  generatedAt: Date;

  /** Context that was injected */
  contextInjections: string[];

  /** Capabilities that were activated */
  activatedCapabilities: string[];

  /** Model used */
  modelId: string;

  /** Response latency */
  latencyMs: number;
}

// ============================================================================
// TIER 1: BLIND EVALUATION TYPES
// ============================================================================

/**
 * Rating dimensions for blind evaluation.
 */
export interface EvaluationRatings {
  /** "This response shows understanding" (1-5) */
  empathy: number;

  /** "This response is helpful" (1-5) */
  helpfulness: number;

  /** "This response remembers context" (1-5) */
  memoryUsage: number;

  /** "This response addresses the right things" (1-5) */
  timeliness: number;

  /** "A friend couldn't do this" (1-5) */
  superhumanFactor: number;
}

/**
 * A blind evaluation comparing human vs Ferni response.
 */
export interface BlindEvaluation {
  id: string;
  scenarioId: string;
  evaluatorId: string;
  evaluatedAt: Date;

  /** Which response was shown as "A" (randomized) */
  responseASource: 'human' | 'ferni';

  /** Ratings for response A */
  responseARatings: EvaluationRatings;

  /** Ratings for response B */
  responseBRatings: EvaluationRatings;

  /** Which response was preferred overall */
  preferredResponse: 'A' | 'B' | 'no_preference';

  /** Free-form feedback */
  feedback?: string;

  /** Evaluator's confidence in their ratings */
  evaluatorConfidence: number;
}

/**
 * Aggregated evaluation results for a scenario.
 */
export interface ScenarioEvaluationResults {
  scenarioId: string;
  totalEvaluations: number;

  /** Preference breakdown */
  ferniPreferred: number;
  humanPreferred: number;
  noPreference: number;
  ferniPreferenceRate: number;

  /** Average ratings */
  ferniAverageRatings: EvaluationRatings;
  humanAverageRatings: EvaluationRatings;

  /** Rating deltas (Ferni - Human) */
  ratingDeltas: EvaluationRatings;

  /** Statistical significance */
  pValue?: number;
  isSignificant: boolean;
}

// ============================================================================
// TIER 2: CAPABILITY MEASUREMENT TYPES
// ============================================================================

/**
 * Test case for adversarial capability testing.
 */
export interface AdversarialTestCase {
  id: string;
  capability: string;
  category: string;

  /** The input to test */
  input: string;

  /** Expected detection result */
  expectedResult: {
    shouldDetect: boolean;
    expectedValue?: unknown;
  };

  /** Why this is hard */
  difficulty: ScenarioDifficulty;
  reason: string;

  /** Tags for filtering */
  tags: string[];
}

/**
 * Result of running an adversarial test case.
 */
export interface AdversarialTestResult {
  testCaseId: string;
  capability: string;
  runAt: Date;

  /** What we expected */
  expected: {
    shouldDetect: boolean;
    value?: unknown;
  };

  /** What we got */
  actual: {
    detected: boolean;
    value?: unknown;
    confidence?: number;
  };

  /** Did we pass? */
  passed: boolean;

  /** If failed, why */
  failureReason?: string;

  /** Execution time */
  durationMs: number;
}

/**
 * Benchmark results for a single capability.
 */
export interface CapabilityBenchmark {
  capability: string;
  runAt: Date;
  totalTestCases: number;

  /** Accuracy metrics */
  truePositives: number;
  trueNegatives: number;
  falsePositives: number;
  falseNegatives: number;

  /** Derived metrics */
  precision: number;
  recall: number;
  f1Score: number;
  accuracy: number;

  /** Comparison to previous run */
  previousF1Score?: number;
  deltaFromPrevious?: number;
  trend: 'improving' | 'degrading' | 'stable';

  /** Known gaps */
  knownGaps: Array<{
    category: string;
    examples: string[];
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>;
}

/**
 * Full benchmark report across all capabilities.
 */
export interface BTHBenchmarkReport {
  reportId: string;
  generatedAt: Date;
  gitCommit?: string;

  /** Individual capability benchmarks */
  capabilities: CapabilityBenchmark[];

  /** Overall metrics */
  overallF1Score: number;
  overallAccuracy: number;

  /** Regression detection */
  hasRegressions: boolean;
  regressions: Array<{
    capability: string;
    previousF1: number;
    currentF1: number;
    delta: number;
  }>;

  /** Improvements */
  improvements: Array<{
    capability: string;
    previousF1: number;
    currentF1: number;
    delta: number;
  }>;
}

// ============================================================================
// TIER 3: PRODUCTION TELEMETRY TYPES
// ============================================================================

/**
 * Event fired when a superhuman capability is triggered in production.
 */
export interface BTHProductionEvent {
  eventId: string;
  timestamp: Date;
  userId: string;
  sessionId: string;

  /** Which capability triggered */
  capability: string;

  /** What triggered it */
  trigger: {
    type: 'user_message' | 'voice_signal' | 'context_detection' | 'proactive';
    content: string;
    confidence: number;
  };

  /** What action we took */
  action: {
    type:
      | 'injected_context'
      | 'surfaced_pattern'
      | 'sent_notification'
      | 'modified_response'
      | 'none';
    description: string;
    contextInjected?: string;
  };

  /** User's implicit response (if observable) */
  userResponse?: {
    /** User acknowledged or agreed */
    acknowledged: boolean;

    /** User changed topic / dismissed */
    dismissed: boolean;

    /** User engaged further */
    engaged: boolean;

    /** Sentiment of follow-up */
    sentiment: 'positive' | 'negative' | 'neutral';

    /** Time to response */
    responseTimeMs?: number;
  };

  /** Outcome tracking (if measurable later) */
  outcome?: {
    commitmentKept?: boolean;
    crisisEscalated?: boolean;
    returnedToTopic?: boolean;
    deeperVulnerability?: boolean;
  };
}

/**
 * Aggregated telemetry for a capability over a time period.
 */
export interface CapabilityTelemetry {
  capability: string;
  periodStart: Date;
  periodEnd: Date;

  /** Usage metrics */
  totalTriggers: number;
  uniqueUsers: number;
  uniqueSessions: number;

  /** Response metrics */
  acknowledged: number;
  dismissed: number;
  engaged: number;

  /** Rates */
  acknowledgmentRate: number;
  dismissalRate: number;
  engagementRate: number;

  /** Confidence distribution */
  averageConfidence: number;
  confidenceP25: number;
  confidenceP75: number;

  /** Trend */
  previousPeriodTriggers?: number;
  triggerGrowthRate?: number;
}

/**
 * User-level BTH feature exposure and satisfaction correlation.
 */
export interface UserBTHCorrelation {
  userId: string;
  measurementPeriod: {
    start: Date;
    end: Date;
  };

  /** Feature exposure */
  featureExposure: {
    [capability: string]: {
      exposureCount: number;
      acknowledgedCount: number;
      engagedCount: number;
      successRate: number;
    };
  };

  /** Satisfaction metrics */
  satisfaction: {
    npsScore?: number;
    retentionDays: number;
    sessionCount: number;
    averageSessionLengthMinutes: number;
    vulnerabilityDepth: number;
  };

  /** Correlation analysis */
  correlation: {
    bthExposureToRetention: number;
    bthSuccessToNPS: number;
    isStatisticallySignificant: boolean;
  };
}

// ============================================================================
// COMPOSITE SCORING TYPES
// ============================================================================

/**
 * Overall BTH quality score combining all tiers.
 */
export interface BTHQualityScore {
  /** When this score was calculated */
  calculatedAt: Date;

  /** Tier 1: Human comparison */
  humanComparison: {
    preferenceRate: number;
    averageRatingDelta: number;
    evaluationCount: number;
  };

  /** Tier 2: Capability metrics */
  capabilities: {
    overallF1Score: number;
    lowestF1Capability: string;
    highestF1Capability: string;
    regressionCount: number;
  };

  /** Tier 3: Production outcomes */
  production: {
    overallAcknowledgmentRate: number;
    overallEngagementRate: number;
    npsCorrelation: number;
  };

  /** Composite score (0-100) */
  overallScore: number;

  /** Trend */
  previousScore?: number;
  trend: 'improving' | 'degrading' | 'stable';

  /** Key gaps to address */
  priorityGaps: Array<{
    area: string;
    description: string;
    impact: 'critical' | 'high' | 'medium' | 'low';
  }>;
}

// ============================================================================
// STORAGE TYPES
// ============================================================================

/**
 * Firestore collection paths for BTH validation data.
 */
export const BTH_COLLECTIONS = {
  scenarios: 'bth_scenarios',
  humanResponses: 'bth_human_responses',
  ferniResponses: 'bth_ferni_responses',
  evaluations: 'bth_evaluations',
  testCases: 'bth_test_cases',
  testResults: 'bth_test_results',
  benchmarks: 'bth_benchmarks',
  productionEvents: 'bth_production_events',
  telemetry: 'bth_telemetry',
  correlations: 'bth_correlations',
  scores: 'bth_scores',
} as const;

/**
 * Configuration for BTH validation.
 */
export interface BTHValidationConfig {
  /** Minimum evaluations needed for statistical significance */
  minEvaluationsPerScenario: number;

  /** Minimum preference rate to claim "better than human" */
  minPreferenceRate: number;

  /** F1 threshold for capability benchmarks */
  minF1Score: number;

  /** Regression threshold (absolute F1 drop) */
  regressionThreshold: number;

  /** Production telemetry sampling rate (0-1) */
  telemetrySamplingRate: number;

  /** Enabled capabilities for telemetry */
  enabledCapabilities: string[];
}

/**
 * Default configuration.
 */
export const DEFAULT_BTH_CONFIG: BTHValidationConfig = {
  minEvaluationsPerScenario: 10,
  minPreferenceRate: 0.6,
  minF1Score: 0.75,
  regressionThreshold: 0.05,
  telemetrySamplingRate: 1.0,
  enabledCapabilities: [
    'commitment_detection',
    'crisis_detection',
    'reading_between_lines',
    'pattern_surfacing',
    'emotional_vocabulary',
    'silence_interpretation',
    'voice_biomarkers',
    'contradiction_comfort',
    'capacity_guardian',
    'perfect_timing',
  ],
};
