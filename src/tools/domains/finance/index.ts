/**
 * Finance Domain Tools
 *
 * Tools for banking, budgeting, spending analysis, and financial calculations.
 * This domain wraps existing tools in registry-compatible definitions.
 *
 * DOMAIN: finance
 * TOOLS:
 *   Banking (Plaid): checkBankLinkStatus, linkBankAccount, getAccountBalances, getTransactions
 *   Spending: getSpendingAnalysis, checkFinancialHealth, getCategorizedSpending
 *   Calculators: calculateCompoundGrowth, calculateRetirementProjection, calculateFeeImpact
 *   Personal Finance: calculateDebtPayoff, calculateHomeAffordability, calculate5030Budget
 */

import { createDomainExport } from '../../registry/loader.js';
import type { ToolDefinition, ToolContext, ExternalService } from '../../registry/types.js';

// Import legacy tool creators
import { createPlaidTools } from '../../plaid.js';
import { createPersonalFinanceTools } from '../../personal-finance.js';
import { createCalculatorTools } from '../../calculators.js';

// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================

function wrapLegacyTool(
  id: string,
  name: string,
  description: string,
  legacyTool: unknown,
  options?: {
    tags?: string[];
    requiredServices?: ExternalService[];
  }
): ToolDefinition {
  return {
    id,
    name,
    description,
    domain: 'finance',
    tags: ['finance', ...(options?.tags || [])],
    requiredServices: options?.requiredServices,
    create: (_ctx: ToolContext) => legacyTool,
  };
}

// ============================================================================
// PLAID / BANKING TOOLS
// ============================================================================

function getBankingToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPlaidTools();

  return [
    wrapLegacyTool(
      'checkBankLinkStatus',
      'Check Bank Link Status',
      'Check if the user has linked their bank account',
      legacyTools.checkBankLinkStatus,
      { tags: ['banking', 'plaid', 'status'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'linkBankAccount',
      'Link Bank Account',
      'Start the process of linking a bank account via Plaid',
      legacyTools.linkBankAccount,
      { tags: ['banking', 'plaid', 'setup'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'unlinkBankAccount',
      'Unlink Bank Account',
      'Disconnect a linked bank account',
      legacyTools.unlinkBankAccount,
      { tags: ['banking', 'plaid', 'disconnect'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'getAccountBalances',
      'Get Account Balances',
      'Get current balances for all linked bank accounts',
      legacyTools.getAccountBalances,
      { tags: ['banking', 'balances', 'accounts'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'getRecentTransactions',
      'Get Recent Transactions',
      'Get recent transactions from linked bank accounts',
      legacyTools.getRecentTransactions,
      { tags: ['banking', 'transactions', 'history'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'getSpendingAnalysis',
      'Get Spending Analysis',
      'Analyze spending patterns by category and time period',
      legacyTools.getSpendingAnalysis,
      { tags: ['banking', 'spending', 'analysis'], requiredServices: ['plaid'] }
    ),
    wrapLegacyTool(
      'checkFinancialHealth',
      'Check Financial Health',
      'Get an overall assessment of financial health based on account data',
      legacyTools.checkFinancialHealth,
      { tags: ['banking', 'health', 'assessment'], requiredServices: ['plaid'] }
    ),
  ];
}

// ============================================================================
// CALCULATOR TOOLS
// ============================================================================

function getCalculatorToolDefinitions(): ToolDefinition[] {
  const legacyTools = createCalculatorTools();

  return [
    wrapLegacyTool(
      'calculateCompoundGrowth',
      'Calculate Compound Growth',
      'Calculate how an investment grows over time with compound interest',
      legacyTools.calculateCompoundGrowth,
      { tags: ['calculators', 'compound', 'investing'] }
    ),
    wrapLegacyTool(
      'calculateFeeImpact',
      'Calculate Fee Impact',
      'See how investment fees reduce returns over time',
      legacyTools.calculateFeeImpact,
      { tags: ['calculators', 'fees', 'costs'] }
    ),
    wrapLegacyTool(
      'calculateRetirementProjection',
      'Calculate Retirement Projection',
      'Project retirement savings based on contributions and growth',
      legacyTools.calculateRetirementProjection,
      { tags: ['calculators', 'retirement', 'planning'] }
    ),
    wrapLegacyTool(
      'calculateMortgage',
      'Calculate Mortgage',
      'Calculate monthly mortgage payments and total interest',
      legacyTools.calculateMortgage,
      { tags: ['calculators', 'mortgage', 'housing'] }
    ),
    wrapLegacyTool(
      'calculateEmergencyFund',
      'Calculate Emergency Fund',
      'Determine how much to save for an emergency fund',
      legacyTools.calculateEmergencyFund,
      { tags: ['calculators', 'emergency', 'savings'] }
    ),
    wrapLegacyTool(
      'calculateSavingsRate',
      'Calculate Savings Rate',
      'Calculate what percentage of income is being saved',
      legacyTools.calculateSavingsRate,
      { tags: ['calculators', 'savings', 'rate'] }
    ),
    wrapLegacyTool(
      'calculateYearsToDouble',
      'Calculate Years to Double',
      'Calculate how long it takes for money to double at a given rate',
      legacyTools.calculateYearsToDouble,
      { tags: ['calculators', 'growth', 'rule-of-72'] }
    ),
    wrapLegacyTool(
      'explainPrinciple',
      'Explain Principle',
      'Explain a financial principle or concept in simple terms',
      legacyTools.explainPrinciple,
      { tags: ['education', 'concepts', 'explanations'] }
    ),
  ];
}

// ============================================================================
// PERSONAL FINANCE TOOLS
// ============================================================================

function getPersonalFinanceToolDefinitions(): ToolDefinition[] {
  const legacyTools = createPersonalFinanceTools();

  return [
    wrapLegacyTool(
      'calculateDebtPayoff',
      'Calculate Debt Payoff',
      'Calculate timeline and interest for paying off debt',
      legacyTools.calculateDebtPayoff,
      { tags: ['debt', 'payoff', 'planning'] }
    ),
    wrapLegacyTool(
      'calculateHomeAffordability',
      'Calculate Home Affordability',
      'Determine how much house you can afford based on income and expenses',
      legacyTools.calculateHomeAffordability,
      { tags: ['housing', 'affordability', 'planning'] }
    ),
    wrapLegacyTool(
      'calculate5030Budget',
      'Calculate 50/30/20 Budget',
      'Apply the 50/30/20 budgeting rule to income',
      legacyTools.calculate5030Budget,
      { tags: ['budget', '50-30-20', 'planning'] }
    ),
    wrapLegacyTool(
      'calculateFIRENumber',
      'Calculate FIRE Number',
      'Calculate the amount needed for financial independence',
      legacyTools.calculateFIRENumber,
      { tags: ['fire', 'independence', 'retirement'] }
    ),
    wrapLegacyTool(
      'explainBankingConcepts',
      'Explain Banking Concepts',
      'Explain banking terms and concepts in plain language',
      legacyTools.explainBankingConcepts,
      { tags: ['education', 'banking', 'concepts'] }
    ),
    wrapLegacyTool(
      'explainMortgageConcepts',
      'Explain Mortgage Concepts',
      'Explain mortgage terms and concepts clearly',
      legacyTools.explainMortgageConcepts,
      { tags: ['education', 'mortgage', 'concepts'] }
    ),
    wrapLegacyTool(
      'explainRetirementAccounts',
      'Explain Retirement Accounts',
      'Explain different retirement account types (401k, IRA, etc.)',
      legacyTools.explainRetirementAccounts,
      { tags: ['education', 'retirement', 'accounts'] }
    ),
  ];
}

// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================

const financeTools: ToolDefinition[] = [
  ...getBankingToolDefinitions(),
  ...getCalculatorToolDefinitions(),
  ...getPersonalFinanceToolDefinitions(),
];

// ============================================================================
// EXPORTS
// ============================================================================

export const { getToolDefinitions, domain, definitions } = createDomainExport(
  'finance',
  financeTools
);

export {
  getBankingToolDefinitions,
  getCalculatorToolDefinitions,
  getPersonalFinanceToolDefinitions,
};

export default getToolDefinitions;

