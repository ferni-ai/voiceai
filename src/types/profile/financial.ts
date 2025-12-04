/**
 * Financial Profile Aggregate
 *
 * User's financial context, goals, and journey.
 * Separate from identity for clean domain separation.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Risk tolerance profile
 */
export interface RiskProfile {
  tolerance: 'conservative' | 'moderate' | 'aggressive' | 'unknown';
  confidence: number;
  assessedAt: Date;
  factors: string[];
}

/**
 * Financial goal with progress tracking
 */
export interface FinancialGoal {
  id: string;
  name: string;
  type: 'retirement' | 'education' | 'home' | 'emergency' | 'travel' | 'other';
  targetAmount?: number;
  targetDate?: Date;
  timeHorizon: 'short' | 'medium' | 'long' | 'unknown';
  currentProgress?: number;
  progressPercent?: number;
  status: 'planning' | 'active' | 'on_track' | 'behind' | 'achieved' | 'abandoned';
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
  updatedAt: Date;
  milestones?: { date: Date; note: string }[];
  jackNotes?: string;
}

/**
 * Investment-related event
 */
export interface InvestmentEvent {
  id: string;
  timestamp: Date;
  type:
    | 'started_investing'
    | 'major_contribution'
    | 'withdrawal'
    | 'rebalance'
    | 'market_concern'
    | 'goal_reached'
    | 'strategy_change'
    | 'question_asked';
  description: string;
  emotionalContext?: string;
  outcome?: string;
}

/**
 * Primary financial concern
 */
export type PrimaryConcern =
  | 'retirement'
  | 'savings'
  | 'debt'
  | 'education'
  | 'market_volatility'
  | 'inflation'
  | 'job_security'
  | 'healthcare'
  | 'legacy'
  | 'general'
  | 'none';

/**
 * Investment account types
 */
export interface InvestmentAccount {
  type: '401k' | 'IRA' | 'Roth IRA' | 'Brokerage' | 'HSA' | 'Other';
  hasAccount: boolean;
}

/**
 * Current financial situation
 */
export interface FinancialSituation {
  hasEmergencyFund: boolean;
  hasDebt: boolean;
  debtTypes?: string[];
  investmentAccounts: InvestmentAccount[];
  monthlyIncome?: number;
  monthlyExpenses?: number;
}

// ============================================================================
// FINANCIAL PROFILE
// ============================================================================

/**
 * Complete financial profile
 */
export interface FinancialProfile {
  riskProfile: RiskProfile;
  goals: FinancialGoal[];
  primaryConcerns: PrimaryConcern[];
  investmentEvents: InvestmentEvent[];
  hasInvestments: boolean;
  investmentExperience: 'beginner' | 'intermediate' | 'experienced' | 'unknown';
  financialSituation?: FinancialSituation;
  financialAnxietyTriggers?: string[];
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create default financial profile
 */
export function createFinancialProfile(): FinancialProfile {
  const now = new Date();
  return {
    riskProfile: {
      tolerance: 'unknown',
      confidence: 0,
      assessedAt: now,
      factors: [],
    },
    goals: [],
    primaryConcerns: [],
    investmentEvents: [],
    hasInvestments: false,
    investmentExperience: 'unknown',
    financialAnxietyTriggers: [],
  };
}

