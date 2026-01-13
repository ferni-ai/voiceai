/**
 * SEC EDGAR API Integration
 *
 * Provides access to SEC filings and insider trading data for Peter (The Quant).
 * "Better than Human" - institutional-grade research for individuals.
 *
 * Features:
 * - Company filings (10-K, 10-Q, 8-K)
 * - Insider trading (Form 4)
 * - Institutional holdings (13F)
 * - Real-time filing alerts
 *
 * @see https://www.sec.gov/developer
 * @module services/finance/sec-edgar
 */
export interface SECFiling {
    accessionNumber: string;
    filingDate: string;
    reportDate?: string;
    form: string;
    description: string;
    primaryDocument: string;
    primaryDocDescription: string;
    size: number;
    isXBRL: boolean;
    isInlineXBRL: boolean;
    items?: string[];
    documentUrl: string;
}
export interface InsiderTransaction {
    filingDate: string;
    transactionDate: string;
    ownerName: string;
    ownerTitle?: string;
    isDirector: boolean;
    isOfficer: boolean;
    isTenPercentOwner: boolean;
    transactionType: 'buy' | 'sell' | 'gift' | 'exercise' | 'other';
    transactionCode: string;
    sharesTraded: number;
    pricePerShare?: number;
    totalValue?: number;
    sharesOwned: number;
    ownershipType: 'direct' | 'indirect';
    documentUrl: string;
}
export interface CompanyInfo {
    cik: string;
    name: string;
    ticker?: string;
    sic?: string;
    sicDescription?: string;
    fiscalYearEnd?: string;
    stateOfIncorporation?: string;
    businessAddress?: {
        street: string;
        city: string;
        state: string;
        zip: string;
    };
}
export interface InstitutionalHolding {
    filingDate: string;
    quarterEnd: string;
    managerName: string;
    managerCik: string;
    shares: number;
    value: number;
    changeFromPrevious?: number;
    percentChange?: number;
    percentOfPortfolio?: number;
}
export interface SECResult<T> {
    success: boolean;
    data?: T;
    error?: string;
}
export declare function getCIKByTicker(ticker: string): Promise<SECResult<string>>;
/**
 * Get recent SEC filings for a company
 */
export declare function getCompanyFilings(tickerOrCik: string, options?: {
    forms?: string[];
    limit?: number;
}): Promise<SECResult<SECFiling[]>>;
/**
 * Get insider trading transactions (Form 4) for a company
 *
 * "Better than Human" - Track insider buying/selling patterns
 */
export declare function getInsiderTransactions(tickerOrCik: string, options?: {
    limit?: number;
    daysBack?: number;
}): Promise<SECResult<InsiderTransaction[]>>;
/**
 * Get insider trading summary for a company
 *
 * Returns aggregate buy/sell activity over recent period
 */
export declare function getInsiderTradingSummary(tickerOrCik: string, daysBack?: number): Promise<SECResult<{
    netShares: number;
    totalBuys: number;
    totalSells: number;
    buyValue: number;
    sellValue: number;
    uniqueInsiders: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
}>>;
/**
 * Get institutional holders of a stock
 *
 * "Better than Human" - See what the big money is doing
 */
export declare function getInstitutionalHolders(tickerOrCik: string, limit?: number): Promise<SECResult<InstitutionalHolding[]>>;
/**
 * Search SEC filings by keyword
 */
export declare function searchFilings(query: string, options?: {
    forms?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
}): Promise<SECResult<SECFiling[]>>;
/**
 * Generate superhuman insight from SEC data
 *
 * "Better than Human" - Institutional-grade research for individuals
 */
export declare function generateSECInsight(ticker: string): Promise<string | null>;
declare const _default: {
    getCIKByTicker: typeof getCIKByTicker;
    getCompanyFilings: typeof getCompanyFilings;
    getInsiderTransactions: typeof getInsiderTransactions;
    getInsiderTradingSummary: typeof getInsiderTradingSummary;
    getInstitutionalHolders: typeof getInstitutionalHolders;
    searchFilings: typeof searchFilings;
    generateSECInsight: typeof generateSECInsight;
};
export default _default;
//# sourceMappingURL=sec-edgar.d.ts.map