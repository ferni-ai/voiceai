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
import type { ToolDefinition } from '../../registry/types.js';
declare function getBankingToolDefinitions(): ToolDefinition[];
declare function getCalculatorToolDefinitions(): ToolDefinition[];
declare function getPersonalFinanceToolDefinitions(): ToolDefinition[];
export declare const getToolDefinitions: () => Promise<ToolDefinition[]>, domain: import("../../registry/types.js").ToolDomain, definitions: ToolDefinition[];
export { getBankingToolDefinitions, getCalculatorToolDefinitions, getPersonalFinanceToolDefinitions, };
export default getToolDefinitions;
//# sourceMappingURL=index.d.ts.map