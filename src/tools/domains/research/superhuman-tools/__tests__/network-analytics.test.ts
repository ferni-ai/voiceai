/**
 * Network & Relationship Analytics Tools Tests
 *
 * Tests for communication patterns, relationship health, and influence mapping.
 *
 * Run with: pnpm vitest run src/tools/domains/research/superhuman-tools/__tests__/network-analytics.test.ts
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
  saveRelationship: vi.fn().mockResolvedValue(undefined),
  loadRelationships: vi.fn().mockResolvedValue([]),
  saveInteraction: vi.fn().mockResolvedValue(undefined),
  loadInteractions: vi.fn().mockResolvedValue([]),
}));

// ============================================================================
// IMPORTS
// ============================================================================

import { networkAnalyticsTools } from '../network-analytics.js';
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

describe('Network & Relationship Analytics Tools', () => {
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
      expect(networkAnalyticsTools).toHaveProperty('trackRelationship');
      expect(networkAnalyticsTools).toHaveProperty('logInteraction');
      expect(networkAnalyticsTools).toHaveProperty('analyzeCommunicationPatterns');
      expect(networkAnalyticsTools).toHaveProperty('scoreRelationshipHealth');
      expect(networkAnalyticsTools).toHaveProperty('mapInfluence');
      expect(networkAnalyticsTools).toHaveProperty('analyzeNetworkGaps');
    });
  });

  // --------------------------------------------------------------------------
  // trackRelationship
  // --------------------------------------------------------------------------

  describe('trackRelationship', () => {
    it('should track a new relationship', async () => {
      const result = await networkAnalyticsTools.trackRelationship.execute(
        {
          name: 'John Smith',
          relationship: 'friend',
          energyImpact: 'energizing',
          influenceDomains: ['career', 'health'],
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('relationship');
      expect(persistence.saveRelationship).toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // logInteraction
  // --------------------------------------------------------------------------

  describe('logInteraction', () => {
    it('should log new interaction', async () => {
      const result = await networkAnalyticsTools.logInteraction.execute(
        {
          name: 'John Smith',
          type: 'call',
          quality: 8,
          topic: 'Career advice',
        },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('logged');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeCommunicationPatterns
  // --------------------------------------------------------------------------

  describe('analyzeCommunicationPatterns', () => {
    it('should analyze communication patterns', async () => {
      const result = await networkAnalyticsTools.analyzeCommunicationPatterns.execute(
        {},
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // scoreRelationshipHealth
  // --------------------------------------------------------------------------

  describe('scoreRelationshipHealth', () => {
    it('should score relationship health', async () => {
      const result = await networkAnalyticsTools.scoreRelationshipHealth.execute(
        { name: 'John Smith' },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // mapInfluence
  // --------------------------------------------------------------------------

  describe('mapInfluence', () => {
    it('should map influence network', async () => {
      const result = await networkAnalyticsTools.mapInfluence.execute(
        {},
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  // --------------------------------------------------------------------------
  // analyzeNetworkGaps
  // --------------------------------------------------------------------------

  describe('analyzeNetworkGaps', () => {
    it('should identify network gaps', async () => {
      // Correct param: goals is an array of strings
      const result = await networkAnalyticsTools.analyzeNetworkGaps.execute(
        { goals: ['career advancement', 'improve health', 'build wealth'] },
        createMockContext()
      );

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });

    it('should handle single goal', async () => {
      const result = await networkAnalyticsTools.analyzeNetworkGaps.execute(
        { goals: ['get promoted'] },
        createMockContext()
      );

      expect(result).toBeDefined();
    });
  });
});
