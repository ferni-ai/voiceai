/**
 * Plaid Integration Tools
 *
 * Domain: Bank account linking, transactions, balances, spending analysis
 *
 * Plaid provides:
 * - Link token creation for account linking flow
 * - Account balances (checking, savings, credit cards)
 * - Transaction history with categorization
 * - Spending insights and patterns
 * - Institution info and account verification
 *
 * Jack uses this to help users understand their financial picture
 * and provide personalized advice based on real spending data.
 */
import { llm } from '@livekit/agents';
interface PlaidAccount {
    account_id: string;
    name: string;
    official_name?: string;
    type: 'depository' | 'credit' | 'loan' | 'investment' | 'other';
    subtype?: string;
    balances: {
        available?: number;
        current?: number;
        limit?: number;
        iso_currency_code?: string;
    };
    mask?: string;
}
interface PlaidTransaction {
    transaction_id: string;
    account_id: string;
    amount: number;
    date: string;
    name: string;
    merchant_name?: string;
    category?: string[];
    pending: boolean;
    payment_channel: 'online' | 'in store' | 'other';
    location?: {
        city?: string;
        region?: string;
    };
}
/**
 * Create a Link token for account linking
 * This is the first step - user gets a token to open Plaid Link UI
 */
export declare function createLinkToken(userId: string): Promise<string>;
/**
 * Exchange public token for access token after user links account
 * The public token comes from Plaid Link UI callback
 */
export declare function exchangePublicToken(publicToken: string): Promise<string | null>;
/**
 * Get account balances
 */
export declare function getAccountBalances(accessToken: string): Promise<PlaidAccount[]>;
/**
 * Get transactions for a date range
 */
export declare function getTransactions(accessToken: string, startDate: string, endDate: string, count?: number): Promise<PlaidTransaction[]>;
/**
 * Analyze spending by category
 */
export declare function analyzeSpending(transactions: PlaidTransaction[]): {
    byCategory: Record<string, {
        total: number;
        count: number;
        transactions: string[];
    }>;
    totalSpending: number;
    largestExpenses: Array<{
        name: string;
        amount: number;
        date: string;
    }>;
    averageTransactionSize: number;
    recurringExpenses: Array<{
        name: string;
        amount: number;
        frequency: string;
    }>;
};
/**
 * Format account balances for natural speech
 */
export declare function formatBalancesForSpeech(accounts: PlaidAccount[]): string;
/**
 * Format spending analysis for natural speech
 */
export declare function formatSpendingForSpeech(analysis: ReturnType<typeof analyzeSpending>, period: string): string;
import { storeAccessToken, getStoredAccessToken, hasLinkedAccounts, getTokenData, removeAccessToken } from './plaid-store.js';
export { storeAccessToken, getStoredAccessToken, hasLinkedAccounts, getTokenData, removeAccessToken, };
export declare function createPlaidTools(): {
    checkBankLinkStatus: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    unlinkBankAccount: llm.FunctionTool<{
        userId: string;
        confirm: boolean;
    }, unknown, string>;
    linkBankAccount: llm.FunctionTool<{
        userId: string;
        deliveryMethod: "email" | "sms";
        contact: string;
    }, unknown, string>;
    getAccountBalances: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
    getSpendingAnalysis: llm.FunctionTool<{
        userId: string;
        period?: "month" | "week" | "quarter" | undefined;
    }, unknown, string>;
    getRecentTransactions: llm.FunctionTool<{
        userId: string;
        merchantFilter?: string | undefined;
        categoryFilter?: string | undefined;
        limit?: number | undefined;
    }, unknown, string>;
    checkFinancialHealth: llm.FunctionTool<{
        userId: string;
    }, unknown, string>;
};
export default createPlaidTools;
//# sourceMappingURL=plaid.d.ts.map