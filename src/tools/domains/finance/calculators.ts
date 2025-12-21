/**
 * Financial Calculators
 *
 * Domain: All financial calculations and projections.
 * Single responsibility: Pure calculation logic for investing, retirement, fees.
 *
 * These tools embody Jack Bogle's philosophy - showing the power of compounding
 * and the devastating impact of fees.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../../../utils/safe-logger.js';
import { z } from 'zod';

import { getToolDescription } from '../../utils/tool-descriptions.js';
// ============================================================================
// PURE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate compound growth over time
 */
export function calculateCompoundGrowth(
  principal: number,
  monthlyContribution: number,
  years: number,
  annualReturn: number
): { finalValue: number; totalContributed: number; totalGrowth: number } {
  const monthlyRate = annualReturn / 12 / 100;
  const months = years * 12;

  let balance = principal;
  const totalContributed = principal + monthlyContribution * months;

  for (let i = 0; i < months; i++) {
    balance = balance * (1 + monthlyRate) + monthlyContribution;
  }

  return {
    finalValue: Math.round(balance),
    totalContributed: Math.round(totalContributed),
    totalGrowth: Math.round(balance - totalContributed),
  };
}

/**
 * Calculate fee impact over time
 */
export function calculateFeeImpact(
  initialInvestment: number,
  years: number,
  returnRate: number,
  lowFee: number,
  highFee: number
): { lowFeeValue: number; highFeeValue: number; difference: number; percentLost: number } {
  const lowFeeReturn = returnRate - lowFee;
  const highFeeReturn = returnRate - highFee;

  const lowFeeValue = initialInvestment * Math.pow(1 + lowFeeReturn / 100, years);
  const highFeeValue = initialInvestment * Math.pow(1 + highFeeReturn / 100, years);
  const difference = lowFeeValue - highFeeValue;
  const percentLost = (difference / lowFeeValue) * 100;

  return {
    lowFeeValue: Math.round(lowFeeValue),
    highFeeValue: Math.round(highFeeValue),
    difference: Math.round(difference),
    percentLost: Math.round(percentLost),
  };
}

/**
 * Calculate retirement projection with 4% safe withdrawal rate
 */
export function calculateRetirementProjection(
  currentAge: number,
  retirementAge: number,
  currentSavings: number,
  monthlyContribution: number,
  annualReturn: number
): {
  projectedSavings: number;
  monthlyIncome: number;
  yearsOfSavings: number;
  yearsToRetirement: number;
} {
  const years = retirementAge - currentAge;
  const result = calculateCompoundGrowth(currentSavings, monthlyContribution, years, annualReturn);

  // 4% safe withdrawal rate
  const annualIncome = result.finalValue * 0.04;
  const monthlyIncome = annualIncome / 12;
  const yearsOfSavings = result.finalValue / annualIncome;

  return {
    projectedSavings: result.finalValue,
    monthlyIncome: Math.round(monthlyIncome),
    yearsOfSavings: Math.round(yearsOfSavings),
    yearsToRetirement: years,
  };
}

/**
 * Calculate mortgage payment
 */
export function calculateMortgagePayment(
  principal: number,
  annualRate: number,
  years: number
): {
  monthlyPayment: number;
  totalPayment: number;
  totalInterest: number;
} {
  const monthlyRate = annualRate / 100 / 12;
  const numPayments = years * 12;

  // Standard mortgage formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
  const monthlyPayment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, numPayments))) /
    (Math.pow(1 + monthlyRate, numPayments) - 1);

  const totalPayment = monthlyPayment * numPayments;
  const totalInterest = totalPayment - principal;

  return {
    monthlyPayment: Math.round(monthlyPayment),
    totalPayment: Math.round(totalPayment),
    totalInterest: Math.round(totalInterest),
  };
}

/**
 * Calculate emergency fund needs
 */
export function calculateEmergencyFund(
  monthlyExpenses: number,
  monthsCoverage = 6
): {
  targetAmount: number;
  description: string;
} {
  const targetAmount = monthlyExpenses * monthsCoverage;

  return {
    targetAmount,
    description: `${monthsCoverage} months of expenses at $${monthlyExpenses.toLocaleString()}/month`,
  };
}

/**
 * Calculate savings rate
 */
export function calculateSavingsRate(
  income: number,
  savings: number
): {
  rate: number;
  assessment: string;
} {
  const rate = (savings / income) * 100;

  let assessment: string;
  if (rate >= 20) {
    assessment = "Excellent! You're on track for financial independence.";
  } else if (rate >= 15) {
    assessment = 'Good savings rate. Keep it up!';
  } else if (rate >= 10) {
    assessment = 'Solid start, but try to increase if possible.';
  } else {
    assessment = 'Consider ways to boost your savings rate.';
  }

  return { rate: Math.round(rate * 10) / 10, assessment };
}

/**
 * Calculate Rule of 72 (years to double)
 */
export function calculateYearsToDouble(annualReturn: number): number {
  return Math.round(72 / annualReturn);
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createCalculatorTools() {
  return {
    calculateCompoundGrowth: llm.tool({
      description: getToolDescription('calculateCompoundGrowth'),
      parameters: z.object({
        principal: z.number().describe('Starting amount in dollars'),
        annualReturn: z.number().describe('Expected annual return as percentage (e.g., 7 for 7%)'),
        years: z.number().describe('Number of years to invest'),
        monthlyContribution: z
          .number()
          .optional()
          .describe('Optional monthly contribution in dollars'),
      }),
      execute: async ({ principal, annualReturn, years, monthlyContribution = 0 }) => {
        getLogger().info(
          `Calculating compound growth: $${principal} at ${annualReturn}% for ${years} years`
        );
        const result = calculateCompoundGrowth(principal, monthlyContribution, years, annualReturn);

        return `With $${principal.toLocaleString()} initial investment${monthlyContribution > 0 ? ` and $${monthlyContribution.toLocaleString()}/month` : ''} at ${annualReturn}% for ${years} years: You'd have $${result.finalValue.toLocaleString()}! That's $${result.totalContributed.toLocaleString()} contributed and $${result.totalGrowth.toLocaleString()} in growth. The magic of compounding!`;
      },
    }),

    calculateFeeImpact: llm.tool({
      description: getToolDescription('calculateFeeImpact'),
      parameters: z.object({
        investment: z.number().describe('Investment amount in dollars'),
        years: z.number().describe('Investment timeframe in years'),
        highFeePercent: z.number().optional().describe('Higher fee percentage, defaults to 1%'),
        lowFeePercent: z.number().optional().describe('Lower fee percentage, defaults to 0.03%'),
        returnPercent: z
          .number()
          .optional()
          .describe('Expected market return before fees, defaults to 7%'),
      }),
      execute: async ({
        investment,
        years,
        highFeePercent = 1,
        lowFeePercent = 0.03,
        returnPercent = 7,
      }) => {
        getLogger().info(`Calculating fee impact: $${investment} over ${years} years`);
        const result = calculateFeeImpact(
          investment,
          years,
          returnPercent,
          lowFeePercent,
          highFeePercent
        );

        return `[clears throat] This is important! $${investment.toLocaleString()} over ${years} years at ${returnPercent}% return: With ${lowFeePercent}% fees = $${result.lowFeeValue.toLocaleString()}. With ${highFeePercent}% fees = $${result.highFeeValue.toLocaleString()}. That's $${result.difference.toLocaleString()} LOST to fees—${result.percentLost}% of your potential wealth! You get what you DON'T pay for in investing.`;
      },
    }),

    calculateRetirementProjection: llm.tool({
      description: getToolDescription('calculateRetirementProjection'),
      parameters: z.object({
        currentAge: z.number().describe('Current age'),
        retirementAge: z.number().describe('Planned retirement age'),
        currentSavings: z.number().describe('Current retirement savings'),
        monthlyContribution: z.number().describe('Monthly retirement contribution'),
        annualReturn: z.number().optional().describe('Expected annual return, defaults to 7%'),
      }),
      execute: async ({
        currentAge,
        retirementAge,
        currentSavings,
        monthlyContribution,
        annualReturn = 7,
      }) => {
        getLogger().info(
          `Calculating retirement projection: age ${currentAge} to ${retirementAge}`
        );
        const result = calculateRetirementProjection(
          currentAge,
          retirementAge,
          currentSavings,
          monthlyContribution,
          annualReturn
        );

        return `Based on your numbers: In ${result.yearsToRetirement} years at age ${retirementAge}, you could have $${result.projectedSavings.toLocaleString()}. Using the four percent rule, that's about $${result.monthlyIncome.toLocaleString()} per month in retirement income, lasting roughly ${result.yearsOfSavings} years. Not bad! The key is to start early and stay consistent.`;
      },
    }),

    calculateMortgage: llm.tool({
      description: getToolDescription('calculateMortgage'),
      parameters: z.object({
        homePrice: z.number().describe('Home price or loan amount in dollars'),
        downPaymentPercent: z
          .number()
          .optional()
          .describe('Down payment as percentage, defaults to 20%'),
        interestRate: z
          .number()
          .describe('Annual interest rate as percentage (e.g., 6.5 for 6.5%)'),
        termYears: z.number().optional().describe('Loan term in years, defaults to 30'),
      }),
      execute: async ({ homePrice, downPaymentPercent = 20, interestRate, termYears = 30 }) => {
        const downPayment = homePrice * (downPaymentPercent / 100);
        const loanAmount = homePrice - downPayment;
        const result = calculateMortgagePayment(loanAmount, interestRate, termYears);

        getLogger().info(
          `Calculating mortgage: $${loanAmount} at ${interestRate}% for ${termYears} years`
        );

        return `For a $${homePrice.toLocaleString()} home with ${downPaymentPercent}% down ($${downPayment.toLocaleString()}): Your loan would be $${loanAmount.toLocaleString()} at ${interestRate}%. Monthly payment: $${result.monthlyPayment.toLocaleString()}. Over ${termYears} years, you'd pay $${result.totalInterest.toLocaleString()} in interest. That's real money!`;
      },
    }),

    calculateEmergencyFund: llm.tool({
      description: getToolDescription('calculateEmergencyFund'),
      parameters: z.object({
        monthlyExpenses: z.number().describe('Total monthly expenses in dollars'),
        monthsCoverage: z.number().optional().describe('Number of months to cover, defaults to 6'),
      }),
      execute: async ({ monthlyExpenses, monthsCoverage = 6 }) => {
        const result = calculateEmergencyFund(monthlyExpenses, monthsCoverage);

        getLogger().info(
          `Calculating emergency fund: ${monthsCoverage} months of $${monthlyExpenses}`
        );

        return `For ${result.description}, you'd want $${result.targetAmount.toLocaleString()} in your emergency fund. Keep this in a high-yield savings account—liquid and safe, not invested. It's your financial insurance policy.`;
      },
    }),

    calculateSavingsRate: llm.tool({
      description: getToolDescription('calculateSavingsRate'),
      parameters: z.object({
        monthlyIncome: z.number().describe('Monthly income in dollars'),
        monthlySavings: z.number().describe('Monthly savings/investments in dollars'),
      }),
      execute: async ({ monthlyIncome, monthlySavings }) => {
        const result = calculateSavingsRate(monthlyIncome, monthlySavings);

        getLogger().info(`Calculating savings rate: $${monthlySavings}/$${monthlyIncome}`);

        return `Your savings rate is ${result.rate}%. ${result.assessment} Remember: pay yourself first!`;
      },
    }),

    calculateYearsToDouble: llm.tool({
      description: getToolDescription('calculateYearsToDouble'),
      parameters: z.object({
        annualReturn: z.number().describe('Expected annual return as percentage'),
      }),
      execute: async ({ annualReturn }) => {
        const years = calculateYearsToDouble(annualReturn);

        getLogger().info(`Rule of 72: ${annualReturn}% return`);

        return `At ${annualReturn}% annual return, your money doubles every ${years} years. That's the Rule of 72—divide 72 by your return rate. Simple but powerful!`;
      },
    }),

    explainPrinciple: llm.tool({
      description: getToolDescription('explainPrinciple'),
      parameters: z.object({
        principle: z
          .enum(['goals', 'balance', 'cost', 'discipline', 'all'])
          .describe('Which principle to explain'),
      }),
      execute: async ({ principle }) => {
        getLogger().info(`Explaining principle: ${principle}`);

        const explanations: Record<string, string> = {
          goals: `GOALS: Create clear, appropriate investment goals. First question: What are you investing for? Retirement? A house? Education? Your goal shapes everything. For short-term goals, savings matter more than returns. For a 2-year goal, 94% comes from what you save, only 6% from returns. Even over 10 years, it's 80% savings. Only over 30+ years do returns become equally important.`,
          balance: `BALANCE: Keep a balanced and diversified mix. Your asset allocation—stocks vs bonds—is the biggest decision you'll make. Stocks averaged 8.1% since 1901 but swing wildly. Bonds averaged 4.7% but are steadier. Diversify across AND within asset classes. Buy the haystack, not the needle.`,
          cost: `COST: Minimize costs. This is my crusade! In investing, you get what you DON'T pay for. $100,000 at 0.1% fees grows to $557,000 in 30 years. At 2% fees? Just $317,000. That's $240,000 lost to fees! Lower-cost funds actually outperform higher-cost ones.`,
          discipline: `DISCIPLINE: Maintain perspective and long-term discipline. This is where most people fail. In March 2020, panic sellers earned -2%. Those who stayed earned 21%. Twenty-three percentage points lost to panic! Stay the course. Time in the market beats timing the market.`,
          all: `Vanguard's four principles: GOALS—create clear investment goals. BALANCE—diversify your mix. COST—minimize fees because you get what you don't pay for. DISCIPLINE—stay the course through ups and downs. Focus on what you can control.`,
        };

        return explanations[principle] || explanations.all;
      },
    }),
  };
}

export default createCalculatorTools;
