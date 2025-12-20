/**
 * Peter's Enhanced User Data Types
 *
 * These types define the expanded data model for Peter's intelligence system.
 * Each type represents a collection in Firestore under bogle_users/{userId}/
 *
 * @module tools/domains/research/user-data/types
 */

// ============================================================================
// INVESTMENT THESIS
// ============================================================================

export interface InvestmentThesis {
  symbol: string;
  purchaseDate: Date;
  thesis: string;
  catalysts: string[];
  risks: string[];
  exitCriteria: {
    priceTarget?: number;
    timeHorizon?: string;
    fundamentalTriggers?: string[];
  };
  emotionalState: {
    atPurchase: 'confident' | 'nervous' | 'fomo' | 'researched';
    confidenceLevel: number; // 1-10
  };
  updates: ThesisUpdate[];
  lastReviewed: Date;
}

export interface ThesisUpdate {
  date: Date;
  note: string;
  stillValid: boolean;
}

// ============================================================================
// FINANCIAL GOALS
// ============================================================================

export type GoalType =
  | 'emergency_fund'
  | 'retirement'
  | 'purchase'
  | 'debt_payoff'
  | 'investment'
  | 'education'
  | 'travel'
  | 'custom';

export type GoalPriority = 'critical' | 'high' | 'medium' | 'low';

export interface FinancialGoal {
  id: string;
  name: string;
  type: GoalType;
  description?: string;
  target: {
    amount: number;
    date?: Date;
  };
  current: {
    amount: number;
    lastUpdated: Date;
  };
  progress: {
    percentage: number;
    projectedCompletion?: Date;
    onTrack: boolean;
    monthlyRequired?: number;
  };
  milestones: GoalMilestone[];
  linkedAccounts?: string[];
  priority: GoalPriority;
  createdAt: Date;
  notes?: string;
}

export interface GoalMilestone {
  percentage: number; // 10, 25, 50, 75, 90, 100
  celebratedAt?: Date;
  celebrationMessage?: string;
}

// ============================================================================
// LIFE EVENTS
// ============================================================================

export type LifeEventType = 'career' | 'family' | 'health' | 'financial' | 'education' | 'housing' | 'relationship';

export type LifeEventSubtype =
  // Career
  | 'job_change'
  | 'promotion'
  | 'layoff'
  | 'retirement'
  | 'career_change'
  | 'side_hustle'
  // Family
  | 'marriage'
  | 'divorce'
  | 'new_baby'
  | 'child_college'
  | 'empty_nest'
  | 'elder_care'
  // Health
  | 'health_issue'
  | 'disability'
  | 'recovery'
  // Financial
  | 'inheritance'
  | 'windfall'
  | 'major_loss'
  | 'bankruptcy'
  // Education
  | 'degree_complete'
  | 'certification'
  | 'student_loans'
  // Housing
  | 'home_purchase'
  | 'home_sale'
  | 'relocation'
  | 'downsizing'
  // Relationship
  | 'new_partner'
  | 'separation';

export interface LifeEvent {
  id: string;
  date: Date;
  type: LifeEventType;
  subtype: LifeEventSubtype;
  description: string;
  financialImpact: {
    incomeChange?: number;
    expenseChange?: number;
    oneTimeImpact?: number;
    direction: 'positive' | 'negative' | 'neutral';
  };
  emotionalWeight: 'major' | 'moderate' | 'minor';
  advisoryImplications: string[];
  acknowledged: boolean;
}

// ============================================================================
// QUESTION HISTORY
// ============================================================================

export interface QuestionRecord {
  id: string;
  timestamp: Date;
  question: string;
  intent: string;
  topics: string[];
  toolsUsed: string[];
  answerSummary: string;
  userReaction: {
    helpful: boolean | null;
    followUpAsked: boolean;
    topicDropped: boolean;
    comprehensionSignal?: 'understood' | 'confused' | 'partial' | 'unknown';
  };
  relatedTopics: string[];
  shouldNotRepeat: boolean;
  conceptsExplained: string[];
}

// ============================================================================
// LEARNING PREFERENCES
// ============================================================================

export type ExplanationStyle = 'simple' | 'technical' | 'story-based' | 'data-driven' | 'visual';
export type AnalogyType = 'sports' | 'cooking' | 'building' | 'gardening' | 'travel' | 'gaming' | 'music' | 'general';
export type AttentionSpan = 'brief' | 'moderate' | 'detailed';
export type JargonLevel = 'none' | 'some' | 'expert';

export interface LearningPreferences {
  userId: string;
  explanationStyle: ExplanationStyle;
  preferredAnalogies: AnalogyType[];
  attentionSpan: AttentionSpan;
  visualLearner: boolean;
  numbersComfort: 'loves_data' | 'comfortable' | 'overwhelmed';
  jargonLevel: JargonLevel;
  responseLength: 'concise' | 'moderate' | 'thorough';

  // Learned from interactions
  effectiveExplanations: EffectiveExplanation[];
  confusionSignals: string[];
  engagementSignals: string[];

  lastUpdated: Date;
}

export interface EffectiveExplanation {
  topic: string;
  approachUsed: string;
  comprehensionScore: number;
  timestamp: Date;
}

// ============================================================================
// RISK EVENTS (Crisis Memory)
// ============================================================================

export type CrisisAction = 'held' | 'bought_more' | 'sold_some' | 'panic_sold' | 'no_action';

export interface RiskEvent {
  id: string;
  date: Date;
  marketEvent: string;
  marketEventDetails?: string;
  portfolioDrawdown: number;
  userReaction: {
    action: CrisisAction;
    emotionalState: string;
    decisionsRegretted?: string;
    lessonLearned?: string;
    reflectionDate?: Date;
  };
  peterIntervention: {
    wasContacted: boolean;
    adviceGiven?: string;
    adviceFollowed?: boolean;
  };
  outcome: {
    recoveryTime?: number; // Days
    finalImpact: number; // Percentage gain/loss from decisions
  };
}

// ============================================================================
// TRUSTED SOURCES
// ============================================================================

export interface TrustedInvestor {
  name: string;
  reason: string;
  quotes: string[];
  booksRead?: string[];
}

export interface TrustedBook {
  title: string;
  author: string;
  keyTakeaways: string[];
  dateRead?: Date;
}

export interface TrustedSources {
  userId: string;
  investors: TrustedInvestor[];
  books: TrustedBook[];
  principles: string[];
  antiPatterns: string[];
  lastUpdated: Date;
}

// ============================================================================
// KNOWLEDGE GAPS
// ============================================================================

export type GapSeverity = 'critical' | 'moderate' | 'minor';

export interface KnowledgeGap {
  topic: string;
  identifiedAt: Date;
  severity: GapSeverity;
  context: string;
  addressed: boolean;
  addressedAt?: Date;
  relatedGoals?: string[];
}

export interface KnowledgeProfile {
  userId: string;
  gaps: KnowledgeGap[];
  strengths: string[];
  educationQueue: EducationQueueItem[];
  lastAssessed: Date;
}

export interface EducationQueueItem {
  topic: string;
  priority: number;
  bestMoment: string;
  prerequisitesMet: boolean;
  estimatedImpact: 'high' | 'medium' | 'low';
}

// ============================================================================
// AGGREGATE USER PROFILE (for quick access)
// ============================================================================

export interface PeterUserProfile {
  userId: string;

  // Core financial
  financialProfile: {
    monthlyIncome: number;
    monthlyExpenses: number;
    savingsRate: number;
    netWorth: number;
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  };

  // Journey stats
  journeyStats: {
    memberSince: Date;
    totalConversations: number;
    totalQuestionsAsked: number;
    insightsGenerated: number;
    goalsCompleted: number;
    milestonesReached: number;
  };

  // Behavioral summary
  behavioralSummary: {
    overallScore: number;
    emotionalControl: number;
    discipline: number;
    patience: number;
    lastCalculated: Date;
  };

  // FIRE progress
  fireProgress: {
    fireNumber: number;
    currentProgress: number;
    percentToFire: number;
    projectedFireDate?: Date;
  };

  // Learning profile
  learningProfile: {
    preferredStyle: ExplanationStyle;
    jargonLevel: JargonLevel;
    topStrengths: string[];
    topGaps: string[];
  };

  // Engagement
  engagement: {
    lastActive: Date;
    averageSessionLength: number;
    favoriteTools: string[];
    preferredTime: string;
  };

  lastUpdated: Date;
}

