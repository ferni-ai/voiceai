/**
 * Information Executor Tests
 *
 * Tests for information retrieval tools: getWeather, getCurrentTime, searchNews,
 * getNews, getMarketSummary, getStockQuote.
 * Covers external API integrations for weather, news, and market data.
 *
 * @module agents/shared/tool-executors/__tests__/information-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { informationExecutor } from '../information-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock weather service (uses relative path from executor)
vi.mock('../../../../tools/domains/information/weather.js', () => ({
  getCurrentWeather: vi.fn().mockResolvedValue('Partly cloudy, 65°F in San Francisco'),
  getWeatherForecast: vi.fn().mockResolvedValue('Weather forecast for the week...'),
}));

// Mock news service
vi.mock('../../../../tools/domains/information/news.js', () => ({
  getGeneralNews: vi.fn().mockResolvedValue('Top news stories...'),
  getFinancialNews: vi.fn().mockResolvedValue('Financial news updates...'),
  getTechNews: vi.fn().mockResolvedValue('Tech news headlines...'),
  getStockNews: vi.fn().mockResolvedValue('Stock-specific news...'),
}));

// Mock market data service (uses finance path, not information)
vi.mock('../../../../tools/domains/finance/market-data.js', () => ({
  getMarketOverview: vi.fn().mockResolvedValue('Market summary: S&P 500 up 0.5%...'),
  getStockQuote: vi.fn().mockResolvedValue('AAPL: $175.50 (+1.2%)'),
}));

describe('InformationExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'ferni',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(informationExecutor.domain).toBe('information');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'getweather',
        'getcurrenttime',
        'searchnews',
        'getnews',
        'getfinancialsnews',
        'getfinancialnews',
        'gettechnews',
        'getstocknews',
        'getmarketsummary',
        'getmarketoverview',
        'getstockquote',
        'getstockprice',
        'getquote',
      ];

      for (const tool of expectedTools) {
        expect(informationExecutor.handles).toContain(tool);
      }
    });
  });

  describe('getWeather', () => {
    it('should get weather for location', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute(
        'getWeather',
        { location: 'San Francisco' },
        ctx
      );

      expect(result).toContain('San Francisco');
    });

    it('should get weather with units', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute(
        'getWeather',
        { location: 'New York', units: 'metric' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should use default location when not provided', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getWeather', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await informationExecutor.execute('GETWEATHER', { location: 'LA' }, ctx);
      const result2 = await informationExecutor.execute('GetWeather', { location: 'LA' }, ctx);
      const result3 = await informationExecutor.execute('getweather', { location: 'LA' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('getCurrentTime', () => {
    it('should get current time', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getCurrentTime', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should get time in specific timezone', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute(
        'getCurrentTime',
        { timezone: 'America/New_York' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should get time in city', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getCurrentTime', { city: 'Tokyo' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('searchNews', () => {
    it('should search news with query', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('searchNews', { query: 'technology' }, ctx);

      expect(result).toBeDefined();
    });

    it('should search news with filters', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute(
        'searchNews',
        { query: 'AI', category: 'technology', limit: 5 },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should return general news when no query provided', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('searchNews', {}, ctx);

      // Executor defaults to general news, doesn't prompt
      expect(result).toBeDefined();
    });
  });

  describe('getNews aliases', () => {
    it('should resolve getNews', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getNews', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getFinancialsNews', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getFinancialsNews', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getFinancialNews', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getFinancialNews', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getTechNews', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getTechNews', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getStockNews', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getStockNews', { symbol: 'AAPL' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('getMarketSummary / getMarketOverview', () => {
    it('should get market summary', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getMarketSummary', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getMarketOverview alias', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getMarketOverview', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should get specific market data', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute(
        'getMarketSummary',
        { indices: ['S&P 500', 'NASDAQ'] },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('getStockQuote aliases', () => {
    it('should get stock quote', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getStockQuote', { symbol: 'AAPL' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getStockPrice alias', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getStockPrice', { symbol: 'GOOGL' }, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve getQuote alias', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getQuote', { symbol: 'MSFT' }, ctx);

      expect(result).toBeDefined();
    });

    it('should prompt for symbol if missing', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('getStockQuote', {}, ctx);

      // Executor returns 'Please specify a stock symbol...' when missing
      expect(result).toContain('specify');
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await informationExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'setLights', 'createHabit'];

      for (const tool of otherDomainTools) {
        const result = await informationExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
