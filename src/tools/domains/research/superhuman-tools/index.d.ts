/**
 * Peter's Superhuman Tools
 *
 * These tools leverage Peter's expanded data model to provide insights
 * that go beyond what any human advisor could offer.
 *
 * CATEGORIES:
 * 1. N=1 Personal Analytics - Decision quality, sleep correlation, energy prediction
 * 2. Research Synthesis - Evidence scoring, paper synthesis, counter-arguments
 * 3. Predictive Modeling - Goal prediction, trajectory modeling, habit survival
 * 4. Financial Research - SEC analysis, insider tracking, options flow, macro bridge
 * 5. Experimentation - A/B testing, Bayesian updating, hypothesis tracking
 * 6. External Data - Local economics, industry trends, news sentiment
 * 7. Network Analytics - Communication patterns, relationship health, influence mapping
 *
 * @module tools/domains/research/superhuman-tools
 */
import { llm } from '@livekit/agents';
import { n1AnalyticsTools } from './n1-analytics.js';
import { researchSynthesisTools } from './research-synthesis.js';
import { predictiveModelingTools } from './predictive-modeling.js';
import { financialResearchTools } from './financial-research.js';
import { experimentationTools } from './experimentation.js';
import { externalDataTools } from './external-data.js';
import { networkAnalyticsTools } from './network-analytics.js';
/**
 * Save why you bought a stock - Peter will remind you during volatility
 */
export declare const saveInvestmentThesis: llm.FunctionTool<{
    symbol: string;
    thesis: string;
    confidence: number;
    catalysts?: string[] | undefined;
    risks?: string[] | undefined;
    priceTarget?: number | undefined;
    timeHorizon?: string | undefined;
}, unknown, string>;
/**
 * Get reminded of your thesis - especially useful during volatility
 */
export declare const remindThesis: llm.FunctionTool<{
    symbol: string;
}, unknown, string>;
/**
 * Create a financial goal with milestone tracking
 */
export declare const createFinancialGoal: llm.FunctionTool<{
    name: string;
    type: "education" | "custom" | "retirement" | "investment" | "travel" | "purchase" | "emergency_fund" | "debt_payoff";
    targetAmount: number;
    currentAmount: number;
    priority: "medium" | "low" | "high" | "critical";
    targetDate?: string | undefined;
    notes?: string | undefined;
}, unknown, string>;
/**
 * Update progress on a goal
 */
export declare const updateGoalProgress: llm.FunctionTool<{
    goalName: string;
    newAmount: number;
}, unknown, string>;
/**
 * Predict how you might react to market events
 */
export declare const predictBehavior: llm.FunctionTool<{
    scenario: "market_drop_10" | "market_drop_20" | "market_drop_30" | "rate_hike" | "recession_news";
}, unknown, string>;
/**
 * Record a life event that affects your finances
 */
export declare const recordLifeEvent: llm.FunctionTool<{
    type: "health" | "education" | "relationship" | "family" | "financial" | "career" | "housing";
    description: string;
    incomeChange?: number | undefined;
    expenseChange?: number | undefined;
    oneTimeImpact?: number | undefined;
}, unknown, string>;
/**
 * Get your next recommended learning topic
 */
export declare const getNextLesson: llm.FunctionTool<Record<string, never>, unknown, string>;
export declare const originalSuperhumanTools: {
    saveInvestmentThesis: llm.FunctionTool<{
        symbol: string;
        thesis: string;
        confidence: number;
        catalysts?: string[] | undefined;
        risks?: string[] | undefined;
        priceTarget?: number | undefined;
        timeHorizon?: string | undefined;
    }, unknown, string>;
    remindThesis: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    createFinancialGoal: llm.FunctionTool<{
        name: string;
        type: "education" | "custom" | "retirement" | "investment" | "travel" | "purchase" | "emergency_fund" | "debt_payoff";
        targetAmount: number;
        currentAmount: number;
        priority: "medium" | "low" | "high" | "critical";
        targetDate?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    updateGoalProgress: llm.FunctionTool<{
        goalName: string;
        newAmount: number;
    }, unknown, string>;
    predictBehavior: llm.FunctionTool<{
        scenario: "market_drop_10" | "market_drop_20" | "market_drop_30" | "rate_hike" | "recession_news";
    }, unknown, string>;
    recordLifeEvent: llm.FunctionTool<{
        type: "health" | "education" | "relationship" | "family" | "financial" | "career" | "housing";
        description: string;
        incomeChange?: number | undefined;
        expenseChange?: number | undefined;
        oneTimeImpact?: number | undefined;
    }, unknown, string>;
    getNextLesson: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export declare const superhumanTools: {
    trackRelationship: llm.FunctionTool<{
        name: string;
        relationship: "family" | "acquaintance" | "friend" | "partner" | "mentor" | "colleague" | "mentee";
        energyImpact: "neutral" | "draining" | "energizing";
        influenceDomains?: string[] | undefined;
    }, unknown, string>;
    logInteraction: llm.FunctionTool<{
        name: string;
        type: "email" | "text" | "social" | "call" | "video" | "in_person";
        quality: number;
        topic?: string | undefined;
    }, unknown, string>;
    analyzeCommunicationPatterns: llm.FunctionTool<Record<string, never>, unknown, string>;
    scoreRelationshipHealth: llm.FunctionTool<{
        name: string;
    }, unknown, string>;
    mapInfluence: llm.FunctionTool<Record<string, never>, unknown, string>;
    analyzeNetworkGaps: llm.FunctionTool<{
        goals: string[];
    }, unknown, string>;
    getLocalEconomics: llm.FunctionTool<{
        location: string;
    }, unknown, string>;
    synthesizeIndustryTrends: llm.FunctionTool<{
        industry: string;
    }, unknown, string>;
    analyzeNewsSentiment: llm.FunctionTool<{
        topic: string;
    }, unknown, string>;
    recordSpending: llm.FunctionTool<{
        category: "entertainment" | "education" | "other" | "healthcare" | "housing" | "food" | "utilities" | "transportation" | "childcare" | "clothing";
        amount: number;
        description?: string | undefined;
    }, unknown, string>;
    calculatePersonalInflation: llm.FunctionTool<{
        monthlyIncome?: number | undefined;
    }, unknown, string>;
    designExperiment: llm.FunctionTool<{
        hypothesis: string;
        intervention: string;
        metric: string;
        duration: number;
    }, unknown, string>;
    recordExperimentData: llm.FunctionTool<{
        value: number;
        condition: "control" | "treatment";
        notes?: string | undefined;
    }, unknown, string>;
    analyzeExperiment: llm.FunctionTool<Record<string, never>, unknown, string>;
    createBelief: llm.FunctionTool<{
        statement: string;
        initialProbability: number;
    }, unknown, string>;
    updateBelief: llm.FunctionTool<{
        beliefKeyword: string;
        evidence: string;
        direction: "neutral" | "supports" | "opposes";
        strength: "moderate" | "strong" | "weak";
    }, unknown, string>;
    trackHypothesis: llm.FunctionTool<{
        hypothesis: string;
        domain: "habits" | "productivity" | "relationships" | "health" | "finances" | "other" | "career";
    }, unknown, string>;
    updateHypothesis: llm.FunctionTool<{
        hypothesisKeyword: string;
        evidence?: string | undefined;
        newStatus?: "testing" | "confirmed" | "inconclusive" | "refuted" | undefined;
    }, unknown, string>;
    detectConfounds: llm.FunctionTool<{
        observation: string;
        domain: "habits" | "productivity" | "relationships" | "health" | "finances";
    }, unknown, string>;
    calculateEffectSize: llm.FunctionTool<{
        beforeValues: number[];
        afterValues: number[];
        context: string;
    }, unknown, string>;
    analyzeSECFiling: llm.FunctionTool<{
        symbol: string;
        filingType: "10-K" | "10-Q" | "latest";
    }, unknown, string>;
    trackInsiderTrading: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    analyzeOptionsFlow: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    bridgeMacroToPersonal: llm.FunctionTool<{
        macroEvent: "fed_rate_hike" | "fed_rate_cut" | "inflation_rising" | "inflation_falling" | "recession_declared" | "unemployment_rising" | "housing_cooling" | "stock_market_correction" | "dollar_strengthening" | "dollar_weakening";
        personalContext?: string | undefined;
    }, unknown, string>;
    recordGoalProgress: llm.FunctionTool<{
        goalName: string;
        currentProgress: number;
        notes?: string | undefined;
    }, unknown, string>;
    predictGoalSuccess: llm.FunctionTool<{
        goalName: string;
    }, unknown, string>;
    projectBehavioralTrajectory: llm.FunctionTool<{
        domain: "habits" | "productivity" | "relationships" | "spending" | "energy" | "goals";
    }, unknown, string>;
    recordHabit: llm.FunctionTool<{
        habitName: string;
        completed: boolean;
        notes?: string | undefined;
    }, unknown, string>;
    analyzeHabitSurvival: llm.FunctionTool<{
        habitName: string;
    }, unknown, string>;
    analyzeCounterfactual: llm.FunctionTool<{
        decision: string;
        alternative: string;
        domain: "health" | "relationship" | "habit" | "financial" | "career";
        timeframe: string;
    }, unknown, string>;
    predictLifeEventImpact: llm.FunctionTool<{
        event: string;
        eventType: "retirement" | "child" | "relationship_start" | "relationship_end" | "job_change" | "move" | "health_change" | "financial_windfall" | "financial_loss" | "education_start";
        magnitude: "moderate" | "minor" | "major";
    }, unknown, string>;
    scoreEvidenceQuality: llm.FunctionTool<{
        claim: string;
    }, unknown, string>;
    synthesizeResearch: llm.FunctionTool<{
        topic: string;
        depth: "standard" | "quick" | "comprehensive";
    }, unknown, string>;
    findCounterArguments: llm.FunctionTool<{
        belief: string;
        domain: "finance" | "productivity" | "relationships" | "health" | "general" | "career";
    }, unknown, string>;
    verifyClaim: llm.FunctionTool<{
        claim: string;
    }, unknown, string>;
    getBaseRate: llm.FunctionTool<{
        scenario: string;
        userEstimate?: number | undefined;
    }, unknown, string>;
    recordDecision: llm.FunctionTool<{
        decision: string;
        domain: "health" | "relationship" | "habit" | "other" | "financial" | "career" | "purchase";
        sleepHours?: number | undefined;
        stressLevel?: number | undefined;
        energyLevel?: number | undefined;
        tags?: string[] | undefined;
    }, unknown, string>;
    recordDecisionOutcome: llm.FunctionTool<{
        decisionKeywords: string;
        wasReversed: boolean;
        satisfaction: number;
    }, unknown, string>;
    analyzeDecisionQuality: llm.FunctionTool<{
        domain: "health" | "relationship" | "habit" | "all" | "financial" | "career" | "purchase";
    }, unknown, string>;
    recordSleepData: llm.FunctionTool<{
        hoursSlept: number;
        quality?: number | undefined;
    }, unknown, string>;
    analyzeSleepCorrelations: llm.FunctionTool<Record<string, never>, unknown, string>;
    recordEnergyLevel: llm.FunctionTool<{
        level: number;
        notes?: string | undefined;
    }, unknown, string>;
    predictEnergy: llm.FunctionTool<{
        sleepLastNight?: number | undefined;
        calendarLoad?: "moderate" | "light" | "heavy" | "overloaded" | undefined;
    }, unknown, string>;
    analyzePeakPerformance: llm.FunctionTool<Record<string, never>, unknown, string>;
    calculateLifestyleImpact: llm.FunctionTool<{
        change: string;
        type: "habit_add" | "habit_remove" | "schedule_change" | "diet_change" | "exercise_change" | "sleep_change" | "work_change" | "relationship_change";
        magnitude: "medium" | "small" | "large";
    }, unknown, string>;
    saveInvestmentThesis: llm.FunctionTool<{
        symbol: string;
        thesis: string;
        confidence: number;
        catalysts?: string[] | undefined;
        risks?: string[] | undefined;
        priceTarget?: number | undefined;
        timeHorizon?: string | undefined;
    }, unknown, string>;
    remindThesis: llm.FunctionTool<{
        symbol: string;
    }, unknown, string>;
    createFinancialGoal: llm.FunctionTool<{
        name: string;
        type: "education" | "custom" | "retirement" | "investment" | "travel" | "purchase" | "emergency_fund" | "debt_payoff";
        targetAmount: number;
        currentAmount: number;
        priority: "medium" | "low" | "high" | "critical";
        targetDate?: string | undefined;
        notes?: string | undefined;
    }, unknown, string>;
    updateGoalProgress: llm.FunctionTool<{
        goalName: string;
        newAmount: number;
    }, unknown, string>;
    predictBehavior: llm.FunctionTool<{
        scenario: "market_drop_10" | "market_drop_20" | "market_drop_30" | "rate_hike" | "recession_news";
    }, unknown, string>;
    recordLifeEvent: llm.FunctionTool<{
        type: "health" | "education" | "relationship" | "family" | "financial" | "career" | "housing";
        description: string;
        incomeChange?: number | undefined;
        expenseChange?: number | undefined;
        oneTimeImpact?: number | undefined;
    }, unknown, string>;
    getNextLesson: llm.FunctionTool<Record<string, never>, unknown, string>;
};
export { n1AnalyticsTools, researchSynthesisTools, predictiveModelingTools, financialResearchTools, experimentationTools, externalDataTools, networkAnalyticsTools, };
export * from './types.js';
export default superhumanTools;
//# sourceMappingURL=index.d.ts.map