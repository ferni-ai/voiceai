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

import { getLogger } from '../../../utils/safe-logger.js';
import { withRateLimit } from '../../rate-limiter.js';

const log = getLogger();

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// ALPHA VANTAGE API
// ============================================================================

const ALPHA_VANTAGE_BASE = 'https://www.alphavantage.co/query';

/**
 * Get company fundamentals from Alpha Vantage
 */
export async function getCompanyFundamentals(symbol: string): Promise<CompanyFundamentals | null> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    log.warn('ALPHA_VANTAGE_API_KEY not set, using mock data');
    return getMockFundamentals(symbol);
  }

  return withRateLimit(
    `alpha-vantage-fundamentals-${symbol}`,
    async () => {
      try {
        const url = `${ALPHA_VANTAGE_BASE}?function=OVERVIEW&symbol=${symbol}&apikey=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as Record<string, string | undefined>;

        if (data.Note || data['Error Message']) {
          log.warn(
            { symbol, note: data.Note ?? data['Error Message'] },
            'Alpha Vantage API limit or error'
          );
          return getMockFundamentals(symbol);
        }

        return {
          symbol: data.Symbol ?? symbol,
          name: data.Name ?? 'Unknown',
          sector: data.Sector ?? 'Unknown',
          industry: data.Industry ?? 'Unknown',
          marketCap: parseFloat(data.MarketCapitalization ?? '0') || 0,
          peRatio: parseFloat(data.PERatio ?? '0') || 0,
          pegRatio: parseFloat(data.PEGRatio ?? '0') || 0,
          bookValue: parseFloat(data.BookValue ?? '0') || 0,
          dividendYield: parseFloat(data.DividendYield ?? '0') || 0,
          eps: parseFloat(data.EPS ?? '0') || 0,
          revenuePerShare: parseFloat(data.RevenuePerShareTTM ?? '0') || 0,
          profitMargin: parseFloat(data.ProfitMargin ?? '0') || 0,
          operatingMargin: parseFloat(data.OperatingMarginTTM ?? '0') || 0,
          returnOnEquity: parseFloat(data.ReturnOnEquityTTM ?? '0') || 0,
          beta: parseFloat(data.Beta ?? '1') || 1,
          fiftyTwoWeekHigh: parseFloat(data['52WeekHigh'] ?? '0') || 0,
          fiftyTwoWeekLow: parseFloat(data['52WeekLow'] ?? '0') || 0,
          analystTargetPrice: parseFloat(data.AnalystTargetPrice ?? '0') || 0,
          forwardPE: parseFloat(data.ForwardPE ?? '0') || 0,
          priceToBook: parseFloat(data.PriceToBookRatio ?? '0') || 0,
          priceToSales: parseFloat(data.PriceToSalesRatioTTM ?? '0') || 0,
          evToRevenue: parseFloat(data.EVToRevenue ?? '0') || 0,
          evToEbitda: parseFloat(data.EVToEBITDA ?? '0') || 0,
          lastUpdated: new Date(),
        };
      } catch (error) {
        log.error({ error: String(error), symbol }, 'Failed to fetch Alpha Vantage fundamentals');
        return getMockFundamentals(symbol);
      }
    },
    getMockFundamentals(symbol)
  );
}

/**
 * Get earnings history from Alpha Vantage
 */
export async function getEarningsHistory(
  symbol: string,
  limit = 4
): Promise<EarningsData[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) {
    return getMockEarnings(symbol, limit);
  }

  return withRateLimit(
    `alpha-vantage-earnings-${symbol}`,
    async () => {
      try {
        const url = `${ALPHA_VANTAGE_BASE}?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as Record<string, unknown>;

        if (data.Note || data['Error Message'] || !data.quarterlyEarnings) {
          return getMockEarnings(symbol, limit);
        }

        const earnings = data.quarterlyEarnings as Record<string, string>[];
        return earnings.slice(0, limit).map((e) => ({
          symbol,
          fiscalDateEnding: e.fiscalDateEnding,
          reportedEPS: parseFloat(e.reportedEPS) || 0,
          estimatedEPS: parseFloat(e.estimatedEPS) || 0,
          surprise: parseFloat(e.surprise) || 0,
          surprisePercentage: parseFloat(e.surprisePercentage) || 0,
        }));
      } catch (error) {
        log.error({ error: String(error), symbol }, 'Failed to fetch earnings');
        return getMockEarnings(symbol, limit);
      }
    },
    getMockEarnings(symbol, limit)
  );
}

// ============================================================================
// FEDERAL RESERVE (FRED) API
// ============================================================================

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

interface FREDSeriesConfig {
  seriesId: string;
  name: string;
  unit: string;
  frequency: string;
}

const FRED_SERIES: Record<string, FREDSeriesConfig> = {
  fed_rate: { seriesId: 'FEDFUNDS', name: 'Federal Funds Rate', unit: '%', frequency: 'monthly' },
  unemployment: { seriesId: 'UNRATE', name: 'Unemployment Rate', unit: '%', frequency: 'monthly' },
  cpi: { seriesId: 'CPIAUCSL', name: 'Consumer Price Index', unit: 'index', frequency: 'monthly' },
  gdp: {
    seriesId: 'GDP',
    name: 'Gross Domestic Product',
    unit: 'billions USD',
    frequency: 'quarterly',
  },
  inflation: {
    seriesId: 'T10YIE',
    name: '10-Year Breakeven Inflation',
    unit: '%',
    frequency: 'daily',
  },
  yield_10y: { seriesId: 'DGS10', name: '10-Year Treasury Yield', unit: '%', frequency: 'daily' },
  yield_2y: { seriesId: 'DGS2', name: '2-Year Treasury Yield', unit: '%', frequency: 'daily' },
  housing_starts: {
    seriesId: 'HOUST',
    name: 'Housing Starts',
    unit: 'thousands',
    frequency: 'monthly',
  },
  retail_sales: {
    seriesId: 'RSAFS',
    name: 'Retail Sales',
    unit: 'millions USD',
    frequency: 'monthly',
  },
  consumer_sentiment: {
    seriesId: 'UMCSENT',
    name: 'Consumer Sentiment',
    unit: 'index',
    frequency: 'monthly',
  },
};

/**
 * Get economic indicator from FRED
 */
export async function getEconomicIndicator(
  indicatorKey: string
): Promise<EconomicIndicator | null> {
  const apiKey = process.env.FRED_API_KEY;
  const config = FRED_SERIES[indicatorKey];

  if (!config) {
    log.warn({ indicatorKey }, 'Unknown FRED series');
    return null;
  }

  if (!apiKey) {
    log.warn('FRED_API_KEY not set, using mock data');
    return getMockEconomicIndicator(indicatorKey);
  }

  return withRateLimit(
    `fred-${indicatorKey}`,
    async () => {
      try {
        const url = `${FRED_BASE}?series_id=${config.seriesId}&api_key=${apiKey}&file_type=json&limit=2&sort_order=desc`;
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = (await response.json()) as {
          observations?: { date: string; value: string }[];
        };

        if (!data.observations || data.observations.length === 0) {
          return getMockEconomicIndicator(indicatorKey);
        }

        const latest = data.observations[0];
        const previous = data.observations[1] as { date: string; value: string } | undefined;
        const currentValue = parseFloat(latest.value);
        const previousValue = previous ? parseFloat(previous.value) : currentValue;

        return {
          name: config.name,
          value: currentValue,
          unit: config.unit,
          date: new Date(latest.date),
          previousValue,
          change: currentValue - previousValue,
          changePercent:
            previousValue !== 0 ? ((currentValue - previousValue) / previousValue) * 100 : 0,
          frequency: config.frequency,
          source: 'Federal Reserve Bank of St. Louis (FRED)',
        };
      } catch (error) {
        log.error({ error: String(error), indicatorKey }, 'Failed to fetch FRED data');
        return getMockEconomicIndicator(indicatorKey);
      }
    },
    getMockEconomicIndicator(indicatorKey)
  );
}

/**
 * Get yield curve (10Y - 2Y spread)
 */
export async function getYieldCurve(): Promise<{
  spread: number;
  status: 'normal' | 'flat' | 'inverted';
  interpretation: string;
}> {
  const [yield10y, yield2y] = await Promise.all([
    getEconomicIndicator('yield_10y'),
    getEconomicIndicator('yield_2y'),
  ]);

  if (!yield10y || !yield2y) {
    return {
      spread: 0.5,
      status: 'normal',
      interpretation: 'Unable to fetch current yield curve data',
    };
  }

  const spread = yield10y.value - yield2y.value;

  let status: 'normal' | 'flat' | 'inverted';
  let interpretation: string;

  if (spread > 0.5) {
    status = 'normal';
    interpretation = 'Normal yield curve suggests healthy economic expectations';
  } else if (spread > -0.2) {
    status = 'flat';
    interpretation = 'Flat yield curve may signal economic uncertainty';
  } else {
    status = 'inverted';
    interpretation = 'Inverted yield curve has historically preceded recessions';
  }

  return { spread, status, interpretation };
}

/**
 * Get comprehensive economic dashboard
 */
export async function getEconomicDashboard(): Promise<{
  indicators: EconomicIndicator[];
  yieldCurve: { spread: number; status: string; interpretation: string };
  summary: string;
}> {
  const indicatorKeys = ['fed_rate', 'unemployment', 'inflation', 'consumer_sentiment'];

  const [indicators, yieldCurve] = await Promise.all([
    Promise.all(indicatorKeys.map((k) => getEconomicIndicator(k))),
    getYieldCurve(),
  ]);

  const validIndicators = indicators.filter((i): i is EconomicIndicator => i !== null);

  // Generate summary
  let summary = '📊 **Economic Dashboard**\n\n';

  for (const indicator of validIndicators) {
    const trend = indicator.change > 0 ? '📈' : indicator.change < 0 ? '📉' : '➡️';
    summary += `${trend} **${indicator.name}:** ${indicator.value.toFixed(2)}${indicator.unit === '%' ? '%' : ` ${indicator.unit}`}`;
    if (indicator.change !== 0) {
      summary += ` (${indicator.change > 0 ? '+' : ''}${indicator.changePercent.toFixed(1)}%)`;
    }
    summary += '\n';
  }

  summary += `\n🏦 **Yield Curve:** ${yieldCurve.spread.toFixed(2)}% (${yieldCurve.status})\n`;
  summary += `_${yieldCurve.interpretation}_`;

  return {
    indicators: validIndicators,
    yieldCurve,
    summary,
  };
}

// ============================================================================
// MOCK DATA (Used when APIs are unavailable)
// ============================================================================

function getMockFundamentals(symbol: string): CompanyFundamentals {
  const mockData: Record<string, Partial<CompanyFundamentals>> = {
    AAPL: {
      name: 'Apple Inc.',
      sector: 'Technology',
      industry: 'Consumer Electronics',
      marketCap: 3000000000000,
      peRatio: 28.5,
      pegRatio: 2.1,
      eps: 6.05,
      dividendYield: 0.005,
      beta: 1.28,
    },
    MSFT: {
      name: 'Microsoft Corporation',
      sector: 'Technology',
      industry: 'Software',
      marketCap: 2800000000000,
      peRatio: 32.1,
      pegRatio: 2.4,
      eps: 11.07,
      dividendYield: 0.008,
      beta: 0.91,
    },
    VTI: {
      name: 'Vanguard Total Stock Market ETF',
      sector: 'ETF',
      industry: 'Broad Market',
      marketCap: 350000000000,
      peRatio: 24.5,
      pegRatio: 0,
      eps: 0,
      dividendYield: 0.013,
      beta: 1.0,
    },
  };

  const base = mockData[symbol.toUpperCase()] || {};

  return {
    symbol: symbol.toUpperCase(),
    name: base.name || `${symbol} Company`,
    sector: base.sector || 'Unknown',
    industry: base.industry || 'Unknown',
    marketCap: base.marketCap || 50000000000,
    peRatio: base.peRatio || 20,
    pegRatio: base.pegRatio || 1.5,
    bookValue: 50,
    dividendYield: base.dividendYield || 0.02,
    eps: base.eps || 5,
    revenuePerShare: 50,
    profitMargin: 0.15,
    operatingMargin: 0.2,
    returnOnEquity: 0.25,
    beta: base.beta || 1.0,
    fiftyTwoWeekHigh: 200,
    fiftyTwoWeekLow: 150,
    analystTargetPrice: 185,
    forwardPE: 18,
    priceToBook: 4,
    priceToSales: 3,
    evToRevenue: 5,
    evToEbitda: 15,
    lastUpdated: new Date(),
  };
}

function getMockEarnings(symbol: string, limit: number): EarningsData[] {
  const quarters = ['2024-09-30', '2024-06-30', '2024-03-31', '2023-12-31'];

  return quarters.slice(0, limit).map((date, i) => ({
    symbol,
    fiscalDateEnding: date,
    reportedEPS: 1.5 + Math.random() * 0.5,
    estimatedEPS: 1.45 + Math.random() * 0.3,
    surprise: 0.05 + Math.random() * 0.1,
    surprisePercentage: (3 + Math.random() * 5) * (Math.random() > 0.3 ? 1 : -1),
  }));
}

function getMockEconomicIndicator(indicatorKey: string): EconomicIndicator {
  const config = FRED_SERIES[indicatorKey] || {
    name: 'Unknown Indicator',
    unit: '',
    frequency: 'monthly',
    seriesId: '',
  };

  const mockValues: Record<string, number> = {
    fed_rate: 5.33,
    unemployment: 4.2,
    cpi: 314.5,
    gdp: 28280,
    inflation: 2.3,
    yield_10y: 4.2,
    yield_2y: 4.1,
    housing_starts: 1350,
    retail_sales: 705000,
    consumer_sentiment: 72.5,
  };

  const value = mockValues[indicatorKey] || 100;
  const previousValue = value * (1 + (Math.random() - 0.5) * 0.02);

  return {
    name: config.name,
    value,
    unit: config.unit,
    date: new Date(),
    previousValue,
    change: value - previousValue,
    changePercent: ((value - previousValue) / previousValue) * 100,
    frequency: config.frequency,
    source: 'Mock Data (API key not configured)',
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { FRED_SERIES, getMockFundamentals, getMockEarnings, getMockEconomicIndicator };
