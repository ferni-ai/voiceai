/**
 * Global Intelligence Types
 *
 * Types for Peter's aggregate intelligence system.
 */

/**
 * Peer benchmark by demographic group.
 */
export interface PeerBenchmark {
  ageGroup: string;
  incomeBracket: string;
  savingsRate: { median: number; p25: number; p75: number; p90: number };
  netWorth: { median: number; p25: number; p75: number; p90: number };
  behavioralScore: { median: number; topQuartile: number };
  fireProgress: { medianPercentage: number; averageYearsToFire: number };
  characteristics: {
    emergencyFundRate: number;
    automatedSavingsRate: number;
    budgetTrackingRate: number;
    indexFundRate: number;
  };
  sampleSize: number;
  lastUpdated: Date;
}

/**
 * Behavioral pattern learned from aggregate data.
 */
export interface BehavioralPattern {
  patternId: string;
  patternType: 'panic_sell' | 'timing_attempt' | 'fomo_buy' | 'overconfidence' | 'analysis_paralysis';
  triggers: {
    marketConditions: {
      drawdownRange: [number, number];
      vixRange: [number, number];
      sentiment: 'fear' | 'greed' | 'neutral';
    };
    timePatterns: {
      dayOfWeek: string[];
      timeOfDay: string[];
      seasonal: string[];
    };
  };
  demographics: {
    mostCommonAgeGroup: string;
    mostCommonExperienceLevel: 'beginner' | 'intermediate' | 'advanced';
    averageBehavioralScore: number;
  };
  outcomes: {
    averageRecoveryDays: number;
    averageReturnImpact: number;
    regretRate: number;
    repeatRate: number;
  };
  prevention: {
    successfulInterventions: string[];
    bestTimeToIntervene: string;
    messagingThatWorks: string[];
  };
  occurrenceCount: number;
  lastUpdated: Date;
}

/**
 * Success pattern from users who achieved FIRE or hit major milestones.
 */
export interface SuccessPattern {
  patternId: string;
  patternName: string;
  description: string;
  successCriteria: {
    fireProgressRate: number;
    behavioralScoreMin: number;
    netWorthGrowthRate: number;
    goalCompletionRate: number;
  };
  characteristics: {
    habits: string[];
    toolsUsed: string[];
    averageSavingsRate: number;
    investingFrequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    portfolioStyle: 'index_heavy' | 'balanced' | 'dividend' | 'growth';
    automationLevel: 'none' | 'partial' | 'full';
  };
  behavioralTraits: {
    panicSellRate: number;
    timingAttemptRate: number;
    consistencyScore: number;
    patienceScore: number;
  };
  typicalJourney: {
    yearsToFirstMilestone: number;
    yearsToHalfway: number;
    yearsToFire: number;
    biggestChallenges: string[];
    turningPoints: string[];
  };
  sampleSize: number;
  statisticalSignificance: number;
  lastUpdated: Date;
}

/**
 * Common question cluster for knowledge base.
 */
export interface QuestionCluster {
  clusterId: string;
  canonicalQuestion: string;
  variations: string[];
  category: 'basics' | 'investing' | 'fire' | 'taxes' | 'behavior' | 'market';
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  frequency: number;
  bestAnswer: {
    summary: string;
    fullExplanation: string;
    sources: string[];
    examples: string[];
  };
  relatedQuestions: string[];
  triggerPatterns: string[];
  lastUpdated: Date;
}

/**
 * Research type enum.
 */
export type ResearchType = 
  | 'company_analysis' 
  | 'market_insight' 
  | 'economic_data' 
  | 'concept' 
  | 'principle' 
  | 'market_pattern' 
  | 'economic_insight';

/**
 * Research entry for the knowledge base.
 */
export interface ResearchEntry {
  id: string;
  type: ResearchType;
  title: string;
  content: {
    summary: string;
    keyPoints: string[];
    fullAnalysis?: string;
    sources: string[];
  };
  categories: {
    symbols?: string[];
    sectors?: string[];
    topics: string[];
    concepts: string[];
  };
  quality: {
    confidenceScore: number;
    timeSensitive: boolean;
    verifiedAt: Date;
    verificationSource?: string;
    expiresAt?: Date;
  };
  usage: {
    timesUsed: number;
    helpfulnessScore: number;
    lastUsed: Date;
  };
  createdAt: Date;
  updatedAt: Date;
  createdFrom?: string;
}

/**
 * Company-specific knowledge.
 */
export interface CompanyKnowledge {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  insights: {
    strengthsDiscovered: string[];
    risksIdentified: string[];
    valuationNotes: string[];
    catalysts: string[];
  };
  userQuestions: {
    question: string;
    timesAsked: number;
    bestAnswer: string;
  }[];
  history?: Array<{
    date: Date;
    event: string;
    significance: string;
  }>;
  lastResearchDate: Date;
  researchDepth: 'shallow' | 'moderate' | 'deep';
  updatedAt: Date;
}

/**
 * Sector-level knowledge.
 */
export interface SectorKnowledge {
  sectorId: string;
  sectorName: string;
  etfs: string[];
  metrics: {
    avgPE: number;
    avgDividendYield: number;
    volatility: number;
  };
  insights: {
    strengths: string[];
    risks: string[];
    trends: string[];
  };
  correlations: {
    sector: string;
    correlation: number;
  }[];
  updatedAt: Date;
}

/**
 * Market wisdom - timeless principles.
 */
export interface MarketWisdom {
  id: string;
  category: 'principle' | 'quote' | 'historical_lesson' | 'behavioral_insight';
  wisdom: {
    title: string;
    insight: string;
    context: string;
    source?: string;
  };
  applicability: {
    marketConditions: string[];
    userSituations: string[];
    triggerPhrases: string[];
  };
  effectiveness: {
    timesShared: number;
    helpfulnessScore: number;
    memorableQuotes: string[];
  };
  createdAt: Date;
}

/**
 * Anonymized event for BigQuery.
 */
export interface AnonymizedEvent {
  eventId: string;
  eventType: string;
  timestamp: Date;
  demographics: {
    ageGroup: string;
    incomeBracket: string;
    netWorthBracket: string;
  };
  eventData: Record<string, string | number | boolean>;
}
