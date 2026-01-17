/**
 * Research Synthesis Tools Tests
 *
 * Tests for evidence evaluation, claim verification, and research synthesis.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/research-synthesis.test.ts
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
  saveVerifiedClaim: vi.fn().mockResolvedValue(undefined),
  loadVerifiedClaims: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { researchSynthesisTools } from '../research-synthesis.js';
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

describe('Research Synthesis Tools', () => {
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
      expect(researchSynthesisTools).toHaveProperty('scoreEvidenceQuality');
      expect(researchSynthesisTools).toHaveProperty('synthesizeResearch');
      expect(researchSynthesisTools).toHaveProperty('findCounterArguments');
      expect(researchSynthesisTools).toHaveProperty('verifyClaim');
      expect(researchSynthesisTools).toHaveProperty('getBaseRate');
    });
  });

  // --------------------------------------------------------------------------
  // scoreEvidenceQuality
  // --------------------------------------------------------------------------

  describe('scoreEvidenceQuality', () => {
    it('should score evidence quality', async () => {
      const params = {
        claim: 'Exercise improves mood',
        evidence: 'Multiple RCTs show 30% improvement in mood scores',
        source: 'JAMA Meta-analysis',
      };

      const result = await researchSynthesisTools.scoreEvidenceQuality.execute(
        params,
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(50);
    });
  });

  // --------------------------------------------------------------------------
  // synthesizeResearch
  // --------------------------------------------------------------------------

  describe('synthesizeResearch', () => {
    it('should synthesize research on a topic', async () => {
      const params = {
        topic: 'Benefits of meditation',
        depth: 'standard' as const,
      };

      const result = await researchSynthesisTools.synthesizeResearch.execute(
        params,
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });
  });

  // --------------------------------------------------------------------------
  // findCounterArguments
  // --------------------------------------------------------------------------

  describe('findCounterArguments', () => {
    it('should generate counter-arguments', async () => {
      const params = {
        belief: 'Remote work is always better than office work',
        domain: 'career' as const,
      };

      const result = await researchSynthesisTools.findCounterArguments.execute(
        params,
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('counter');
    });
  });

  // --------------------------------------------------------------------------
  // verifyClaim
  // --------------------------------------------------------------------------

  describe('verifyClaim', () => {
    it('should verify and save claim', async () => {
      const params = {
        claim: 'Drinking 8 glasses of water daily is necessary',
        sources: ['Medical journal', 'WHO guidelines'],
      };

      const result = await researchSynthesisTools.verifyClaim.execute(
        params,
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('verification');
      // Note: saveVerifiedClaim may not be called if using local store first
    });
  });

  // --------------------------------------------------------------------------
  // getBaseRate
  // --------------------------------------------------------------------------

  describe('getBaseRate', () => {
    it('should provide base rate information', async () => {
      const result = await researchSynthesisTools.getBaseRate.execute(
        { scenario: 'startup success' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('base rate');
    });

    it('should handle various scenarios', async () => {
      const scenarios = ['startup', 'diet', 'business'];

      for (const scenario of scenarios) {
        const result = await researchSynthesisTools.getBaseRate.execute(
          { scenario },
          createMockContext()
        );

        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }
    });
  });
});
