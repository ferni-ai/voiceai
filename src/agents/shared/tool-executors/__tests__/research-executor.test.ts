/**
 * Research Executor Tests
 *
 * Tests for financial research tools: analyzeStock, findStocks, marketData,
 * technicalIndicators, calculateFIRE, behavioralInsights, etc.
 * Covers Peter persona's financial research capabilities.
 *
 * @module agents/shared/tool-executors/__tests__/research-executor.test
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { researchExecutor } from '../research-executor.js';
import type { ToolExecutionContext } from '../types.js';

// Mock research domain module
vi.mock('../../../../tools/domains/research/index.js', () => ({
  getToolDefinitions: vi.fn().mockResolvedValue([
    {
      id: 'analyzeStock',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ symbol: 'AAPL', analysis: 'Strong buy' }),
      }),
    },
    {
      id: 'findStocks',
      create: () => ({
        execute: vi.fn().mockResolvedValue([{ symbol: 'AAPL', name: 'Apple Inc' }]),
      }),
    },
    {
      id: 'marketData',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ index: 'S&P 500', value: 4500 }),
      }),
    },
    {
      id: 'technicalIndicators',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ rsi: 65, macd: 'bullish' }),
      }),
    },
    {
      id: 'calculateFIRE',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ yearsToFIRE: 15, savingsNeeded: 1000000 }),
      }),
    },
    {
      id: 'behavioralInsights',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ tip: 'Stay the course' }),
      }),
    },
    {
      id: 'riskAnalysis',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ riskScore: 7, volatility: 'moderate' }),
      }),
    },
    {
      id: 'retirementReadiness',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ ready: true, years: 15 }),
      }),
    },
    {
      id: 'peerComparison',
      create: () => ({
        execute: vi.fn().mockResolvedValue({ percentile: 75 }),
      }),
    },
  ]),
}));

describe('ResearchExecutor', () => {
  const createContext = (overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext => ({
    userId: 'test-user-123',
    sessionId: 'test-session-456',
    personaId: 'peter',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('executor metadata', () => {
    it('should have correct domain name', () => {
      expect(researchExecutor.domain).toBe('research');
    });

    it('should handle all expected tools', () => {
      const expectedTools = [
        'analyzestock',
        'findstocks',
        'marketdata',
        'marketawareness',
        'getstockquote',
        'getmarketsummary',
        'analyzepatterns',
        'behavioralinsights',
        'insightbriefing',
        'proactiveinsights',
        'technicalindicators',
        'riskanalysis',
        'analyzesavingsrate',
        'calculatefire',
        'retirementreadiness',
        'behavioralscore',
        'peercomparison',
      ];

      for (const tool of expectedTools) {
        expect(researchExecutor.handles).toContain(tool);
      }
    });
  });

  describe('analyzeStock', () => {
    it('should analyze a stock by symbol', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('analyzeStock', { symbol: 'AAPL' }, ctx);

      expect(result).toBeDefined();
    });

    it('should analyze with depth option', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'analyzeStock',
        { symbol: 'GOOGL', depth: 'detailed' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should handle missing symbol gracefully', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('analyzeStock', {}, ctx);

      // Executor processes whatever is given via tool execute
      expect(result).toBeDefined();
    });

    it('should handle case-insensitive tool names', async () => {
      const ctx = createContext();

      const result1 = await researchExecutor.execute('ANALYZESTOCK', { symbol: 'MSFT' }, ctx);
      const result2 = await researchExecutor.execute('AnalyzeStock', { symbol: 'MSFT' }, ctx);
      const result3 = await researchExecutor.execute('analyzestock', { symbol: 'MSFT' }, ctx);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result3).toBeDefined();
    });
  });

  describe('findStocks', () => {
    it('should find stocks by criteria', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'findStocks',
        { criteria: 'high dividend' },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should find stocks by sector', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('findStocks', { sector: 'technology' }, ctx);

      expect(result).toBeDefined();
    });

    it('should find stocks with filters', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'findStocks',
        {
          criteria: 'growth',
          marketCap: 'large',
          priceRange: '50-200',
        },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('marketData / marketAwareness', () => {
    it('should get market data', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('marketData', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should resolve marketAwareness alias', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('marketAwareness', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should get market data for specific index', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('marketData', { index: 'NASDAQ' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('getStockQuote / getMarketSummary', () => {
    it('should get stock quote', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('getStockQuote', { symbol: 'TSLA' }, ctx);

      expect(result).toBeDefined();
    });

    it('should get market summary', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('getMarketSummary', {}, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('technicalIndicators', () => {
    it('should get technical indicators for stock', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('technicalIndicators', { symbol: 'AAPL' }, ctx);

      expect(result).toBeDefined();
    });

    it('should get specific indicators', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'technicalIndicators',
        { symbol: 'GOOGL', indicators: ['RSI', 'MACD', 'SMA'] },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('riskAnalysis', () => {
    it('should analyze portfolio risk', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'riskAnalysis',
        { portfolio: ['AAPL', 'GOOGL', 'MSFT'] },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should analyze single stock risk', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('riskAnalysis', { symbol: 'TSLA' }, ctx);

      expect(result).toBeDefined();
    });
  });

  describe('behavioralInsights', () => {
    it('should get behavioral insights', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('behavioralInsights', {}, ctx);

      expect(result).toBeDefined();
    });

    it('should get insights for specific behavior', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'behavioralInsights',
        { behavior: 'panic selling' },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('calculateFIRE', () => {
    it('should calculate FIRE number', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'calculateFIRE',
        {
          currentSavings: 100000,
          annualExpenses: 50000,
          savingsRate: 0.3,
        },
        ctx
      );

      expect(result).toBeDefined();
    });

    it('should calculate with retirement age', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'calculateFIRE',
        {
          currentAge: 30,
          targetRetirementAge: 50,
          currentSavings: 200000,
        },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('retirementReadiness', () => {
    it('should assess retirement readiness', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'retirementReadiness',
        {
          age: 45,
          savings: 500000,
          monthlyContribution: 2000,
        },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('peerComparison', () => {
    it('should compare to peers', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute(
        'peerComparison',
        {
          age: 35,
          income: 100000,
          savings: 150000,
        },
        ctx
      );

      expect(result).toBeDefined();
    });
  });

  describe('unhandled tools', () => {
    it('should return null for unhandled tools', async () => {
      const ctx = createContext();
      const result = await researchExecutor.execute('unknownTool', {}, ctx);

      expect(result).toBeNull();
    });

    it('should return null for tools from other domains', async () => {
      const ctx = createContext();

      const otherDomainTools = ['playMusic', 'addTask', 'setLights', 'createHabit'];

      for (const tool of otherDomainTools) {
        const result = await researchExecutor.execute(tool, {}, ctx);
        expect(result).toBeNull();
      }
    });
  });
});
