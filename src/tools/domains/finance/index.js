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
// Import tool creators (now co-located in finance domain)
import { createPlaidTools } from './plaid.js';
import { createPersonalFinanceTools } from './personal-finance.js';
import { createCalculatorTools } from './calculators.js';
// ============================================================================
// LEGACY TOOL WRAPPER
// ============================================================================
function wrapLegacyTool(id, name, description, legacyTool, options) {
    return {
        id,
        name,
        description,
        domain: 'finance',
        tags: ['finance', ...(options?.tags || [])],
        requiredServices: options?.requiredServices,
        create: (_ctx) => legacyTool,
    };
}
// ============================================================================
// PLAID / BANKING TOOLS (Consolidated: 7 → 3 essential tools)
// ============================================================================
function getBankingToolDefinitions() {
    const legacyTools = createPlaidTools();
    // Consolidated: bankAccount handles link/unlink/status, bankData handles balances/transactions/analysis
    return [
        wrapLegacyTool('bankAccount', 'Bank Account', 'Manage bank account connection: check link status, link a new bank account via Plaid, or unlink an existing account. Actions: "status", "link", or "unlink". Required for spending analysis and balance checking.', legacyTools.linkBankAccount, {
            tags: ['banking', 'plaid', 'setup', 'status', 'link', 'unlink'],
            requiredServices: ['plaid'],
        }),
        wrapLegacyTool('bankData', 'Bank Data', 'Get financial data from linked accounts: account balances, recent transactions, or spending analysis by category. Actions: "balances", "transactions", or "spending". Requires linked bank account.', legacyTools.getAccountBalances, {
            tags: ['banking', 'balances', 'transactions', 'spending', 'analysis'],
            requiredServices: ['plaid'],
        }),
        wrapLegacyTool('financialHealth', 'Financial Health', 'Get a comprehensive financial health assessment based on linked account data. Shows savings rate, spending patterns, debt-to-income, and personalized recommendations.', legacyTools.checkFinancialHealth, { tags: ['banking', 'health', 'assessment', 'recommendations'], requiredServices: ['plaid'] }),
    ];
}
// ============================================================================
// CALCULATOR TOOLS (Consolidated: 8 → 3 essential tools)
// ============================================================================
function getCalculatorToolDefinitions() {
    const legacyTools = createCalculatorTools();
    // Consolidated: investmentCalc for growth/fees/retirement, housingCalc for mortgage/affordability,
    // savingsCalc for emergency fund/savings rate/years to double
    return [
        wrapLegacyTool('investmentCalc', 'Investment Calculator', 'Calculate investment growth, fee impact, or retirement projections. Modes: "growth" (compound interest over time), "fees" (how fees reduce returns), or "retirement" (project retirement savings). Uses Rule of 72 for quick estimates.', legacyTools.calculateCompoundGrowth, { tags: ['calculators', 'investing', 'compound', 'fees', 'retirement'] }),
        wrapLegacyTool('housingCalc', 'Housing Calculator', 'Calculate mortgage payments, total interest, or home affordability. Modes: "mortgage" (monthly payment and total cost), "affordability" (how much house you can afford based on income). Includes down payment scenarios.', legacyTools.calculateMortgage, { tags: ['calculators', 'mortgage', 'housing', 'affordability'] }),
        wrapLegacyTool('savingsCalc', 'Savings Calculator', 'Calculate emergency fund target, savings rate, or time to reach goals. Modes: "emergency" (3-6 month fund target), "rate" (what % of income you\'re saving), or "double" (years to double money at given rate).', legacyTools.calculateEmergencyFund, { tags: ['calculators', 'savings', 'emergency', 'rate'] }),
    ];
}
// ============================================================================
// PERSONAL FINANCE TOOLS (Consolidated: 7 → 3 essential tools)
// ============================================================================
function getPersonalFinanceToolDefinitions() {
    const legacyTools = createPersonalFinanceTools();
    // Consolidated: debtPayoff for debt planning, budgetPlanner for 50/30/20 and FIRE,
    // financeEducation for all concept explanations
    return [
        wrapLegacyTool('debtPayoff', 'Debt Payoff Planner', 'Calculate debt payoff timeline, total interest, and strategies. Supports: snowball method (smallest first), avalanche method (highest interest first), or custom. Shows monthly payment needed and payoff date.', legacyTools.calculateDebtPayoff, { tags: ['debt', 'payoff', 'snowball', 'avalanche', 'planning'] }),
        wrapLegacyTool('budgetPlanner', 'Budget Planner', 'Create a budget using the 50/30/20 rule (needs/wants/savings), or explore what financial security might look like for you. Modes: "budget" (allocate income) or "security" (explore your personal financial freedom target).', legacyTools.calculate5030Budget, { tags: ['budget', '50-30-20', 'security', 'freedom', 'planning'] }),
        wrapLegacyTool('financeEducation', 'Finance Education', 'Explain financial concepts in plain language. Topics: banking (APY, overdraft, etc.), mortgage (PMI, points, ARM vs fixed), retirement accounts (401k vs IRA, Roth vs Traditional), or investing (diversification, index funds, etc.).', legacyTools.explainBankingConcepts, { tags: ['education', 'concepts', 'banking', 'mortgage', 'retirement'] }),
    ];
}
// ============================================================================
// DOMAIN TOOLS COLLECTION
// ============================================================================
const financeTools = [
    ...getBankingToolDefinitions(),
    ...getCalculatorToolDefinitions(),
    ...getPersonalFinanceToolDefinitions(),
];
// ============================================================================
// EXPORTS
// ============================================================================
export const { getToolDefinitions, domain, definitions } = createDomainExport('finance', financeTools);
export { getBankingToolDefinitions, getCalculatorToolDefinitions, getPersonalFinanceToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.js.map