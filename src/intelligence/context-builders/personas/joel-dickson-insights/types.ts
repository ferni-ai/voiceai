/**
 * Joel Dickson Insights - Type Definitions
 *
 * Types for Joel's life-mentorship intelligence: financial behavioral context,
 * career crossroads, and life wisdom pattern recognition.
 *
 * @module intelligence/context-builders/personas/joel-dickson-insights/types
 */

// ============================================================================
// SESSION STATE
// ============================================================================

export interface JoelSession {
  briefingTurn: number;
  lastTopics: string[];
}

// ============================================================================
// DATA FETCHER OUTPUTS
// ============================================================================

export interface JoelFinancialData {
  hasGoals: boolean;
  goalNames: string[];
  hasBudget: boolean;
  lifeChapterFromMoney:
    | 'foundation-building'
    | 'freedom-seeking'
    | 'nesting'
    | 'partnership-building'
    | 'creation'
    | 'expansion'
    | 'active-growth'
    | 'unknown';
  primaryConcern: string | null;
  savingsGoalsCount: number;
}

export interface JoelCareerData {
  careerSignals: string[];
  transitionLikely: boolean;
  optimizingFor: string | null;
  stressSignals: boolean;
}

export interface JoelLifeWisdomData {
  recurringThemes: string[];
  valuesFromConversations: string[];
  enoughQuestionRaised: boolean;
  moneyShameSignals: boolean;
}

export interface JoelInsightData {
  financial: JoelFinancialData;
  career: JoelCareerData;
  lifeWisdom: JoelLifeWisdomData;
}

// ============================================================================
// CONTEXT MODULE OUTPUTS (formatted for prompt)
// ============================================================================

export interface LifeWisdomContext {
  patternSummary: string | null;
  economistLens: string[];
  prompts: string[];
}

export interface CareerCrossroadsContext {
  signals: string[];
  suggestedAngle: string | null;
  prompts: string[];
}

export interface FinancialBehavioralContext {
  behavioralSignals: string[];
  moneyAnxietySignals: string[];
  prompts: string[];
}

// ============================================================================
// CONVERSATION CONTEXT (detected from current turn)
// ============================================================================

export interface ConversationContext {
  isFinanceTopic: boolean;
  isCareerTopic: boolean;
  isLifeWisdomTopic: boolean;
  isVanguardTopic: boolean;
  emotionalTone: 'stressed' | 'curious' | 'excited' | 'reflective' | 'neutral';
}
