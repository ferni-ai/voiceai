/**
 * External Data Integration Tools Tests
 *
 * Tests for local economics, industry trends, and news sentiment analysis.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/external-data.test.ts
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
  saveSpendingRecord: vi.fn().mockResolvedValue(undefined),
  loadSpendingRecords: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { externalDataTools } from '../external-data.js';
import * as persistence from '../firestore-persistence.js';

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

describe('External Data Integration Tools', () => {
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
      const expectedTools = [
        'getLocalEconomics',
        'synthesizeIndustryTrends',
        'analyzeNewsSentiment',
        'recordSpending',
        'calculatePersonalInflation',
      ];

      for (const toolName of expectedTools) {
        expect(externalDataTools).toHaveProperty(toolName);
        expect((externalDataTools as Record<string, unknown>)[toolName]).toBeDefined();
      }
    });

    it('should have proper tool structure', () => {
      const tool = externalDataTools.getLocalEconomics;
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
    });
  });

  // --------------------------------------------------------------------------
  // getLocalEconomics
  // --------------------------------------------------------------------------

  describe('getLocalEconomics', () => {
    it('should require userId from context', async () => {
      const result = await externalDataTools.getLocalEconomics.execute(
        { location: 'San Francisco, CA' },
        { ctx: null, toolCallId: 'test' } as any
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should get local economic conditions', async () => {
      const result = await externalDataTools.getLocalEconomics.execute(
        { location: 'San Francisco, CA' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(50);
    });
  });

  // --------------------------------------------------------------------------
  // synthesizeIndustryTrends
  // --------------------------------------------------------------------------

  describe('synthesizeIndustryTrends', () => {
    it('should synthesize industry trends', async () => {
      const result = await externalDataTools.synthesizeIndustryTrends.execute(
        { industry: 'Technology' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeNewsSentiment
  // --------------------------------------------------------------------------

  describe('analyzeNewsSentiment', () => {
    it('should analyze news sentiment for topic', async () => {
      const result = await externalDataTools.analyzeNewsSentiment.execute(
        { topic: 'Electric vehicles' },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // recordSpending
  // --------------------------------------------------------------------------

  describe('recordSpending', () => {
    it('should record spending data', async () => {
      const result = await externalDataTools.recordSpending.execute(
        {
          amount: 150,
          category: 'food',
          description: 'Whole Foods groceries',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(persistence.saveSpendingRecord).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // calculatePersonalInflation
  // --------------------------------------------------------------------------

  describe('calculatePersonalInflation', () => {
    it('should calculate personal inflation rate', async () => {
      vi.mocked(persistence.loadSpendingRecords).mockResolvedValueOnce([
        { id: 's1', date: new Date(Date.now() - 365 * 86400000), amount: 500, category: 'groceries' },
        { id: 's2', date: new Date(Date.now() - 180 * 86400000), amount: 520, category: 'groceries' },
        { id: 's3', date: new Date(), amount: 550, category: 'groceries' },
      ]);

      const result = await externalDataTools.calculatePersonalInflation.execute(
        { monthlyIncome: 5000 },
        createMockContext()
      );

      expect(result).toBeDefined();
    });

    it('should handle no spending data', async () => {
      vi.mocked(persistence.loadSpendingRecords).mockResolvedValueOnce([]);

      const result = await externalDataTools.calculatePersonalInflation.execute(
        {},
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });
});
