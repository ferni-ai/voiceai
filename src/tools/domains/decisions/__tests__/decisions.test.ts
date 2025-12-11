/**
 * Decision Support Domain Tools Tests
 *
 * Tests for decision frameworks, analysis tools, and values alignment.
 *
 * Run with: npx vitest run src/tools/domains/decisions/__tests__/decisions.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })),
  }),
  safeLog: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  createLogger: () => ({
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

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import type { ToolContext, ToolDefinition } from '../../../registry/types.js';
import { getToolDefinitions } from '../index.js';

// ============================================================================
// TEST CONTEXT
// ============================================================================

function createMockContext(): ToolContext {
  return {
    userId: 'test-user-123',
    agentId: 'ferni',
    agentDisplayName: 'Ferni',
    services: {
      has: () => false,
      get: () => {
        throw new Error('Service not available');
      },
      getOptional: () => undefined,
    },
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('Decision Support Domain Tools', () => {
  let toolDefinitions: ToolDefinition[];
  let mockContext: ToolContext;

  beforeEach(async () => {
    vi.clearAllMocks();
    toolDefinitions = await getToolDefinitions();
    mockContext = createMockContext();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Tool Loading', () => {
    it('should load all decision tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have frameMajorDecision tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'frameMajorDecision');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('decisions');
    });

    it('should have walkThroughDecisionFramework tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'walkThroughDecisionFramework');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('decisions');
    });

    it('should have analyzeProsAndCons tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'analyzeProsAndCons');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('decisions');
    });

    it('should have checkValuesAlignment tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'checkValuesAlignment');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('decisions');
    });
  });

  describe('frameMajorDecision', () => {
    it('should frame a career decision', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'frameMajorDecision');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        decisionType: 'career',
        description: 'Should I take a new job offer?',
        timeline: 'weeks',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should frame a relationship decision', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'frameMajorDecision');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        decisionType: 'relationship',
        description: 'Should we move in together?',
      });

      expect(result).toBeDefined();
    });
  });

  describe('walkThroughDecisionFramework', () => {
    it('should walk through 10-10-10 framework', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'walkThroughDecisionFramework');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        framework: '10-10-10',
        decision: 'Whether to quit my job',
      });

      expect(result).toBeDefined();
      expect(result).toContain('10');
    });

    it('should walk through regret minimization framework', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'walkThroughDecisionFramework');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        framework: 'regret-minimization',
        decision: 'Starting a business',
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('regret');
    });

    it('should walk through pre-mortem analysis', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'walkThroughDecisionFramework');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        framework: 'pre-mortem',
        decision: 'Investing in a property',
      });

      expect(result).toBeDefined();
    });
  });

  describe('analyzeProsAndCons', () => {
    it('should analyze pros and cons', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'analyzeProsAndCons');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        decision: 'Moving to a new city',
        pros: ['Better job opportunities', 'Lower cost of living'],
        cons: ['Far from family', 'No friends there'],
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase().includes('pro') || result.toLowerCase().includes('con')).toBe(
        true
      );
    });
  });

  describe('checkValuesAlignment', () => {
    it('should check values alignment', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'checkValuesAlignment');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        decision: 'Taking a high-paying job with long hours',
        options: ['Accept the job', 'Stay at current job'],
        values: ['family', 'financial-security', 'health'],
      });

      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('value');
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'frameMajorDecision');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        decisionType: 'financial',
        description: 'Buying a house',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should provide thoughtful guidance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'walkThroughDecisionFramework');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        framework: 'values-first',
        decision: 'Changing careers',
      });

      // Should have substantive content
      expect(result.length).toBeGreaterThan(200);
    });
  });
});
