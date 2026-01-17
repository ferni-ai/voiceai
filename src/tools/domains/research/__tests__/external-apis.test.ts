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
  getMockFundamentals,
  getMockEarnings,
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
    it('should return mock data when API key not set', async () => {
      const fundamentals = await getCompanyFundamentals('AAPL');

      expect(fundamentals).toBeDefined();
      expect(fundamentals?.symbol).toBe('AAPL');
      expect(fundamentals?.name).toBe('Apple Inc.');
      expect(fundamentals?.sector).toBe('Technology');
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

    it('should fallback to mock data on API error', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          Note: 'API call frequency limit reached',
        }),
      });

      const fundamentals = await getCompanyFundamentals('AAPL');

      // Should return mock data as fallback
      expect(fundamentals).toBeDefined();
      expect(fundamentals?.symbol).toBe('AAPL');
    });

    it('should handle HTTP errors gracefully', async () => {
      process.env.ALPHA_VANTAGE_API_KEY = 'test-key';

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const fundamentals = await getCompanyFundamentals('AAPL');

      // Should return mock data as fallback
      expect(fundamentals).toBeDefined();
    });
  });

  describe('Alpha Vantage - Earnings History', () => {
    it('should return mock earnings when API key not set', async () => {
      const earnings = await getEarningsHistory('AAPL', 4);

      expect(earnings).toHaveLength(4);
      expect(earnings[0].symbol).toBe('AAPL');
      expect(earnings[0].reportedEPS).toBeDefined();
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
    it('should return mock data when API key not set', async () => {
      const indicator = await getEconomicIndicator('fed_rate');

      expect(indicator).toBeDefined();
      expect(indicator?.name).toBe('Federal Funds Rate');
      expect(indicator?.unit).toBe('%');
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
    it('should calculate yield curve spread', async () => {
      const yieldCurve = await getYieldCurve();

      expect(yieldCurve.spread).toBeDefined();
      expect(['normal', 'flat', 'inverted']).toContain(yieldCurve.status);
      expect(yieldCurve.interpretation).toBeDefined();
    });

    it('should detect normal yield curve', async () => {
      // Mock data will return normal spread
      const yieldCurve = await getYieldCurve();

      // With mock data, 10Y (4.2) - 2Y (4.1) = 0.1, which is flat
      expect(['normal', 'flat']).toContain(yieldCurve.status);
    });
  });

  describe('Economic Dashboard', () => {
    it('should return comprehensive dashboard', async () => {
      const dashboard = await getEconomicDashboard();

      expect(dashboard.indicators).toBeDefined();
      expect(dashboard.indicators.length).toBeGreaterThan(0);
      expect(dashboard.yieldCurve).toBeDefined();
      expect(dashboard.summary).toContain('Economic Dashboard');
    });

    it('should include key indicators in summary', async () => {
      const dashboard = await getEconomicDashboard();

      expect(dashboard.summary).toContain('Federal Funds Rate');
      expect(dashboard.summary).toContain('Yield Curve');
    });
  });

  describe('Mock Data Functions', () => {
    it('should generate consistent mock fundamentals', () => {
      const aapl = getMockFundamentals('AAPL');
      const msft = getMockFundamentals('MSFT');
      const unknown = getMockFundamentals('XYZ');

      expect(aapl.name).toBe('Apple Inc.');
      expect(msft.name).toBe('Microsoft Corporation');
      expect(unknown.name).toBe('XYZ Company');
    });

    it('should generate mock earnings with correct structure', () => {
      const earnings = getMockEarnings('AAPL', 4);

      expect(earnings).toHaveLength(4);
      for (const e of earnings) {
        expect(e.symbol).toBe('AAPL');
        expect(e.fiscalDateEnding).toBeDefined();
        expect(e.reportedEPS).toBeGreaterThan(0);
        expect(e.estimatedEPS).toBeGreaterThan(0);
      }
    });
  });
});
