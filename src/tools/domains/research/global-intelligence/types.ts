/**
 * Peter's Global Intelligence Types
 *
 * Types for aggregated intelligence across ALL users.
 * This is Peter's "hive mind" - learning from everyone while keeping individual data private.
 *
 * @module tools/domains/research/global-intelligence/types
 */

// ============================================================================
// PEER BENCHMARKS
// ============================================================================

export interface PeerBenchmark {
  ageGroup: '20s' | '30s' | '40s' | '50s' | '60s+';
  incomeBracket: 'under_50k' | '50k_100k' | '100k_200k' | '200k_plus';
  
  // Savings metrics
  savingsRate: {
    median: number;
    p25: number;
    p75: number;
    p90: number;
  };
  
  // Net worth metrics
  netWorth: {
    median: number;
    p25: number;
    p75: number;
    p90: number;
  };
  
  // Behavioral metrics
  behavioralScore: {
    median: number;
    topQuartile: number;
  };
  
  // FIRE metrics
  fireProgress: {
    medianPercentage: number;
    averageYearsToFire: number;
  };
  
  // Common characteristics
  characteristics: {
    emergencyFundRate: number;        // % with 6+ months
    automatedSavingsRate: number;     // % who automate
    budgetTrackingRate: number;       // % who track spending
    indexFundRate: number;            // % in index funds
  };
  
  sampleSize: number;
  lastUpdated: Date;
}

// ============================================================================
// BEHAVIORAL PATTERNS
// ============================================================================

export interface BehavioralPattern {
  patternId: string;
  patternType: 'panic_sell' | 'timing_attempt' | 'impulse_buy' | 'over_checking' | 'discipline_lapse';
  
  // When does this happen?
  triggers: {
    marketConditions: {
      drawdownRange: [number, number];  // e.g., [10, 20] = 10-20% drop
      vixRange: [number, number];
      sentiment: 'fear' | 'greed' | 'neutral';
    };
    timePatterns: {
      dayOfWeek: string[];
      timeOfDay: string[];
      seasonal: string[];
    };
  };
  
  // Who does this?
  demographics: {
    mostCommonAgeGroup: string;
    mostCommonExperienceLevel: 'beginner' | 'intermediate' | 'experienced';
    averageBehavioralScore: number;
  };
  
  // What happens after?
  outcomes: {
    averageRecoveryDays: number;
    averageReturnImpact: number;
    regretRate: number;               // % who said they regretted it
    repeatRate: number;               // % who do it again
  };
  
  // Prevention
  prevention: {
    successfulInterventions: string[];
    bestTimeToIntervene: string;
    messagingThatWorks: string[];
  };
  
  occurrenceCount: number;
  lastUpdated: Date;
}

// ============================================================================
// SUCCESS PATTERNS
// ============================================================================

export interface SuccessPattern {
  patternId: string;
  patternName: string;
  description: string;
  
  // Success criteria
  successCriteria: {
    fireProgressRate: number;         // % progress per year
    behavioralScoreMin: number;
    netWorthGrowthRate: number;
    goalCompletionRate: number;
  };
  
  // Common characteristics
  characteristics: {
    habits: string[];
    toolsUsed: string[];
    averageSavingsRate: number;
    investingFrequency: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
    portfolioStyle: 'index_heavy' | 'dividend' | 'growth' | 'balanced';
    automationLevel: 'full' | 'partial' | 'manual';
  };
  
  // Behavioral traits
  behavioralTraits: {
    panicSellRate: number;
    timingAttemptRate: number;
    consistencyScore: number;
    patienceScore: number;
  };
  
  // Journey
  typicalJourney: {
    yearsToFirstMilestone: number;    // 25% of FIRE
    yearsToHalfway: number;           // 50% of FIRE
    yearsToFire: number;
    biggestChallenges: string[];
    turningPoints: string[];
  };
  
  sampleSize: number;
  statisticalSignificance: number;
  lastUpdated: Date;
}

// ============================================================================
// QUESTION INTELLIGENCE
// ============================================================================

export interface QuestionCluster {
  clusterId: string;
  canonicalQuestion: string;
  variations: string[];
  intent: string;
  
  // Response strategy
  responseStrategy: {
    recommendedTools: string[];
    recommendedStyle: 'simple' | 'technical' | 'story' | 'data';
    keyPointsToAddress: string[];
    commonMisconceptions: string[];
    successRate: number;
  };
  
  // Patterns
  patterns: {
    frequencyCount: number;
    trendingScore: number;            // Is this question trending?
    seasonalPattern?: string;
    triggerEvents: string[];          // What events cause this question?
  };
  
  // Related
  relatedClusters: string[];
  prerequisiteKnowledge: string[];
  followUpQuestions: string[];
  
  lastUpdated: Date;
}

// ============================================================================
// MARKET SENTIMENT
// ============================================================================

export interface MarketSentiment {
  timestamp: Date;
  
  // User-based sentiment
  userSentiment: {
    fearGreedIndex: number;           // 0-100, based on user behavior
    panicSellRate: number;            // Current rate vs historical
    newInvestmentRate: number;        // Current rate vs historical
    portfolioCheckFrequency: number;  // How often users check
    cashHoardingRate: number;         // % moving to cash
  };
  
  // Question-based sentiment
  questionSentiment: {
    topConcerns: string[];
    topOpportunities: string[];
    sentiment: 'fearful' | 'neutral' | 'greedy';
    confidenceLevel: number;
  };
  
  // Trending topics
  trending: {
    stocks: Array<{ symbol: string; mentions: number; sentiment: number }>;
    topics: Array<{ topic: string; mentions: number; trend: 'rising' | 'falling' | 'stable' }>;
    questions: Array<{ question: string; count: number }>;
  };
}

// ============================================================================
// EXPLANATION EFFECTIVENESS
// ============================================================================

export interface ExplanationEffectiveness {
  topic: string;
  explanationId: string;
  
  // The explanation
  explanation: {
    text: string;
    style: 'simple' | 'technical' | 'analogy' | 'data' | 'story';
    analogyType?: string;
    length: 'short' | 'medium' | 'long';
  };
  
  // Effectiveness metrics
  effectiveness: {
    comprehensionRate: number;        // Based on follow-up behavior
    retentionRate: number;            // Did they apply it later?
    satisfactionSignals: number;      // Positive acknowledgments
    confusionSignals: number;         // Follow-up questions indicating confusion
  };
  
  // Who it works for
  effectiveFor: {
    experienceLevels: string[];
    learningStyles: string[];
    ageGroups: string[];
  };
  
  sampleSize: number;
  lastUpdated: Date;
}

// ============================================================================
// GLOBAL RESEARCH KNOWLEDGE (Peter's Big Brain)
// ============================================================================

export type ResearchType = 
  | 'company_analysis'
  | 'sector_analysis'
  | 'economic_insight'
  | 'strategy'
  | 'concept_explanation'
  | 'market_pattern'
  | 'behavioral_insight'
  | 'tax_strategy'
  | 'historical_lesson';

export interface ResearchEntry {
  id: string;
  type: ResearchType;
  title: string;
  
  // Content
  content: {
    summary: string;                  // 1-2 sentence summary
    keyPoints: string[];              // Bullet points
    fullAnalysis: string;             // Detailed analysis
    sources: string[];                // Where this came from
  };
  
  // Categorization
  categories: {
    symbols?: string[];               // Related stock symbols
    sectors?: string[];               // Related sectors
    topics: string[];                 // Topic tags
    concepts: string[];               // Financial concepts involved
  };
  
  // Quality & Usage
  quality: {
    confidenceScore: number;          // How confident in this info
    verifiedAt?: Date;
    verificationSource?: string;
    timeSensitive: boolean;           // Does this expire?
    expiresAt?: Date;
  };
  
  usage: {
    timesUsed: number;                // How often Peter uses this
    helpfulnessScore: number;         // Based on user reactions
    lastUsed?: Date;
  };
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdFrom: string;                // What triggered this research
}

export interface CompanyKnowledge {
  symbol: string;
  name: string;
  
  // Peter's understanding
  peterAnalysis: {
    lynchCategory: 'slow_grower' | 'stalwart' | 'fast_grower' | 'cyclical' | 'turnaround' | 'asset_play';
    story: string;                    // Peter Lynch "story"
    moat: string[];                   // Competitive advantages
    risks: string[];
    keyMetricsToWatch: string[];
  };
  
  // Historical knowledge
  history: {
    significantEvents: Array<{
      date: Date;
      event: string;
      impact: string;
    }>;
    earningsHistory: Array<{
      quarter: string;
      surprise: number;
      reaction: string;
    }>;
  };
  
  // User interest
  userInterest: {
    timesAskedAbout: number;
    commonQuestions: string[];
    averageSentiment: number;
  };
  
  lastUpdated: Date;
}

export interface SectorKnowledge {
  sectorId: string;
  name: string;
  
  // Peter's understanding
  overview: {
    currentState: string;
    outlook: 'bullish' | 'neutral' | 'bearish';
    keyDrivers: string[];
    risks: string[];
    opportunities: string[];
  };
  
  // Key companies
  keyCompanies: Array<{
    symbol: string;
    role: string;                     // "leader", "disruptor", "value play"
  }>;
  
  // Metrics
  metrics: {
    averagePE: number;
    averageDividendYield: number;
    yearToDateReturn: number;
  };
  
  // Patterns
  patterns: {
    cyclicality: 'high' | 'medium' | 'low';
    interestRateSensitivity: 'high' | 'medium' | 'low';
    seasonalPatterns: string[];
  };
  
  lastUpdated: Date;
}

export interface MarketWisdom {
  id: string;
  category: 'principle' | 'warning' | 'opportunity' | 'pattern' | 'lesson';
  
  // The wisdom
  wisdom: {
    title: string;
    insight: string;
    context: string;
    source?: string;                  // Buffett, Lynch, historical event, etc.
  };
  
  // When to apply
  applicability: {
    marketConditions: string[];
    userSituations: string[];
    triggerPhrases: string[];         // When user says X, share this
  };
  
  // Effectiveness
  effectiveness: {
    timesShared: number;
    helpfulnessScore: number;
    memorableQuotes: string[];
  };
  
  createdAt: Date;
}

// ============================================================================
// AGGREGATED INSIGHTS
// ============================================================================

export interface DailyGlobalInsights {
  date: Date;
  
  // Market state
  market: {
    sentiment: 'fear' | 'neutral' | 'greed';
    userActivityLevel: 'low' | 'normal' | 'high';
    topConcerns: string[];
    topOpportunities: string[];
  };
  
  // Behavioral
  behavioral: {
    panicSellsToday: number;
    successfulInterventions: number;
    newMilestonesReached: number;
    averageBehavioralScore: number;
  };
  
  // Trending
  trending: {
    questions: string[];
    stocks: string[];
    topics: string[];
  };
  
  // Insights generated
  insightsGenerated: {
    total: number;
    byType: Record<string, number>;
    actionedRate: number;
  };
}

// ============================================================================
// EVENT TYPES (for BigQuery pipeline)
// ============================================================================

export type AnonymizedEventType =
  | 'question_asked'
  | 'tool_used'
  | 'panic_sell'
  | 'timing_attempt'
  | 'impulse_purchase'
  | 'goal_milestone'
  | 'fire_milestone'
  | 'thesis_created'
  | 'thesis_reviewed'
  | 'behavior_recorded'
  | 'explanation_given'
  | 'session_start'
  | 'session_end';

export interface AnonymizedEvent {
  eventId: string;
  eventTimestamp: Date;
  eventType: AnonymizedEventType;
  eventSubtype?: string;
  
  // Demographic buckets (not identifying)
  demographics: {
    ageGroup?: string;
    incomeBracket?: string;
    netWorthBracket?: string;
    experienceLevel?: string;
    riskTolerance?: string;
  };
  
  // Market context
  marketContext: {
    sp500Change30d?: number;
    vixLevel?: number;
    fedRate?: number;
    marketSentiment?: string;
  };
  
  // Event-specific data (no PII)
  eventData: Record<string, unknown>;
  
  // For outcome tracking
  outcomeTracked: boolean;
  outcomeData?: Record<string, unknown>;
}

