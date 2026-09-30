/**
 * External APIs Tests
 *
 * Tests for Alpha Vantage, FRED, and other external API integrations.
 *
 * Run with: pnpm vitest run src/tools/domains/research/__tests__/external-apis.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock rate limiter
vi.mock('../../../rate-limiter.js', () => ({
  withRateLimit: vi.fn(async (_key: string, fn: () => Promise<unknown>, fallback: unknown) => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }),
}));

import {
  getCompanyFundamentals,
  getEarningsHistory,
  getEconomicIndicator,
  getYieldCurve,
  getEconomicDashboard,
  FRED_SERIES,
} from '../external-apis.js';

describe('External APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear environment variables for testing
    delete process.env.ALPHA_VANTAGE_API_KEY;
    delete process.env.FRED_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Alpha Vantage - Company Fundamentals', () => {
    it('returns null, not sample numbers, when the API key is not set', async () => {
      expect(await getCompanyFundamentals('AAPL')).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fetch real data when API key is set', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Symbol: 'AAPL',
          Name: 'Apple Inc.',
          Sector: 'Technology',
          Industry: 'Consumer Electronics',
          MarketCapitalization: '3000000000000',
          PERatio: '28.5',
          EPS: '6.05',
          Beta: '1.28',
        }),
      });

      const fundamentals = await getCompanyFundamentals('AAPL');

      expect(mockFetch).toHaveBeenCalled();
      expect(fundamentals?.symbol).toBe('AAPL');
      expect(fundamentals?.peRatio).toBe(28.5);
    });

    it('returns null when the free tier is rate limited', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Note: 'API call frequency limit reached',
        }),
      });

      expect(await getCompanyFundamentals('AAPL')).toBeNull();
    });

    it('returns null for the newer "Information" rate-limit response', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ Information: 'Our standard API rate limit is 25 requests per day.' }),
      });
      expect(await getCompanyFundamentals('AAPL')).toBeNull();
    });

    it('should handle HTTP errors gracefully', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      expect(await getCompanyFundamentals('AAPL')).toBeNull();
    });
  });

  describe('Alpha Vantage - Earnings History', () => {
    it('returns no earnings, not sample ones, when the API key is not set', async () => {
      expect(await getEarningsHistory('AAPL', 4)).toEqual([]);
    });

    it('should fetch real earnings when API key is set', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quarterlyEarnings: [
            {
              fiscalDateEnding: '2024-09-30',
              reportedEPS: '1.64',
              estimatedEPS: '1.60',
              surprise: '0.04',
              surprisePercentage: '2.5',
            },
          ],
        }),
      });

      const earnings = await getEarningsHistory('AAPL', 1);

      expect(mockFetch).toHaveBeenCalled();
      expect(earnings[0].reportedEPS).toBe(1.64);
    });
  });

  describe('FRED - Economic Indicators', () => {
    it('returns null, not a sample rate, when the API key is not set', async () => {
      expect(await getEconomicIndicator('fed_rate')).toBeNull();
    });

    it('skips FRED "." placeholders and uses the latest real value', async () => {
      process.env.FRED_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          observations: [
            { date: '2026-09-29', value: '.' },
            { date: '2026-09-28', value: '4.10' },
            { date: '2026-09-25', value: '4.05' },
          ],
        }),
      });
      const indicator = await getEconomicIndicator('yield_10y');
      expect(indicator?.value).toBe(4.1);
      expect(indicator?.previousValue).toBe(4.05);
    });

    it('returns null when FRED has no real values', async () => {
      process.env.FRED_API_KEY = 'test-key';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ observations: [{ date: '2026-09-29', value: '.' }] }),
      });
      expect(await getEconomicIndicator('yield_10y')).toBeNull();
    });

    it('should fetch real data when API key is set', async () => {
      process.env.FRED_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          observations: [
            { date: '2024-01-01', value: '5.33' },
            { date: '2023-12-01', value: '5.33' },
          ],
        }),
      });

      const indicator = await getEconomicIndicator('fed_rate');

      expect(mockFetch).toHaveBeenCalled();
      expect(indicator?.value).toBe(5.33);
    });

    it('should return null for unknown indicator', async () => {
      const indicator = await getEconomicIndicator('unknown_indicator');

      expect(indicator).toBeNull();
    });

    it('should include all expected FRED series', () => {
      const expectedSeries = [
        'fed_rate',
        'unemployment',
        'cpi',
        'gdp',
        'inflation',
        'yield_10y',
        'yield_2y',
        'housing_starts',
        'retail_sales',
        'consumer_sentiment',
      ];

      for (const series of expectedSeries) {
        expect(FRED_SERIES[series]).toBeDefined();
        expect(FRED_SERIES[series].name).toBeDefined();
        expect(FRED_SERIES[series].unit).toBeDefined();
      }
    });
  });

  describe('Yield Curve', () => {
    it('is null, not a made-up "normal" curve, when yields are unavailable', async () => {
      expect(await getYieldCurve()).toBeNull();
    });

    it('computes the spread from real yields', async () => {
      process.env.FRED_API_KEY = 'test-key';
      const obs = (v: string) => ({
        ok: true,
        json: async () => ({ observations: [{ date: '2026-09-28', value: v }] }),
      });
      mockFetch.mockResolvedValueOnce(obs('4.00')).mockResolvedValueOnce(obs('4.50'));
      const curve = await getYieldCurve();
      expect(curve?.spread).toBeCloseTo(-0.5);
      expect(curve?.status).toBe('inverted');
    });
  });

  describe('Economic Dashboard', () => {
    it('says the data is unavailable instead of inventing it', async () => {
      const dashboard = await getEconomicDashboard();

      expect(dashboard.indicators).toEqual([]);
      expect(dashboard.yieldCurve).toBeNull();
      expect(dashboard.summary).toBe("Current economic data isn't available right now.");
      expect(dashboard.summary).not.toMatch(/\d/);
    });
  });
});
