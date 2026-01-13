/**
 * Quant Tools for Peter John
 *
 * Three domains of quantitative analysis:
 * 1. MARKET QUANT - Technical indicators, risk metrics, sector analysis
 * 2. PERSONAL FINANCE QUANT - Net worth, savings rate, retirement readiness
 * 3. COACHING QUANT - Behavioral scoring, decision quality, peer benchmarking
 *
 * All tools designed to give Peter the analytical superpowers of a quant
 * while maintaining his warm, Peter Lynch "invest in what you know" personality.
 */
import { llm } from '@livekit/agents';
export declare function createQuantTools(): {
    technicalIndicators: llm.FunctionTool<{
        symbol: string;
        indicators?: ("all" | "rsi" | "macd" | "sma" | "bollinger")[] | undefined;
    }, unknown, string>;
    riskAnalysis: llm.FunctionTool<{
        symbols: string[];
    }, unknown, string>;
    analyzeSavingsRate: llm.FunctionTool<{
        monthlyIncome: number;
        monthlyExpenses: number;
    }, unknown, string>;
    calculateFIRE: llm.FunctionTool<{
        annualExpenses: number;
        withdrawalRate?: number | undefined;
    }, unknown, string>;
    retirementReadiness: llm.FunctionTool<{
        currentAge: number;
        targetRetirementAge: number;
        currentSavings: number;
        monthlyContribution: number;
        monthlyExpenses: number;
        expectedReturn?: number | undefined;
    }, unknown, string>;
    behavioralScore: llm.FunctionTool<{
        panicSells: number;
        timingAttempts: number;
        impulsePurchases: number;
        budgetAdherence: number;
        savingsConsistency: number;
        debtPaymentConsistency: number;
    }, unknown, string>;
    peerComparison: llm.FunctionTool<{
        ageGroup: "20s" | "30s" | "40s" | "50s" | "60s";
        savingsRate: number;
        netWorth: number;
        debtToIncome: number;
        emergencyFundMonths: number;
    }, unknown, string>;
};
/**
 * Create tools that integrate with Firestore persistence
 * These require userId from context
 */
export declare function createPersistentQuantTools(): {
    saveFinancialProfile: llm.FunctionTool<{
        monthlyIncome: number;
        monthlyExpenses: number;
        currentAge: number;
        targetRetirementAge: number;
        currentRetirementSavings: number;
        riskTolerance: "moderate" | "conservative" | "aggressive";
    }, unknown, string>;
    addToPortfolio: llm.FunctionTool<{
        symbol: string;
        shares: number;
        costBasis: number;
        accountType: "other" | "401k" | "ira" | "roth" | "taxable";
    }, unknown, string>;
    viewPortfolio: llm.FunctionTool<Record<string, never>, unknown, string>;
    getDailyBriefing: llm.FunctionTool<Record<string, never>, unknown, string>;
    recordBehavior: llm.FunctionTool<{
        type: "panicSell" | "timingAttempt" | "impulsePurchase";
        description: string;
        amount?: number | undefined;
    }, unknown, string>;
    recordFIREProgress: llm.FunctionTool<{
        netWorth: number;
        monthlyPassiveIncome?: number | undefined;
    }, unknown, string>;
};
export default createQuantTools;
//# sourceMappingURL=quant-tools.d.ts.map