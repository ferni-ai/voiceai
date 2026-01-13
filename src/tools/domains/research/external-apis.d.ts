/**
 * External API Integrations for Quant Tools
 *
 * Real data sources for Peter's quantitative analysis:
 * - Alpha Vantage: Fundamentals, earnings, balance sheets
 * - Yahoo Finance: Real-time quotes, historical prices (via quant-tools.ts)
 * - Federal Reserve (FRED): Economic indicators
 *
 * @module tools/domains/research/external-apis
 */
export interface CompanyFundamentals {
    symbol: string;
    name: string;
    sector: string;
    industry: string;
    marketCap: number;
    peRatio: number;
    pegRatio: number;
    bookValue: number;
    dividendYield: number;
    eps: number;
    revenuePerShare: number;
    profitMargin: number;
    operatingMargin: number;
    returnOnEquity: number;
    beta: number;
    fiftyTwoWeekHigh: number;
    fiftyTwoWeekLow: number;
    analystTargetPrice: number;
    forwardPE: number;
    priceToBook: number;
    priceToSales: number;
    evToRevenue: number;
    evToEbitda: number;
    lastUpdated: Date;
}
export interface EarningsData {
    symbol: string;
    fiscalDateEnding: string;
    reportedEPS: number;
    estimatedEPS: number;
    surprise: number;
    surprisePercentage: number;
}
export interface BalanceSheetData {
    symbol: string;
    fiscalDateEnding: string;
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    cashAndEquivalents: number;
    totalDebt: number;
    debtToEquity: number;
}
export interface EconomicIndicator {
    name: string;
    value: number;
    unit: string;
    date: Date;
    previousValue: number;
    change: number;
    changePercent: number;
    frequency: string;
    source: string;
}
/**
 * Get company fundamentals from Alpha Vantage
 */
export declare function getCompanyFundamentals(symbol: string): Promise<CompanyFundamentals | null>;
/**
 * Get earnings history from Alpha Vantage
 */
export declare function getEarningsHistory(symbol: string, limit?: number): Promise<EarningsData[]>;
interface FREDSeriesConfig {
    seriesId: string;
    name: string;
    unit: string;
    frequency: string;
}
declare const FRED_SERIES: Record<string, FREDSeriesConfig>;
/**
 * Get economic indicator from FRED
 */
export declare function getEconomicIndicator(indicatorKey: string): Promise<EconomicIndicator | null>;
/**
 * Get yield curve (10Y - 2Y spread)
 */
export declare function getYieldCurve(): Promise<{
    spread: number;
    status: 'normal' | 'flat' | 'inverted';
    interpretation: string;
}>;
/**
 * Get comprehensive economic dashboard
 */
export declare function getEconomicDashboard(): Promise<{
    indicators: EconomicIndicator[];
    yieldCurve: {
        spread: number;
        status: string;
        interpretation: string;
    };
    summary: string;
}>;
declare function getMockFundamentals(symbol: string): CompanyFundamentals;
declare function getMockEarnings(symbol: string, limit: number): EarningsData[];
declare function getMockEconomicIndicator(indicatorKey: string): EconomicIndicator;
export { FRED_SERIES, getMockFundamentals, getMockEarnings, getMockEconomicIndicator };
//# sourceMappingURL=external-apis.d.ts.map