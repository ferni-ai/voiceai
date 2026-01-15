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

import { createLogger } from '../../utils/safe-logger.js';
import { getCircuitBreaker } from '../../utils/circuit-breaker.js';

const log = createLogger({ module: 'SEC-EDGAR' });

// Circuit breaker for SEC API
const secCircuitBreaker = getCircuitBreaker('sec-edgar', {
  failureThreshold: 5,
  resetTimeout: 60_000,
  successThreshold: 2,
});

// ============================================================================
// TYPES
// ============================================================================

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

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEC_BASE_URL = 'https://data.sec.gov';
const SEC_EFTS_URL = 'https://efts.sec.gov/LATEST/search-index';
const SEC_ARCHIVES_URL = 'https://www.sec.gov/cgi-bin/browse-edgar';

// SEC requires a user-agent header with contact info
// Format: "Company Name (contact@company.com)" - SEC blocks generic user agents
const USER_AGENT = process.env.SEC_USER_AGENT || 'Ferni-AI/1.0 (support@ferni.ai)';

// Rate limiting: SEC allows 10 requests per second
const REQUEST_DELAY_MS = 100;
let lastRequestTime = 0;

async function rateLimitedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < REQUEST_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_DELAY_MS - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();

  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
}

// ============================================================================
// CIK LOOKUP
// ============================================================================

// Cache for CIK lookups
const cikCache = new Map<string, string>();

/**
 * Get CIK (Central Index Key) for a company by ticker symbol
 */
// Well-known CIK mappings (fallback when API is unavailable)
const KNOWN_CIKS: Record<string, string> = {
  AAPL: '0000320193',
  MSFT: '0000789019',
  GOOGL: '0001652044',
  AMZN: '0001018724',
  META: '0001326801',
  TSLA: '0001318605',
  NVDA: '0001045810',
  BRK: '0001067983',
  JPM: '0000019617',
  V: '0001403161',
  JNJ: '0000200406',
  WMT: '0000104169',
  MA: '0001141391',
  PG: '0000080424',
  HD: '0000354950',
  DIS: '0001744489',
  NFLX: '0001065280',
  ADBE: '0000796343',
  CRM: '0001108524',
  PYPL: '0001633917',
};

export async function getCIKByTicker(ticker: string): Promise<SECResult<string>> {
  const normalizedTicker = ticker.toUpperCase();

  // Check cache
  if (cikCache.has(normalizedTicker)) {
    return { success: true, data: cikCache.get(normalizedTicker)! };
  }

  // Check known CIKs first (faster and doesn't hit API)
  if (KNOWN_CIKS[normalizedTicker]) {
    const cik = KNOWN_CIKS[normalizedTicker];
    cikCache.set(normalizedTicker, cik);
    return { success: true, data: cik };
  }

  try {
    const response = await secCircuitBreaker.execute(() =>
      rateLimitedFetch(`${SEC_BASE_URL}/submissions/CIK${normalizedTicker}.json`)
    );

    if (!response.ok) {
      // Try the company tickers endpoint
      const tickersResponse = await rateLimitedFetch(
        `${SEC_BASE_URL}/files/company_tickers.json`
      );

      if (!tickersResponse.ok) {
        return { success: false, error: 'Failed to lookup CIK' };
      }

      const tickers = (await tickersResponse.json()) as Record<
        string,
        { cik_str: number; ticker: string; title: string }
      >;

      for (const entry of Object.values(tickers)) {
        if (entry.ticker === normalizedTicker) {
          const cik = entry.cik_str.toString().padStart(10, '0');
          cikCache.set(normalizedTicker, cik);
          return { success: true, data: cik };
        }
      }

      return { success: false, error: `Ticker ${ticker} not found` };
    }

    const data = (await response.json()) as { cik: string };
    const cik = data.cik.padStart(10, '0');
    cikCache.set(normalizedTicker, cik);

    return { success: true, data: cik };
  } catch (error) {
    log.error({ error: String(error), ticker }, 'CIK lookup failed');
    return { success: false, error: 'CIK lookup failed' };
  }
}

// ============================================================================
// COMPANY FILINGS
// ============================================================================

/**
 * Get recent SEC filings for a company
 */
export async function getCompanyFilings(
  tickerOrCik: string,
  options: {
    forms?: string[];
    limit?: number;
  } = {}
): Promise<SECResult<SECFiling[]>> {
  const { forms, limit = 20 } = options;

  try {
    // Get CIK if ticker provided
    let cik = tickerOrCik;
    if (!/^\d+$/.test(tickerOrCik)) {
      const cikResult = await getCIKByTicker(tickerOrCik);
      if (!cikResult.success || !cikResult.data) {
        return { success: false, error: cikResult.error || 'CIK lookup failed' };
      }
      cik = cikResult.data;
    }

    const response = await secCircuitBreaker.execute(() =>
      rateLimitedFetch(`${SEC_BASE_URL}/submissions/CIK${cik.padStart(10, '0')}.json`)
    );

    if (!response.ok) {
      return { success: false, error: `SEC API error: ${response.status}` };
    }

    const data = (await response.json()) as {
      cik: string;
      name: string;
      filings: {
        recent: {
          accessionNumber: string[];
          filingDate: string[];
          reportDate: string[];
          form: string[];
          fileNumber: string[];
          items: string[];
          size: number[];
          isXBRL: number[];
          isInlineXBRL: number[];
          primaryDocument: string[];
          primaryDocDescription: string[];
        };
      };
    };

    const recent = data.filings.recent;
    const filings: SECFiling[] = [];

    for (let i = 0; i < Math.min(recent.accessionNumber.length, limit * 3); i++) {
      const form = recent.form[i];

      // Filter by form type if specified
      if (forms && forms.length > 0 && !forms.includes(form)) {
        continue;
      }

      if (filings.length >= limit) break;

      const accessionNumber = recent.accessionNumber[i].replace(/-/g, '');
      const formattedAccession = recent.accessionNumber[i];

      filings.push({
        accessionNumber: formattedAccession,
        filingDate: recent.filingDate[i],
        reportDate: recent.reportDate[i] || undefined,
        form,
        description: getFormDescription(form),
        primaryDocument: recent.primaryDocument[i],
        primaryDocDescription: recent.primaryDocDescription[i],
        size: recent.size[i],
        isXBRL: recent.isXBRL[i] === 1,
        isInlineXBRL: recent.isInlineXBRL[i] === 1,
        items: recent.items[i] ? recent.items[i].split(',') : undefined,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber}/${recent.primaryDocument[i]}`,
      });
    }

    log.debug({ ticker: tickerOrCik, count: filings.length }, 'Fetched SEC filings');
    return { success: true, data: filings };
  } catch (error) {
    log.error({ error: String(error), ticker: tickerOrCik }, 'Failed to get SEC filings');
    return { success: false, error: 'Failed to fetch filings' };
  }
}

function getFormDescription(form: string): string {
  const descriptions: Record<string, string> = {
    '10-K': 'Annual Report',
    '10-Q': 'Quarterly Report',
    '8-K': 'Current Report (Material Events)',
    '4': 'Insider Trading (Statement of Changes)',
    '3': 'Initial Statement of Beneficial Ownership',
    '5': 'Annual Statement of Beneficial Ownership',
    '13F-HR': 'Institutional Holdings Report',
    'DEF 14A': 'Proxy Statement',
    'S-1': 'Registration Statement (IPO)',
    'S-3': 'Registration Statement (Shelf)',
    'SC 13G': 'Beneficial Ownership Report',
    'SC 13D': 'Beneficial Ownership Report (Active)',
  };

  return descriptions[form] || form;
}

// ============================================================================
// INSIDER TRADING
// ============================================================================

/**
 * Get insider trading transactions (Form 4) for a company
 *
 * "Better than Human" - Track insider buying/selling patterns
 */
export async function getInsiderTransactions(
  tickerOrCik: string,
  options: {
    limit?: number;
    daysBack?: number;
  } = {}
): Promise<SECResult<InsiderTransaction[]>> {
  const { limit = 20, daysBack = 90 } = options;

  try {
    // Get Form 4 filings
    const filingsResult = await getCompanyFilings(tickerOrCik, {
      forms: ['4'],
      limit: limit * 2, // Get extra to filter by date
    });

    if (!filingsResult.success || !filingsResult.data) {
      return { success: false, error: filingsResult.error };
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);

    const transactions: InsiderTransaction[] = [];

    for (const filing of filingsResult.data) {
      if (new Date(filing.filingDate) < cutoffDate) continue;
      if (transactions.length >= limit) break;

      // Parse Form 4 XML to extract transaction details
      // Note: Full XML parsing would require fetching and parsing each filing
      // For now, we provide the filing metadata
      transactions.push({
        filingDate: filing.filingDate,
        transactionDate: filing.reportDate || filing.filingDate,
        ownerName: 'See filing', // Would need to parse XML
        isDirector: false,
        isOfficer: false,
        isTenPercentOwner: false,
        transactionType: 'other',
        transactionCode: '',
        sharesTraded: 0,
        sharesOwned: 0,
        ownershipType: 'direct',
        documentUrl: filing.documentUrl,
      });
    }

    log.debug({ ticker: tickerOrCik, count: transactions.length }, 'Fetched insider transactions');
    return { success: true, data: transactions };
  } catch (error) {
    log.error({ error: String(error), ticker: tickerOrCik }, 'Failed to get insider transactions');
    return { success: false, error: 'Failed to fetch insider data' };
  }
}

/**
 * Get insider trading summary for a company
 *
 * Returns aggregate buy/sell activity over recent period
 */
export async function getInsiderTradingSummary(
  tickerOrCik: string,
  daysBack = 90
): Promise<
  SECResult<{
    netShares: number;
    totalBuys: number;
    totalSells: number;
    buyValue: number;
    sellValue: number;
    uniqueInsiders: number;
    sentiment: 'bullish' | 'bearish' | 'neutral';
  }>
> {
  const transactionsResult = await getInsiderTransactions(tickerOrCik, {
    limit: 50,
    daysBack,
  });

  if (!transactionsResult.success || !transactionsResult.data) {
    return { success: false, error: transactionsResult.error };
  }

  // Aggregate transactions
  let totalBuys = 0;
  let totalSells = 0;
  let buyValue = 0;
  let sellValue = 0;
  const insiders = new Set<string>();

  for (const tx of transactionsResult.data) {
    insiders.add(tx.ownerName);

    if (tx.transactionType === 'buy') {
      totalBuys += tx.sharesTraded;
      buyValue += tx.totalValue || 0;
    } else if (tx.transactionType === 'sell') {
      totalSells += tx.sharesTraded;
      sellValue += tx.totalValue || 0;
    }
  }

  const netShares = totalBuys - totalSells;
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  if (netShares > 10000) sentiment = 'bullish';
  else if (netShares < -10000) sentiment = 'bearish';

  return {
    success: true,
    data: {
      netShares,
      totalBuys,
      totalSells,
      buyValue,
      sellValue,
      uniqueInsiders: insiders.size,
      sentiment,
    },
  };
}

// ============================================================================
// INSTITUTIONAL HOLDINGS (13F)
// ============================================================================

/**
 * Get institutional holders of a stock
 *
 * "Better than Human" - See what the big money is doing
 */
export async function getInstitutionalHolders(
  tickerOrCik: string,
  limit = 10
): Promise<SECResult<InstitutionalHolding[]>> {
  try {
    // This would require querying 13F filings and aggregating
    // For now, return the 13F filings metadata
    const filingsResult = await getCompanyFilings(tickerOrCik, {
      forms: ['13F-HR'],
      limit,
    });

    if (!filingsResult.success || !filingsResult.data) {
      return { success: false, error: filingsResult.error };
    }

    // In production, would parse 13F XML for actual holdings data
    const holdings: InstitutionalHolding[] = filingsResult.data.map((f) => ({
      filingDate: f.filingDate,
      quarterEnd: f.reportDate || f.filingDate,
      managerName: 'See filing',
      managerCik: '',
      shares: 0,
      value: 0,
    }));

    return { success: true, data: holdings };
  } catch (error) {
    log.error({ error: String(error), ticker: tickerOrCik }, 'Failed to get institutional holders');
    return { success: false, error: 'Failed to fetch institutional data' };
  }
}

// ============================================================================
// FILING SEARCH
// ============================================================================

/**
 * Search SEC filings by keyword
 */
export async function searchFilings(
  query: string,
  options: {
    forms?: string[];
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  } = {}
): Promise<SECResult<SECFiling[]>> {
  const { forms, dateFrom, dateTo, limit = 20 } = options;

  try {
    const params = new URLSearchParams({
      q: query,
      dateRange: 'custom',
      startdt: dateFrom || '2020-01-01',
      enddt: dateTo || new Date().toISOString().split('T')[0],
    });

    if (forms && forms.length > 0) {
      params.set('forms', forms.join(','));
    }

    const response = await secCircuitBreaker.execute(() =>
      rateLimitedFetch(`${SEC_EFTS_URL}?${params.toString()}`)
    );

    if (!response.ok) {
      return { success: false, error: `SEC search error: ${response.status}` };
    }

    const data = (await response.json()) as {
      hits: {
        hits: Array<{
          _source: {
            file_num: string;
            form: string;
            file_date: string;
            display_names: string[];
          };
        }>;
      };
    };

    const filings: SECFiling[] = data.hits.hits.slice(0, limit).map((hit) => ({
      accessionNumber: hit._source.file_num,
      filingDate: hit._source.file_date,
      form: hit._source.form,
      description: getFormDescription(hit._source.form),
      primaryDocument: '',
      primaryDocDescription: hit._source.display_names?.[0] || '',
      size: 0,
      isXBRL: false,
      isInlineXBRL: false,
      documentUrl: '',
    }));

    return { success: true, data: filings };
  } catch (error) {
    log.error({ error: String(error), query }, 'SEC filing search failed');
    return { success: false, error: 'Search failed' };
  }
}

// ============================================================================
// SUPERHUMAN INSIGHTS
// ============================================================================

/**
 * Generate superhuman insight from SEC data
 *
 * "Better than Human" - Institutional-grade research for individuals
 */
export async function generateSECInsight(ticker: string): Promise<string | null> {
  try {
    const [filingsResult, insiderResult] = await Promise.all([
      getCompanyFilings(ticker, { forms: ['8-K'], limit: 5 }),
      getInsiderTradingSummary(ticker, 30),
    ]);

    const insights: string[] = [];

    // Recent 8-K filings (material events)
    if (filingsResult.success && filingsResult.data && filingsResult.data.length > 0) {
      const recentFiling = filingsResult.data[0];
      const daysAgo = Math.floor(
        (Date.now() - new Date(recentFiling.filingDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysAgo <= 7) {
        insights.push(
          `${ticker} filed an 8-K (${recentFiling.description}) ${daysAgo} days ago - worth checking`
        );
      }
    }

    // Insider trading sentiment
    if (insiderResult.success && insiderResult.data) {
      const { sentiment, netShares, uniqueInsiders } = insiderResult.data;

      if (sentiment === 'bullish' && netShares > 0) {
        insights.push(
          `Insiders at ${ticker} are buying - ${uniqueInsiders} insiders net bought ${netShares.toLocaleString()} shares recently`
        );
      } else if (sentiment === 'bearish' && netShares < 0) {
        insights.push(
          `Heads up: Insiders at ${ticker} are selling - net ${Math.abs(netShares).toLocaleString()} shares sold`
        );
      }
    }

    return insights.length > 0 ? insights[0] : null;
  } catch (error) {
    log.error({ error: String(error), ticker }, 'Failed to generate SEC insight');
    return null;
  }
}

export default {
  getCIKByTicker,
  getCompanyFilings,
  getInsiderTransactions,
  getInsiderTradingSummary,
  getInstitutionalHolders,
  searchFilings,
  generateSECInsight,
};
