/**
 * Financial Research Tools Tests
 *
 * Tests for SEC analysis, insider tracking, options flow, and macro analysis.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/financial-research.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
}));

vi.mock('@livekit/agents', () => ({
  llm: {
    tool: vi.fn((config) => ({
      description: config.description,
      parameters: config.parameters,
      execute: config.execute,
    })),
  },
}));

vi.mock('../firestore-persistence.js', () => ({
  getUserIdFromContext: vi.fn((ctx) => {
    if (!ctx) return null;
    if (typeof ctx === 'object' && 'userId' in ctx) return ctx.userId;
    return null;
  }),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { financialResearchTools } from '../financial-research.js';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockContext(userId: string = 'test-user-123') {
  // Type as any for test mocks - production code uses proper types
  return { ctx: { userId }, toolCallId: `test-${Date.now()}` } as any;
}

// ============================================================================
// TESTS
// ============================================================================

describe('Financial Research Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tool Availability
  // --------------------------------------------------------------------------

  describe('Tool Availability', () => {
    it('should export all expected tools', () => {
      expect(financialResearchTools).toHaveProperty('analyzeSECFiling');
      expect(financialResearchTools).toHaveProperty('trackInsiderTrading');
      expect(financialResearchTools).toHaveProperty('analyzeOptionsFlow');
      expect(financialResearchTools).toHaveProperty('bridgeMacroToPersonal');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeSECFiling
  // --------------------------------------------------------------------------

  describe('analyzeSECFiling', () => {
    it('should analyze SEC filing for a stock', async () => {
      const result = await financialResearchTools.analyzeSECFiling.execute(
        { symbol: 'AAPL', filingType: '10-K' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle different filing types', async () => {
      const filingTypes = ['10-K', '10-Q', 'latest'] as const;

      for (const filingType of filingTypes) {
        const result = await financialResearchTools.analyzeSECFiling.execute(
          { symbol: 'MSFT', filingType },
          createMockContext()
        );

        expect(result).toBeDefined();
      }
    });
  });

  // --------------------------------------------------------------------------
  // trackInsiderTrading
  // --------------------------------------------------------------------------

  describe('trackInsiderTrading', () => {
    it('should track insider trading activity', async () => {
      const result = await financialResearchTools.trackInsiderTrading.execute(
        { symbol: 'TSLA' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeOptionsFlow
  // --------------------------------------------------------------------------

  describe('analyzeOptionsFlow', () => {
    it('should analyze unusual options activity', async () => {
      const result = await financialResearchTools.analyzeOptionsFlow.execute(
        { symbol: 'NVDA' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // bridgeMacroToPersonal
  // --------------------------------------------------------------------------

  describe('bridgeMacroToPersonal', () => {
    it('should connect macro events to personal portfolio', async () => {
      // Correct params: macroEvent (enum), personalContext (optional string)
      const result = await financialResearchTools.bridgeMacroToPersonal.execute(
        {
          macroEvent: 'fed_rate_hike',
          personalContext: 'I have a mortgage and some index funds',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle different macro events', async () => {
      const macroEvents = [
        'inflation_rising',
        'recession_declared',
        'stock_market_correction',
      ] as const;

      for (const macroEvent of macroEvents) {
        const result = await financialResearchTools.bridgeMacroToPersonal.execute(
          { macroEvent },
          createMockContext()
        );

        expect(result).toBeDefined();
      }
    });
  });
});
