/**
 * Personal Finance Tools
 *
 * Domain: Banking, home loans, budgeting, debt management, savings goals.
 * Single responsibility: Personal financial planning and advice tools.
 *
 * Jack Bogle believed in simple, practical financial wisdom -
 * these tools help people manage their daily financial lives.
 */

import { llm, log } from '@livekit/agents';
import { getLogger } from '../utils/safe-logger.js';
import { z } from 'zod';

// ============================================================================
// PURE CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate debt payoff timeline
 */
export function calculateDebtPayoff(
  balance: number,
  interestRate: number,
  monthlyPayment: number
): {
  monthsToPayoff: number;
  totalInterest: number;
  totalPaid: number;
} {
  const monthlyRate = interestRate / 100 / 12;
  let remaining = balance;
  let months = 0;
  let totalInterest = 0;

  while (remaining > 0 && months < 360) {
    // Cap at 30 years
    const interestCharge = remaining * monthlyRate;
    totalInterest += interestCharge;
    remaining = remaining + interestCharge - monthlyPayment;
    months++;

    // Prevent infinite loop if payment doesn't cover interest
    if (monthlyPayment <= interestCharge && months > 1) {
      return { monthsToPayoff: -1, totalInterest: -1, totalPaid: -1 }; // Can't pay off
    }
  }

  return {
    monthsToPayoff: months,
    totalInterest: Math.round(totalInterest),
    totalPaid: Math.round(balance + totalInterest),
  };
}

/**
 * Calculate home affordability based on income
 */
export function calculateHomeAffordability(
  annualIncome: number,
  monthlyDebts: number,
  downPayment: number,
  interestRate: number
): {
  maxHomePrice: number;
  maxMonthlyPayment: number;
  frontEndRatio: number;
  backEndRatio: number;
} {
  // Standard DTI ratios: 28% front-end (housing), 36% back-end (total debt)
  const monthlyIncome = annualIncome / 12;
  const maxHousingPayment = monthlyIncome * 0.28;
  const maxTotalDebt = monthlyIncome * 0.36;
  const availableForHousing = Math.min(maxHousingPayment, maxTotalDebt - monthlyDebts);

  // Reverse mortgage calculation to find max loan
  const monthlyRate = interestRate / 100 / 12;
  const numPayments = 30 * 12;
  const maxLoan =
    (availableForHousing * (Math.pow(1 + monthlyRate, numPayments) - 1)) /
    (monthlyRate * Math.pow(1 + monthlyRate, numPayments));

  const maxHomePrice = maxLoan + downPayment;

  return {
    maxHomePrice: Math.round(maxHomePrice),
    maxMonthlyPayment: Math.round(availableForHousing),
    frontEndRatio: 28,
    backEndRatio: 36,
  };
}

/**
 * Calculate 50/30/20 budget allocation
 */
export function calculateBudgetAllocation(monthlyIncome: number): {
  needs: number;
  wants: number;
  savings: number;
} {
  return {
    needs: Math.round(monthlyIncome * 0.5), // 50% for needs
    wants: Math.round(monthlyIncome * 0.3), // 30% for wants
    savings: Math.round(monthlyIncome * 0.2), // 20% for savings/debt
  };
}

/**
 * Calculate CD ladder returns
 */
export function calculateCDLadder(
  totalAmount: number,
  rates: number[] // Array of rates for each rung (1yr, 2yr, 3yr, etc.)
): {
  totalEarnings: number;
  averageRate: number;
  monthlyIncome: number;
} {
  const amountPerRung = totalAmount / rates.length;
  let totalEarnings = 0;

  // Simple calculation assuming rates stay constant
  for (const rate of rates) {
    totalEarnings += amountPerRung * (rate / 100);
  }

  const averageRate = rates.reduce((a, b) => a + b, 0) / rates.length;

  return {
    totalEarnings: Math.round(totalEarnings),
    averageRate: Math.round(averageRate * 100) / 100,
    monthlyIncome: Math.round(totalEarnings / 12),
  };
}

/**
 * Calculate FIRE number (Financial Independence, Retire Early)
 */
export function calculateFIRENumber(
  annualExpenses: number,
  withdrawalRate = 4
): {
  fireNumber: number;
  safeAnnualWithdrawal: number;
  yearsOfExpenses: number;
} {
  const fireNumber = annualExpenses * (100 / withdrawalRate);

  return {
    fireNumber: Math.round(fireNumber),
    safeAnnualWithdrawal: annualExpenses,
    yearsOfExpenses: 100 / withdrawalRate,
  };
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createPersonalFinanceTools() {
  return {
    calculateDebtPayoff: llm.tool({
      description:
        'Calculate how long to pay off a debt and total interest cost. Use for credit cards, student loans, car loans.',
      parameters: z.object({
        balance: z.number().describe('Current debt balance in dollars'),
        interestRate: z.number().describe('Annual interest rate as percentage (e.g., 18 for 18%)'),
        monthlyPayment: z.number().describe('Monthly payment amount in dollars'),
      }),
      execute: async ({ balance, interestRate, monthlyPayment }) => {
        getLogger().info(`Calculating debt payoff: $${balance} at ${interestRate}%`);
        const result = calculateDebtPayoff(balance, interestRate, monthlyPayment);

        if (result.monthsToPayoff === -1) {
          return `Hmm, that payment of $${monthlyPayment}/month won't cover the interest on a ${interestRate}% rate. You'd need to pay at least $${Math.ceil((balance * interestRate) / 100 / 12)}/month just to cover interest. Try to increase your payment!`;
        }

        const years = Math.floor(result.monthsToPayoff / 12);
        const months = result.monthsToPayoff % 12;
        const timeStr = years > 0 ? `${years} years and ${months} months` : `${months} months`;

        return `Paying $${monthlyPayment}/month on a $${balance.toLocaleString()} debt at ${interestRate}%: You'd be debt-free in ${timeStr}. Total interest: $${result.totalInterest.toLocaleString()}. That's real money! Consider paying more if you can.`;
      },
    }),

    calculateHomeAffordability: llm.tool({
      description:
        'Calculate how much home you can afford based on income and debts using standard 28/36 DTI ratios.',
      parameters: z.object({
        annualIncome: z.number().describe('Annual household income'),
        monthlyDebts: z
          .number()
          .describe('Total monthly debt payments (car, student loans, credit cards)'),
        downPayment: z.number().describe('Down payment amount in dollars'),
        interestRate: z.number().describe('Expected mortgage rate as percentage'),
      }),
      execute: async ({ annualIncome, monthlyDebts, downPayment, interestRate }) => {
        getLogger().info(`Calculating home affordability: income $${annualIncome}`);
        const result = calculateHomeAffordability(
          annualIncome,
          monthlyDebts,
          downPayment,
          interestRate
        );

        return `Based on $${annualIncome.toLocaleString()} income, $${monthlyDebts.toLocaleString()}/month in debts, and $${downPayment.toLocaleString()} down: You could afford roughly $${result.maxHomePrice.toLocaleString()} home. That keeps your housing payment around $${result.maxMonthlyPayment.toLocaleString()}/month (28% of income). Don't forget property taxes and insurance add more!`;
      },
    }),

    calculate5030Budget: llm.tool({
      description:
        'Calculate budget allocation using the 50/30/20 rule - 50% needs, 30% wants, 20% savings.',
      parameters: z.object({
        monthlyIncome: z.number().describe('Monthly take-home income'),
      }),
      execute: async ({ monthlyIncome }) => {
        getLogger().info(`Calculating 50/30/20 budget: $${monthlyIncome}`);
        const result = calculateBudgetAllocation(monthlyIncome);

        return `With $${monthlyIncome.toLocaleString()} monthly income, the 50/30/20 rule suggests: NEEDS (rent, utilities, food, insurance): $${result.needs.toLocaleString()} | WANTS (entertainment, dining out): $${result.wants.toLocaleString()} | SAVINGS/DEBT: $${result.savings.toLocaleString()}. Simple and effective!`;
      },
    }),

    calculateFIRENumber: llm.tool({
      description:
        'Calculate your Financial Independence number - how much you need to retire early.',
      parameters: z.object({
        annualExpenses: z.number().describe('Expected annual expenses in retirement'),
        withdrawalRate: z
          .number()
          .optional()
          .describe('Safe withdrawal rate percentage, defaults to 4%'),
      }),
      execute: async ({ annualExpenses, withdrawalRate = 4 }) => {
        getLogger().info(`Calculating FIRE number: $${annualExpenses}/year at ${withdrawalRate}%`);
        const result = calculateFIRENumber(annualExpenses, withdrawalRate);

        return `For financial independence with $${annualExpenses.toLocaleString()}/year expenses: You'd need $${result.fireNumber.toLocaleString()} invested. At a ${withdrawalRate}% withdrawal rate, that's ${result.yearsOfExpenses} years of expenses covered by your portfolio. The ${withdrawalRate}% rule has historically survived most market conditions.`;
      },
    }),

    explainBankingConcepts: llm.tool({
      description: 'Explain banking and savings concepts in simple terms.',
      parameters: z.object({
        concept: z
          .enum([
            'hysa',
            'cd',
            'money_market',
            'i_bonds',
            't_bills',
            'checking',
            'fdic',
            'apr_vs_apy',
            'compound_frequency',
          ])
          .describe('Banking concept to explain'),
      }),
      execute: async ({ concept }) => {
        getLogger().info(`Explaining banking concept: ${concept}`);

        const explanations: Record<string, string> = {
          hysa: `HIGH-YIELD SAVINGS ACCOUNTS: These online banks pay 4-5% interest instead of the 0.01% at big banks. Your money is just as safe (FDIC insured), just more accessible. Great for emergency funds. Shop around—rates vary!`,
          cd: `CERTIFICATES OF DEPOSIT: You lock up your money for a set time (3 months to 5 years) in exchange for a guaranteed rate. Usually pays more than savings. The catch? Early withdrawal penalties. Consider a CD ladder for flexibility.`,
          money_market: `MONEY MARKET ACCOUNTS: Like a savings account but sometimes with check-writing. Rates are competitive with HYSAs. Good for short-term goals or emergency funds. FDIC insured like regular savings.`,
          i_bonds: `I BONDS: Government savings bonds that protect against inflation. The rate adjusts with CPI. $10,000 annual limit per person. You can't sell for the first year, and you lose 3 months interest if sold before 5 years. Great inflation hedge!`,
          t_bills: `TREASURY BILLS: Short-term government debt (4 weeks to 1 year). Considered the safest investment. Interest is state-tax free. You can buy directly at TreasuryDirect.gov. Currently paying competitive rates.`,
          checking: `CHECKING ACCOUNTS: Your transaction hub—direct deposits, bill pay, debit card. Most pay zero interest. Keep only what you need here; excess should go to savings. Watch out for fees!`,
          fdic: `FDIC INSURANCE: The government guarantees your deposits up to $250,000 per depositor, per bank. Your money is safe even if the bank fails. This is why bank runs are rare. Always check that your bank is FDIC insured!`,
          apr_vs_apy: `APR vs APY: APR is the simple annual rate. APY includes the effect of compounding. A 5% APR compounded monthly = 5.12% APY. For savings, look at APY. For loans, look at APR. The difference matters!`,
          compound_frequency: `COMPOUNDING FREQUENCY: Daily compounding beats monthly beats annually. At 5%: Annual compounding = $1,050 after one year. Daily compounding = $1,051.27. Small difference short-term, bigger over decades!`,
        };

        return (
          explanations[concept] || "Let me know which banking concept you'd like me to explain."
        );
      },
    }),

    explainMortgageConcepts: llm.tool({
      description: 'Explain home loan and mortgage concepts in simple terms.',
      parameters: z.object({
        concept: z
          .enum([
            'fixed_vs_arm',
            'pmi',
            'points',
            'closing_costs',
            'refinancing',
            'heloc',
            'escrow',
            'amortization',
            'down_payment',
            'dti_ratio',
            'preapproval',
          ])
          .describe('Mortgage concept to explain'),
      }),
      execute: async ({ concept }) => {
        getLogger().info(`Explaining mortgage concept: ${concept}`);

        const explanations: Record<string, string> = {
          fixed_vs_arm: `FIXED vs ARM: Fixed-rate locks your rate for 30 years—predictable payments. Adjustable-rate (ARM) starts lower but can change after 5-7 years. Fixed is usually safer. ARMs can make sense if you'll move soon, but they're riskier.`,
          pmi: `PMI (Private Mortgage Insurance): If you put less than 20% down, you pay extra monthly insurance protecting the lender. Usually 0.5-1% of loan annually. It goes away once you hit 20% equity. That's why 20% down is ideal.`,
          points: `MORTGAGE POINTS: Prepaid interest to lower your rate. 1 point = 1% of loan = roughly 0.25% rate reduction. Worth it if you'll stay 7+ years. Do the math on break-even point before buying points.`,
          closing_costs: `CLOSING COSTS: Fees for buying a home—typically 2-5% of purchase price. Includes appraisal, title insurance, attorney, lender fees. Can sometimes be negotiated or seller-paid. Budget for them!`,
          refinancing: `REFINANCING: Replacing your mortgage with a new one, usually for a lower rate. Rule of thumb: refinance if you can drop 1%+ and stay 5+ years. Watch closing costs—they eat into savings.`,
          heloc: `HELOC (Home Equity Line of Credit): Borrow against your home equity like a credit card. Variable rate, interest-only payments possible. Good for renovations or emergencies. Dangerous if overused—your house is collateral!`,
          escrow: `ESCROW: Your lender collects property taxes and insurance monthly with your payment, holds it, and pays when due. Makes budgeting easier. Most lenders require it for loans with less than 20% down.`,
          amortization: `AMORTIZATION: How your loan is paid off over time. Early payments are mostly interest; later payments are mostly principal. That's why extra principal payments early have huge impact!`,
          down_payment: `DOWN PAYMENT: The upfront cash you bring. 20% avoids PMI and gets best rates. 10% is reasonable. 3-5% is possible but expensive long-term. More down = lower monthly payment and less interest overall.`,
          dti_ratio: `DTI RATIO: Debt-to-income ratio. Lenders want housing costs under 28% of gross income (front-end) and total debt under 36% (back-end). Lower DTI = better rates and easier approval.`,
          preapproval: `PREAPPROVAL: A lender reviews your finances and tells you how much you can borrow. Stronger than prequalification. Get it before house hunting—sellers take you more seriously. Good for 60-90 days typically.`,
        };

        return (
          explanations[concept] || "Let me know which mortgage concept you'd like me to explain."
        );
      },
    }),

    explainRetirementAccounts: llm.tool({
      description: 'Explain retirement account types and rules.',
      parameters: z.object({
        accountType: z
          .enum([
            '401k',
            'roth_401k',
            'traditional_ira',
            'roth_ira',
            '403b',
            '457',
            'sep_ira',
            'simple_ira',
            'hsa',
            'backdoor_roth',
            'mega_backdoor',
          ])
          .describe('Retirement account type to explain'),
      }),
      execute: async ({ accountType }) => {
        getLogger().info(`Explaining retirement account: ${accountType}`);

        const explanations: Record<string, string> = {
          '401k': `401(K): Employer-sponsored retirement. Pre-tax contributions lower your taxable income now; you pay taxes in retirement. 2024 limit: $23,000 (plus $7,500 catch-up if 50+). ALWAYS get the full employer match—it's free money!`,
          roth_401k: `ROTH 401(K): Like regular 401k but contributions are after-tax. Growth and withdrawals are tax-free in retirement. Great if you expect higher taxes later. Same contribution limits as traditional 401k.`,
          traditional_ira: `TRADITIONAL IRA: Individual retirement account. Pre-tax contributions (maybe deductible). 2024 limit: $7,000 (plus $1,000 catch-up if 50+). Good if you don't have a 401k or want more tax-deferred space.`,
          roth_ira: `ROTH IRA: After-tax contributions, tax-free growth and withdrawals. 2024 limit: $7,000. Income limits apply ($161k single, $240k married). Best if you're in a low tax bracket now. Contributions (not earnings) can be withdrawn anytime.`,
          '403b': `403(B): Like a 401k but for non-profits, schools, hospitals. Same contribution limits. Watch out—some have expensive investment options. Push for low-cost index funds if available.`,
          '457': `457 PLAN: For government employees. No 10% early withdrawal penalty! Can contribute to 457 AND 403b/401k. Great for early retirement planning.`,
          sep_ira: `SEP IRA: For self-employed. Employer contributions only, up to 25% of compensation (max $69,000 in 2024). Easy to set up, flexible. Great for small business owners.`,
          simple_ira: `SIMPLE IRA: For small businesses. Lower limits ($16,000 in 2024) but employer must match or contribute. Good stepping stone before 401k.`,
          hsa: `HSA (Health Savings Account): Triple tax advantage! Pre-tax in, grows tax-free, tax-free for medical expenses. Requires high-deductible health plan. 2024 limit: $4,150 single, $8,300 family. The only account with triple tax benefit!`,
          backdoor_roth: `BACKDOOR ROTH: Make non-deductible IRA contribution, then convert to Roth. Bypasses income limits. Legal and common. Watch out for pro-rata rule if you have traditional IRA money.`,
          mega_backdoor: `MEGA BACKDOOR ROTH: Contribute after-tax to 401k, convert to Roth. Can add $46,000+ beyond normal 401k limits. Not all plans allow it. Powerful if available!`,
        };

        return (
          explanations[accountType] ||
          "Let me know which retirement account you'd like me to explain."
        );
      },
    }),
  };
}

export default createPersonalFinanceTools;
