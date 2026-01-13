/**
 * Financial Habits Tools
 *
 * Tools for budgeting, spending analysis, savings goals,
 * and building healthy financial habits.
 *
 * KEY CAPABILITIES:
 * - Real spending analysis via Plaid integration
 * - Budget creation and tracking
 * - Savings goals and automation guidance
 * - Subscription auditing
 * - Debt payoff strategies (snowball vs avalanche)
 * - Behavioral tools (impulse control, spending triggers)
 * - Savings challenges and gamification
 * - Cash flow analysis
 * - Weekly/monthly financial check-ins
 *
 * ALL DATA PERSISTED TO FIRESTORE via FinancialStore
 *
 * @see ./financial-habits/types.ts - Type definitions
 * @see ./financial-habits/helpers.ts - Helper functions
 */
import { llm } from '@livekit/agents';
import { type BudgetData, type BudgetCategoryData, type SavingsGoalData, type SubscriptionData, type SpendingTriggerData, type SpendingLimitData } from '../../../services/stores/financial-store.js';
export type { BudgetData, BudgetCategoryData, SavingsGoalData, SubscriptionData, SpendingTriggerData, SpendingLimitData, };
export declare function createFinancialHabitsTools(): {
    analyzeSpending: llm.FunctionTool<{
        timeframe: "month" | "year" | "week" | "quarter";
    }, unknown, string>;
    findSpendingLeaks: llm.FunctionTool<Record<string, never>, unknown, string>;
    getBudgetStatus: llm.FunctionTool<Record<string, never>, unknown, string>;
    createBudget: llm.FunctionTool<{
        category: string;
        monthlyLimit: number;
        isEssential: boolean;
    }, unknown, string>;
    getSavingsGoals: llm.FunctionTool<Record<string, never>, unknown, string>;
    createSavingsGoal: llm.FunctionTool<{
        name: string;
        targetAmount: number;
        monthlyContribution: number;
        priority: "medium" | "low" | "high";
        isEmergencyFund: boolean;
        deadline?: string | undefined;
    }, unknown, string>;
    auditSubscriptions: llm.FunctionTool<Record<string, never>, unknown, string>;
    apply503020Rule: llm.FunctionTool<{
        monthlyIncome: number;
    }, unknown, string>;
    getActualSpending: llm.FunctionTool<{
        userId: string;
        period: "month" | "week" | "quarter";
    }, unknown, string>;
    compareDebtStrategies: llm.FunctionTool<{
        debts: {
            name: string;
            balance: number;
            interestRate: number;
            minimumPayment: number;
        }[];
        extraMonthlyPayment: number;
    }, unknown, string>;
    impulseSpendingCheck: llm.FunctionTool<{
        item: string;
        cost: number;
        monthlyIncome?: number | undefined;
    }, unknown, string>;
    startSavingsChallenge: llm.FunctionTool<{
        challengeType: "custom" | "weather" | "52-week" | "no-spend" | "round-up" | "spare-change";
        startingAmount?: number | undefined;
        goal?: number | undefined;
    }, unknown, string>;
    analyzeCashFlow: llm.FunctionTool<{
        payFrequency: "monthly" | "weekly" | "biweekly" | "semi-monthly";
        payDays: string;
        majorBills: {
            name: string;
            amount: number;
            dueDay: number;
        }[];
    }, unknown, string>;
    weeklyCheckIn: llm.FunctionTool<{
        weekNumber?: number | undefined;
    }, unknown, string>;
    logSpendingTrigger: llm.FunctionTool<{
        purchase: string;
        amount: number;
        emotion: "anxious" | "happy" | "sad" | "overwhelmed" | "angry" | "other" | "celebrating" | "stressed" | "lonely" | "bored" | "tired";
        situation?: string | undefined;
        regretLevel?: "moderate" | "high" | "none" | "mild" | undefined;
    }, unknown, string>;
    getSpendingTriggerPatterns: llm.FunctionTool<Record<string, never>, unknown, string>;
    getBillNegotiationScript: llm.FunctionTool<{
        billType: "phone" | "medical" | "gym" | "subscription" | "rent" | "utility" | "internet" | "cable" | "insurance" | "credit-card-apr";
        currentAmount?: number | undefined;
        competitor?: string | undefined;
    }, unknown, string>;
    recommendSavingsAccounts: llm.FunctionTool<{
        savingsGoal: "general" | "vacation" | "emergency-fund" | "short-term" | "medium-term" | "down-payment";
        amount?: number | undefined;
        timeframe?: "immediate" | "1-year" | "3-6-months" | "2-5-years" | "5-plus-years" | undefined;
        riskTolerance?: "medium" | "low" | "none" | undefined;
    }, unknown, string>;
    setSpendingLimit: llm.FunctionTool<{
        category: string;
        weeklyLimit?: number | undefined;
        monthlyLimit?: number | undefined;
        alertAt?: number | undefined;
    }, unknown, string>;
    checkSpendingAgainstLimits: llm.FunctionTool<{
        category?: string | undefined;
    }, unknown, string>;
    logSpendingAgainstLimit: llm.FunctionTool<{
        category: string;
        amount: number;
        description?: string | undefined;
    }, unknown, string>;
    createSharedBudget: llm.FunctionTool<{
        budgetType: "yours-mine-ours" | "fully-joint" | "proportional" | "assigned-categories";
        income1?: number | undefined;
        income2?: number | undefined;
        sharedExpenses?: number | undefined;
    }, unknown, string>;
    getPartnerMoneyTalkGuide: llm.FunctionTool<{
        topic: "starting-the-conversation" | "debt-disclosure" | "spending-differences" | "big-purchase" | "financial-goals" | "income-disparity";
    }, unknown, string>;
};
export default createFinancialHabitsTools;
//# sourceMappingURL=financial-habits.d.ts.map