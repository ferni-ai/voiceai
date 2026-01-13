/**
 * Personal Finance Tools
 *
 * Domain: Banking, home loans, budgeting, debt management, savings goals.
 * Single responsibility: Personal financial planning and advice tools.
 *
 * Jack Bogle believed in simple, practical financial wisdom -
 * these tools help people manage their daily financial lives.
 */
import { llm } from '@livekit/agents';
/**
 * Calculate debt payoff timeline
 */
export declare function calculateDebtPayoff(balance: number, interestRate: number, monthlyPayment: number): {
    monthsToPayoff: number;
    totalInterest: number;
    totalPaid: number;
};
/**
 * Calculate home affordability based on income
 */
export declare function calculateHomeAffordability(annualIncome: number, monthlyDebts: number, downPayment: number, interestRate: number): {
    maxHomePrice: number;
    maxMonthlyPayment: number;
    frontEndRatio: number;
    backEndRatio: number;
};
/**
 * Calculate 50/30/20 budget allocation
 */
export declare function calculateBudgetAllocation(monthlyIncome: number): {
    needs: number;
    wants: number;
    savings: number;
};
/**
 * Calculate CD ladder returns
 */
export declare function calculateCDLadder(totalAmount: number, rates: number[]): {
    totalEarnings: number;
    averageRate: number;
    monthlyIncome: number;
};
/**
 * Calculate FIRE number (Financial Independence, Retire Early)
 */
export declare function calculateFIRENumber(annualExpenses: number, withdrawalRate?: number): {
    fireNumber: number;
    safeAnnualWithdrawal: number;
    yearsOfExpenses: number;
};
export declare function createPersonalFinanceTools(): {
    calculateDebtPayoff: llm.FunctionTool<{
        balance: number;
        interestRate: number;
        monthlyPayment: number;
    }, unknown, string>;
    calculateHomeAffordability: llm.FunctionTool<{
        annualIncome: number;
        monthlyDebts: number;
        downPayment: number;
        interestRate: number;
    }, unknown, string>;
    calculate5030Budget: llm.FunctionTool<{
        monthlyIncome: number;
    }, unknown, string>;
    calculateFIRENumber: llm.FunctionTool<{
        annualExpenses: number;
        withdrawalRate?: number | undefined;
    }, unknown, string>;
    explainBankingConcepts: llm.FunctionTool<{
        concept: "checking" | "hysa" | "cd" | "money_market" | "i_bonds" | "t_bills" | "fdic" | "apr_vs_apy" | "compound_frequency";
    }, unknown, string>;
    explainMortgageConcepts: llm.FunctionTool<{
        concept: "points" | "fixed_vs_arm" | "pmi" | "closing_costs" | "refinancing" | "heloc" | "escrow" | "amortization" | "down_payment" | "dti_ratio" | "preapproval";
    }, unknown, string>;
    explainRetirementAccounts: llm.FunctionTool<{
        accountType: "401k" | "457" | "roth_401k" | "traditional_ira" | "roth_ira" | "403b" | "sep_ira" | "simple_ira" | "hsa" | "backdoor_roth" | "mega_backdoor";
    }, unknown, string>;
};
export default createPersonalFinanceTools;
//# sourceMappingURL=personal-finance.d.ts.map