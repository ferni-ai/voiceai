/**
 * Economic Data Tools
 *
 * Domain: Federal Reserve data, economic indicators, macroeconomic metrics.
 * Single responsibility: Fetching and presenting economic data.
 *
 * APIs used:
 * - FRED (Federal Reserve Economic Data) - free, no key required for basic access
 */

import { llm } from '@livekit/agents';
import { z } from 'zod';
import { getLogger } from '../utils/safe-logger.js';

import { getToolDescription } from './utils/tool-descriptions.js';
// FRED API key - get a free key at https://fred.stlouisfed.org/docs/api/api_key.html
// SECURITY: 'DEMO' key only in development - production requires real API key
const FRED_API_KEY =
  process.env.FRED_API_KEY || (process.env.NODE_ENV !== 'production' ? 'DEMO' : '');

// ============================================================================
// FRED API HELPERS
// ============================================================================

interface FREDObservation {
  date: string;
  value: string;
}

interface FREDResponse {
  observations?: FREDObservation[];
}

/**
 * Fetch data from FRED API
 */
async function fetchFREDData(seriesId: string, limit = 1): Promise<FREDObservation[] | null> {
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) return null;

    const data = (await response.json()) as FREDResponse;
    return data.observations || null;
  } catch (error) {
    getLogger().warn(`FRED API error for ${seriesId}: ${error}`);
    return null;
  }
}

// ============================================================================
// PUBLIC API FUNCTIONS
// ============================================================================

/**
 * Get Federal Funds Rate
 */
export async function getFedFundsRate(): Promise<string> {
  const observations = await fetchFREDData('FEDFUNDS', 1);

  if (observations && observations.length > 0) {
    const rate = observations[0].value;
    const { date } = observations[0];
    return `The Federal Funds Rate is currently ${rate}% as of ${date}. That's what banks charge each other for overnight loans, and it affects everything from mortgages to savings accounts.`;
  }

  return "I couldn't get the current Fed funds rate, but it's been in the 5% range recently.";
}

/**
 * Get inflation rate (CPI year-over-year)
 */
export async function getInflationRate(): Promise<string> {
  // Need 13 months to calculate YoY change
  const observations = await fetchFREDData('CPIAUCSL', 13);

  if (observations && observations.length >= 13) {
    const latest = parseFloat(observations[0].value);
    const yearAgo = parseFloat(observations[12].value);
    const yoyChange = (((latest - yearAgo) / yearAgo) * 100).toFixed(1);

    return `Inflation is running at about ${yoyChange}% year-over-year based on the Consumer Price Index. That's the silent tax on your savings—another reason why investing matters!`;
  }

  return 'Inflation has been elevated but is coming down from its peaks. Your purchasing power depends on beating inflation with your investments.';
}

/**
 * Get unemployment rate
 */
export async function getUnemploymentRate(): Promise<string> {
  const observations = await fetchFREDData('UNRATE', 1);

  if (observations && observations.length > 0) {
    const rate = observations[0].value;
    return `The unemployment rate is ${rate}%. A strong job market is generally good for the economy and for stock returns—but remember, macroeconomic predictions are a fool's errand!`;
  }

  return 'The job market has been resilient lately.';
}

/**
 * Get 10-year Treasury yield
 */
export async function getTreasuryYield(): Promise<string> {
  const observations = await fetchFREDData('DGS10', 1);

  if (observations && observations.length > 0) {
    const yield10yr = observations[0].value;
    return `The 10-year Treasury yield is at ${yield10yr}%. This is often seen as the risk-free rate and affects mortgage rates and bond prices.`;
  }

  return "I couldn't get the current Treasury yield.";
}

/**
 * Get 30-year mortgage rate
 */
export async function getMortgageRate(): Promise<string> {
  const observations = await fetchFREDData('MORTGAGE30US', 1);

  if (observations && observations.length > 0) {
    const rate = observations[0].value;
    const { date } = observations[0];
    return `The 30-year fixed mortgage rate is averaging ${rate}% as of ${date}. That's the rate most home buyers get.`;
  }

  return 'Mortgage rates have been volatile lately. Check with a lender for current rates.';
}

/**
 * Get GDP growth rate
 */
export async function getGDPGrowth(): Promise<string> {
  // A191RL1Q225SBEA is real GDP growth rate quarterly
  const observations = await fetchFREDData('A191RL1Q225SBEA', 1);

  if (observations && observations.length > 0) {
    const rate = observations[0].value;
    const { date } = observations[0];
    const direction = parseFloat(rate) >= 0 ? 'growing' : 'contracting';
    return `The U.S. economy is ${direction} at a ${Math.abs(parseFloat(rate))}% annual rate as of ${date}. GDP measures the total output of the economy.`;
  }

  return "I couldn't get the latest GDP figures.";
}

/**
 * Get comprehensive economic summary
 */
export async function getEconomicSummary(): Promise<string> {
  const [fed, inflation, unemployment] = await Promise.all([
    getFedFundsRate(),
    getInflationRate(),
    getUnemploymentRate(),
  ]);

  return `Here's the economic picture:\n${fed}\n${inflation}\n${unemployment}`;
}

// ============================================================================
// TOOL DEFINITIONS
// ============================================================================

export function createEconomicTools() {
  return {
    getFedFundsRate: llm.tool({
      description: getToolDescription('getFedFundsRate'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting Fed funds rate');
        return getFedFundsRate();
      },
    }),

    getInflationRate: llm.tool({
      description: getToolDescription('getInflationRate'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting inflation rate');
        return getInflationRate();
      },
    }),

    getUnemploymentRate: llm.tool({
      description: getToolDescription('getUnemploymentRate'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting unemployment rate');
        return getUnemploymentRate();
      },
    }),

    getTreasuryYield: llm.tool({
      description: getToolDescription('getTreasuryYield'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting Treasury yield');
        return getTreasuryYield();
      },
    }),

    getMortgageRate: llm.tool({
      description: getToolDescription('getMortgageRate'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting mortgage rate');
        return getMortgageRate();
      },
    }),

    getGDPGrowth: llm.tool({
      description: getToolDescription('getGDPGrowth'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting GDP growth');
        return getGDPGrowth();
      },
    }),

    getEconomicSummary: llm.tool({
      description: getToolDescription('getEconomicSummary'),
      parameters: z.object({}),
      execute: async () => {
        getLogger().info('Getting economic summary');
        return getEconomicSummary();
      },
    }),
  };
}

export default createEconomicTools;
