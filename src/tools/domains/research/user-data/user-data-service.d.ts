/**
 * Peter's User Data Service
 *
 * Manages all user-specific data for Peter's intelligence system.
 * Provides CRUD operations for investment theses, goals, life events, etc.
 *
 * @module tools/domains/research/user-data/user-data-service
 */
import type { InvestmentThesis, ThesisUpdate, FinancialGoal, GoalMilestone, LifeEvent, QuestionRecord, LearningPreferences, RiskEvent, TrustedSources, KnowledgeProfile, KnowledgeGap } from './types.js';
export declare function saveInvestmentThesis(userId: string, thesis: InvestmentThesis): Promise<void>;
export declare function loadInvestmentThesis(userId: string, symbol: string): Promise<InvestmentThesis | null>;
export declare function loadAllTheses(userId: string): Promise<InvestmentThesis[]>;
export declare function updateThesis(userId: string, symbol: string, update: ThesisUpdate): Promise<void>;
export declare function saveFinancialGoal(userId: string, goal: FinancialGoal): Promise<void>;
export declare function loadFinancialGoals(userId: string): Promise<FinancialGoal[]>;
export declare function updateGoalProgress(userId: string, goalId: string, currentAmount: number): Promise<{
    goal: FinancialGoal;
    newMilestones: GoalMilestone[];
} | null>;
export declare function saveLifeEvent(userId: string, event: LifeEvent): Promise<void>;
export declare function loadLifeEvents(userId: string, limit?: number): Promise<LifeEvent[]>;
export declare function getRecentLifeEvents(userId: string, daysBack?: number): Promise<LifeEvent[]>;
export declare function saveQuestion(userId: string, record: QuestionRecord): Promise<void>;
export declare function loadQuestionHistory(userId: string, limit?: number): Promise<QuestionRecord[]>;
export declare function hasAskedAbout(userId: string, topic: string): Promise<boolean>;
export declare function getConceptsExplained(userId: string): Promise<string[]>;
export declare function saveLearningPreferences(userId: string, prefs: LearningPreferences): Promise<void>;
export declare function loadLearningPreferences(userId: string): Promise<LearningPreferences | null>;
export declare function recordEffectiveExplanation(userId: string, topic: string, approachUsed: string, comprehensionScore: number): Promise<void>;
export declare function saveRiskEvent(userId: string, event: RiskEvent): Promise<void>;
export declare function loadRiskEvents(userId: string): Promise<RiskEvent[]>;
export declare function getUserCrisisHistory(userId: string): Promise<{
    totalEvents: number;
    panicSellCount: number;
    heldCount: number;
    boughtMoreCount: number;
    averageRecoveryTime: number;
    lessonsLearned: string[];
}>;
export declare function saveTrustedSources(userId: string, sources: TrustedSources): Promise<void>;
export declare function loadTrustedSources(userId: string): Promise<TrustedSources | null>;
export declare function saveKnowledgeProfile(userId: string, profile: KnowledgeProfile): Promise<void>;
export declare function loadKnowledgeProfile(userId: string): Promise<KnowledgeProfile | null>;
export declare function identifyKnowledgeGap(userId: string, gap: KnowledgeGap): Promise<void>;
export declare function markGapAddressed(userId: string, topic: string): Promise<void>;
export declare function getNextLearningTopic(userId: string): Promise<string | null>;
export declare const UserDataService: {
    saveInvestmentThesis: typeof saveInvestmentThesis;
    loadInvestmentThesis: typeof loadInvestmentThesis;
    loadAllTheses: typeof loadAllTheses;
    updateThesis: typeof updateThesis;
    saveFinancialGoal: typeof saveFinancialGoal;
    loadFinancialGoals: typeof loadFinancialGoals;
    updateGoalProgress: typeof updateGoalProgress;
    saveLifeEvent: typeof saveLifeEvent;
    loadLifeEvents: typeof loadLifeEvents;
    getRecentLifeEvents: typeof getRecentLifeEvents;
    saveQuestion: typeof saveQuestion;
    loadQuestionHistory: typeof loadQuestionHistory;
    hasAskedAbout: typeof hasAskedAbout;
    getConceptsExplained: typeof getConceptsExplained;
    saveLearningPreferences: typeof saveLearningPreferences;
    loadLearningPreferences: typeof loadLearningPreferences;
    recordEffectiveExplanation: typeof recordEffectiveExplanation;
    saveRiskEvent: typeof saveRiskEvent;
    loadRiskEvents: typeof loadRiskEvents;
    getUserCrisisHistory: typeof getUserCrisisHistory;
    saveTrustedSources: typeof saveTrustedSources;
    loadTrustedSources: typeof loadTrustedSources;
    saveKnowledgeProfile: typeof saveKnowledgeProfile;
    loadKnowledgeProfile: typeof loadKnowledgeProfile;
    identifyKnowledgeGap: typeof identifyKnowledgeGap;
    markGapAddressed: typeof markGapAddressed;
    getNextLearningTopic: typeof getNextLearningTopic;
};
export default UserDataService;
//# sourceMappingURL=user-data-service.d.ts.map