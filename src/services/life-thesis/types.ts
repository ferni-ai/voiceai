/**
 * Life Thesis Types
 *
 * A "thesis" is your reason for doing something, captured when you're motivated
 * and clear-headed, so it can be recalled when you're struggling.
 *
 * This pattern works across ALL life domains - not just investments.
 */

/**
 * Core thesis structure - applies to any domain.
 */
export interface LifeThesis {
  id: string;
  domain: ThesisDomain;
  type: string; // Domain-specific type
  createdAt: Date;
  updatedAt: Date;
  
  // The core "why"
  thesis: string;
  
  // What you expect to happen
  expectedOutcomes: string[];
  
  // What might go wrong (that you're accepting)
  knownChallenges: string[];
  
  // When you'll know it's working
  successIndicators: string[];
  
  // When you should reconsider
  exitCriteria?: {
    conditions: string[];
    timeLimit?: string;
  };
  
  // Emotional context at creation
  emotionalState: {
    atCreation: 'excited' | 'determined' | 'hopeful' | 'nervous' | 'committed' | 'desperate';
    confidenceLevel: number; // 1-10
    motivationSource: string;
  };
  
  // Updates over time
  updates: ThesisUpdate[];
  
  // How often to review
  reviewSchedule?: 'weekly' | 'monthly' | 'quarterly' | 'on_struggle';
  lastReviewed?: Date;
  
  // Domain-specific data
  domainData: Record<string, unknown>;
}

export interface ThesisUpdate {
  date: Date;
  note: string;
  stillValid: boolean;
  newConfidence?: number;
  trigger?: 'scheduled_review' | 'struggle_moment' | 'milestone' | 'change_in_circumstances';
}

/**
 * All supported thesis domains.
 */
export type ThesisDomain = 
  | 'investment'      // Why you bought a stock
  | 'habit'           // Why you're building a habit
  | 'goal'            // Why you set a goal
  | 'career'          // Why you chose a path/job
  | 'relationship'    // What you love about someone
  | 'health'          // Why you're making health changes
  | 'learning'        // Why you're learning something
  | 'decision'        // Why you made a big decision
  | 'boundary'        // Why you set a boundary
  | 'commitment';     // Why you committed to something

/**
 * Investment thesis (Peter's domain).
 */
export interface InvestmentThesisData {
  symbol: string;
  purchasePrice?: number;
  purchaseDate: Date;
  catalysts: string[];
  risks: string[];
  priceTarget?: number;
  timeHorizon?: string;
}

/**
 * Habit thesis (Maya's domain).
 */
export interface HabitThesisData {
  habitName: string;
  habitDescription: string;
  cue: string;           // What triggers the habit
  routine: string;       // The habit itself
  reward: string;        // What you get from it
  currentStreak?: number;
  longestStreak?: number;
  relatedIdentity: string; // "I am someone who..."
}

/**
 * Goal thesis (Jordan's domain).
 */
export interface GoalThesisData {
  goalName: string;
  targetDate?: Date;
  targetMetric?: {
    name: string;
    current: number;
    target: number;
    unit: string;
  };
  milestones: {
    percentage: number;
    description: string;
    reached?: boolean;
    reachedAt?: Date;
  }[];
  stakeholders?: string[]; // Who's affected by this goal
  sacrifices?: string[];   // What you're giving up
}

/**
 * Career thesis.
 */
export interface CareerThesisData {
  role?: string;
  company?: string;
  path?: string;          // e.g., "startup founder", "senior IC"
  values: string[];       // What matters to you in work
  tradeoffs: string[];    // What you're accepting
  growthAreas: string[];  // What you hope to learn
  timeframe?: string;     // How long you'll give it
}

/**
 * Relationship thesis.
 */
export interface RelationshipThesisData {
  personName: string;
  relationshipType: 'partner' | 'family' | 'friend' | 'colleague' | 'mentor' | 'other';
  whatYouLove: string[];
  whatsChallenging: string[];
  howYouGrow: string[];   // How this person helps you grow
  boundariesSet?: string[];
  commitments?: string[];
}

/**
 * Health thesis.
 */
export interface HealthThesisData {
  area: 'exercise' | 'nutrition' | 'sleep' | 'mental_health' | 'substance' | 'medical' | 'other';
  currentState: string;
  targetState: string;
  approach: string;       // The method/program
  doctorAdvised?: boolean;
  measurables?: {
    name: string;
    baseline: number;
    target: number;
    unit: string;
  }[];
}

/**
 * Learning thesis.
 */
export interface LearningThesisData {
  subject: string;
  approach: 'self-study' | 'course' | 'mentor' | 'practice' | 'immersion';
  resources: string[];
  timeCommitment: string; // e.g., "2 hours/week"
  applicationGoal: string; // How you'll use this knowledge
  competencyTarget: string; // What "knowing this" looks like
}

/**
 * Decision thesis (for big decisions).
 */
export interface DecisionThesisData {
  decision: string;
  alternatives: string[]; // What you considered
  pros: string[];
  cons: string[];
  dealBreakers: string[]; // What would make you reverse
  stakeholders?: string[];
  reversible: boolean;
  confidenceAtDecision: number;
}

/**
 * Boundary thesis.
 */
export interface BoundaryThesisData {
  boundary: string;
  withWhom: string;
  triggerSituation: string;
  whatYouNeed: string;
  whatYouWontAccept: string;
  consequences?: string; // What happens if violated
  howToEnforce: string;
}

/**
 * Commitment thesis.
 */
export interface CommitmentThesisData {
  commitment: string;
  toWhom: string;         // Could be yourself
  duration?: string;
  conditions?: string[];
  whatItCosts: string;
  whatYouGain: string;
  renewalCriteria?: string;
}

/**
 * Reminder context - what to show when someone is struggling.
 */
export interface ThesisReminder {
  thesis: LifeThesis;
  daysSinceCreation: number;
  context: {
    currentSituation: string;
    emotionalState?: string;
  };
  questions: string[];    // Questions to ask them
  encouragement: string;
}

