/**
 * Quant Tools Tests
 *
 * Comprehensive tests for Peter's Triple Quant tools:
 * 1. Market Quant - Technical indicators, risk analysis
 * 2. Personal Finance Quant - Savings rate, FIRE, retirement readiness
 * 3. Coaching Quant - Behavioral score, peer comparison
 *
 * Run with: pnpm vitest run src/tools/domains/research/__tests__/quant-tools.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

// Mock fetch for Yahoo Finance API calls
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

// Mock logger
vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
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

// Mock LiveKit agents
vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

import { createQuantTools } from '../quant-tools.js';

// Type for our mock tool structure
interface MockTool {
  description: string;
  parameters: unknown;
  execute: (params: Record<string, unknown>) => Promise<string>;
}

type MockQuantTools = Record<string, MockTool>;

describe('Quant Tools', () => {
  let quantTools: MockQuantTools;

  beforeEach(() => {
    vi.clearAllMocks();
    quantTools = createQuantTools() as unknown as MockQuantTools;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // MARKET QUANT TESTS
  // ============================================================================

  describe('Market Quant: Technical Indicators', () => {
    it('should calculate technical indicators for valid stock', async () => {
      // Mock Yahoo Finance response with historical prices
      const mockPrices = Array.from({ length: 100 }, (_, i) => 150 + Math.sin(i / 10) * 10);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                indicators: {
                  quote: [{ close: mockPrices }],
                },
              },
            ],
          },
        }),
      });

      const result = await quantTools.technicalIndicators.execute({
        symbol: 'AAPL',
        indicators: ['all'],
      });

      expect(result).toContain('Technical Analysis for AAPL');
      expect(result).toContain('RSI');
      expect(result).toContain('MACD');
      expect(result).toContain('Moving Averages');
      expect(result).toContain('Bollinger Bands');
    });

    it('should handle insufficient data gracefully', async () => {
      // Mock response with too few prices
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                indicators: {
                  quote: [{ close: [150, 151, 152] }], // Only 3 prices
                },
              },
            ],
          },
        }),
      });

      const result = await quantTools.technicalIndicators.execute({
        symbol: 'NEWSTOCK',
        indicators: ['all'],
      });

      expect(result).toContain('more historical data');
    });

    it('should calculate specific indicators when requested', async () => {
      const mockPrices = Array.from({ length: 100 }, (_, i) => 150 + Math.sin(i / 10) * 10);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          chart: {
            result: [
              {
                indicators: {
                  quote: [{ close: mockPrices }],
                },
              },
            ],
          },
        }),
      });

      const result = await quantTools.technicalIndicators.execute({
        symbol: 'AAPL',
        indicators: ['rsi'],
      });

      expect(result).toContain('RSI');
      expect(result).not.toContain('MACD');
    });
  });

  describe('Market Quant: Risk Analysis', () => {
    it('should calculate risk metrics for stocks', async () => {
      // Mock responses for stock and benchmark (SPY)
      const mockPrices = Array.from({ length: 252 }, (_, i) => 150 + Math.sin(i / 20) * 15);
      const mockBenchmark = Array.from({ length: 252 }, (_, i) => 400 + Math.sin(i / 25) * 20);

      mockFetch
        .mockResolvedValueOnce({
          // SPY benchmark
          ok: true,
          json: async () => ({
            chart: {
              result: [{ indicators: { quote: [{ close: mockBenchmark }] } }],
            },
          }),
        })
        .mockResolvedValueOnce({
          // VTI
          ok: true,
          json: async () => ({
            chart: {
              result: [{ indicators: { quote: [{ close: mockPrices }] } }],
            },
          }),
        });

      const result = await quantTools.riskAnalysis.execute({
        symbols: ['VTI'],
      });

      expect(result).toContain('Risk Analysis');
      expect(result).toContain('VTI');
      expect(result).toContain('Beta');
      expect(result).toContain('Volatility');
      expect(result).toContain('Sharpe Ratio');
      expect(result).toContain('Max Drawdown');
      expect(result).toContain('VaR');
    });
  });

  // ============================================================================
  // PERSONAL FINANCE QUANT TESTS
  // ============================================================================

  describe('Personal Finance Quant: Savings Rate', () => {
    it('should calculate excellent savings rate', async () => {
      const result = await quantTools.analyzeSavingsRate.execute({
        monthlyIncome: 10000,
        monthlyExpenses: 5000,
      });

      expect(result).toContain('Savings Rate: 50%');
      expect(result).toContain('Exceptional');
      expect(result).toContain('$5,000');
      expect(result).toContain('$60,000'); // Annual savings
    });

    it('should calculate poor savings rate with advice', async () => {
      const result = await quantTools.analyzeSavingsRate.execute({
        monthlyIncome: 5000,
        monthlyExpenses: 4800,
      });

      expect(result).toContain('Savings Rate: 4%');
      expect(result).toContain('Needs Work');
    });

    it('should handle negative savings (spending more than earning)', async () => {
      const result = await quantTools.analyzeSavingsRate.execute({
        monthlyIncome: 5000,
        monthlyExpenses: 6000,
      });

      expect(result).toContain('Critical');
      expect(result).toContain('spending more than you earn');
    });
  });

  describe('Personal Finance Quant: FIRE Calculator', () => {
    it('should calculate FIRE numbers correctly', async () => {
      const result = await quantTools.calculateFIRE.execute({
        annualExpenses: 60000,
        withdrawalRate: 4,
      });

      expect(result).toContain('FIRE Number: $1,500,000'); // 60000 * 25
      expect(result).toContain('Lean FIRE: $1,050,000'); // 42000 * 25
      expect(result).toContain('Fat FIRE: $2,250,000'); // 90000 * 25
      expect(result).toContain('Coast FIRE');
    });

    it('should adjust for different withdrawal rates', async () => {
      const result = await quantTools.calculateFIRE.execute({
        annualExpenses: 40000,
        withdrawalRate: 3.5,
      });

      expect(result).toContain('3.5% safe withdrawal rate');
      // 40000 / 0.035 = ~$1,142,857
      expect(result).toContain('$1,142,857');
    });
  });

  describe('Personal Finance Quant: Retirement Readiness', () => {
    it('should calculate high readiness score', async () => {
      const result = await quantTools.retirementReadiness.execute({
        currentAge: 35,
        targetRetirementAge: 65,
        currentSavings: 500000,
        monthlyContribution: 3000,
        monthlyExpenses: 5000,
        expectedReturn: 7,
      });

      expect(result).toContain('Readiness Score');
      expect(result).toContain('Projected at age 65');
      expect(result).toContain('Monthly income in retirement');
    });

    it('should provide recommendations for low readiness', async () => {
      const result = await quantTools.retirementReadiness.execute({
        currentAge: 45,
        targetRetirementAge: 65,
        currentSavings: 50000,
        monthlyContribution: 500,
        monthlyExpenses: 6000,
      });

      expect(result).toContain('Readiness Score');
      // Should have improvement recommendations
      expect(result).toMatch(/Let's make a plan|increase|progress/i);
    });
  });

  // ============================================================================
  // COACHING QUANT TESTS
  // ============================================================================

  describe('Coaching Quant: Behavioral Score', () => {
    it('should score excellent financial behavior', async () => {
      const result = await quantTools.behavioralScore.execute({
        panicSells: 0,
        timingAttempts: 0,
        impulsePurchases: 0,
        budgetAdherence: 90,
        savingsConsistency: 95,
        debtPaymentConsistency: 100,
      });

      expect(result).toContain('Financial Behavior Analysis');
      expect(result).toContain('Overall Score');
      expect(result).toContain('Emotional Control');
      expect(result).toContain('Financial Discipline');
      expect(result).toContain('Patience');
      expect(result).toContain('Strengths');
    });

    it('should identify areas for improvement', async () => {
      const result = await quantTools.behavioralScore.execute({
        panicSells: 3,
        timingAttempts: 5,
        impulsePurchases: 4,
        budgetAdherence: 40,
        savingsConsistency: 50,
        debtPaymentConsistency: 60,
      });

      expect(result).toContain('Areas to Improve');
      expect(result).toMatch(/calm|budget|automate/i);
    });

    it('should highlight no panic selling as strength', async () => {
      const result = await quantTools.behavioralScore.execute({
        panicSells: 0,
        timingAttempts: 2,
        impulsePurchases: 1,
        budgetAdherence: 70,
        savingsConsistency: 75,
        debtPaymentConsistency: 80,
      });

      expect(result).toContain("haven't panic sold");
    });
  });

  describe('Coaching Quant: Peer Comparison', () => {
    it('should compare favorably for high performers', async () => {
      const result = await quantTools.peerComparison.execute({
        ageGroup: '30s',
        savingsRate: 25,
        netWorth: 200000,
        debtToIncome: 0.2,
        emergencyFundMonths: 6,
      });

      expect(result).toContain('Peer Comparison');
      expect(result).toContain('30s');
      expect(result).toContain('Savings Rate');
      expect(result).toContain('Net Worth');
      expect(result).toContain('percentile');
    });

    it('should provide context for different age groups', async () => {
      const result20s = await quantTools.peerComparison.execute({
        ageGroup: '20s',
        savingsRate: 10,
        netWorth: 15000,
        debtToIncome: 0.5,
        emergencyFundMonths: 2,
      });

      const result50s = await quantTools.peerComparison.execute({
        ageGroup: '50s',
        savingsRate: 20,
        netWorth: 500000,
        debtToIncome: 0.3,
        emergencyFundMonths: 6,
      });

      expect(result20s).toContain('20s');
      expect(result50s).toContain('50s');
    });

    it('should highlight standout areas', async () => {
      const result = await quantTools.peerComparison.execute({
        ageGroup: '40s',
        savingsRate: 30, // Very high
        netWorth: 500000, // High for 40s
        debtToIncome: 0.1, // Very low debt
        emergencyFundMonths: 12, // Very high
      });

      expect(result).toContain('Standout Areas');
      expect(result).toContain('top 25%');
    });
  });

  // ============================================================================
  // EDGE CASES & ERROR HANDLING
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle zero income gracefully', async () => {
      const result = await quantTools.analyzeSavingsRate.execute({
        monthlyIncome: 0,
        monthlyExpenses: 1000,
      });

      // Zero income = 0% savings rate, negative monthly savings
      expect(result).toContain('Savings Rate: 0%');
      expect(result).toContain('$-1,000');
    });

    it('should handle very high savings rate', async () => {
      const result = await quantTools.analyzeSavingsRate.execute({
        monthlyIncome: 20000,
        monthlyExpenses: 3000,
      });

      expect(result).toContain('Exceptional');
      expect(result).toContain('85%');
    });

    it('should handle young retirement age', async () => {
      const result = await quantTools.retirementReadiness.execute({
        currentAge: 30,
        targetRetirementAge: 40, // Early retirement
        currentSavings: 500000,
        monthlyContribution: 5000,
        monthlyExpenses: 4000,
      });

      expect(result).toContain('age 40');
    });
  });
});

describe('Quant Tools Integration', () => {
  it('should have all 7 quant tools', () => {
    const tools = createQuantTools();
    const toolNames = Object.keys(tools);

    expect(toolNames).toContain('technicalIndicators');
    expect(toolNames).toContain('riskAnalysis');
    expect(toolNames).toContain('analyzeSavingsRate');
    expect(toolNames).toContain('calculateFIRE');
    expect(toolNames).toContain('retirementReadiness');
    expect(toolNames).toContain('behavioralScore');
    expect(toolNames).toContain('peerComparison');
    expect(toolNames.length).toBe(7);
  });

  it('should have execute functions for all tools', () => {
    const tools = createQuantTools();

    for (const [name, tool] of Object.entries(tools)) {
      expect(typeof tool.execute).toBe('function');
      expect(tool.description).toBeDefined();
      expect(tool.description.length).toBeGreaterThan(20);
    }
  });
});
