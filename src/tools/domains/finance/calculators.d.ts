/**
 * Financial Calculators
 *
 * Domain: All financial calculations and projections.
 * Single responsibility: Pure calculation logic for investing, retirement, fees.
 *
 * These tools embody Jack Bogle's philosophy - showing the power of compounding
 * and the devastating impact of fees.
 */
import { llm } from '@livekit/agents';
/**
 * Calculate compound growth over time
 */
export declare function calculateCompoundGrowth(principal: number, monthlyContribution: number, years: number, annualReturn: number): {
    finalValue: number;
    totalContributed: number;
    totalGrowth: number;
};
/**
 * Calculate fee impact over time
 */
export declare function calculateFeeImpact(initialInvestment: number, years: number, returnRate: number, lowFee: number, highFee: number): {
    lowFeeValue: number;
    highFeeValue: number;
    difference: number;
    percentLost: number;
};
/**
 * Calculate retirement projection with 4% safe withdrawal rate
 */
export declare function calculateRetirementProjection(currentAge: number, retirementAge: number, currentSavings: number, monthlyContribution: number, annualReturn: number): {
    projectedSavings: number;
    monthlyIncome: number;
    yearsOfSavings: number;
    yearsToRetirement: number;
};
/**
 * Calculate mortgage payment
 */
export declare function calculateMortgagePayment(principal: number, annualRate: number, years: number): {
    monthlyPayment: number;
    totalPayment: number;
    totalInterest: number;
};
/**
 * Calculate emergency fund needs
 */
export declare function calculateEmergencyFund(monthlyExpenses: number, monthsCoverage?: number): {
    targetAmount: number;
    description: string;
};
/**
 * Calculate savings rate
 */
export declare function calculateSavingsRate(income: number, savings: number): {
    rate: number;
    assessment: string;
};
/**
 * Calculate Rule of 72 (years to double)
 */
export declare function calculateYearsToDouble(annualReturn: number): number;
export declare function createCalculatorTools(): {
    calculateCompoundGrowth: llm.FunctionTool<{
        principal: number;
        annualReturn: number;
        years: number;
        monthlyContribution?: number | undefined;
    }, unknown, string>;
    calculateFeeImpact: llm.FunctionTool<{
        investment: number;
        years: number;
        highFeePercent?: number | undefined;
        lowFeePercent?: number | undefined;
        returnPercent?: number | undefined;
    }, unknown, string>;
    calculateRetirementProjection: llm.FunctionTool<{
        currentAge: number;
        retirementAge: number;
        currentSavings: number;
        monthlyContribution: number;
        annualReturn?: number | undefined;
    }, unknown, string>;
    calculateMortgage: llm.FunctionTool<{
        homePrice: number;
        interestRate: number;
        downPaymentPercent?: number | undefined;
        termYears?: number | undefined;
    }, unknown, string>;
    calculateEmergencyFund: llm.FunctionTool<{
        monthlyExpenses: number;
        monthsCoverage?: number | undefined;
    }, unknown, string>;
    calculateSavingsRate: llm.FunctionTool<{
        monthlyIncome: number;
        monthlySavings: number;
    }, unknown, string>;
    calculateYearsToDouble: llm.FunctionTool<{
        annualReturn: number;
    }, unknown, string>;
    explainPrinciple: llm.FunctionTool<{
        principle: "all" | "goals" | "cost" | "balance" | "discipline";
    }, unknown, string>;
};
export default createCalculatorTools;
//# sourceMappingURL=calculators.d.ts.map