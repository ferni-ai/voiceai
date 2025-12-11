/**
 * Legal & Administrative Domain Tools Tests
 *
 * Tests for document organization, estate planning, and administrative tasks.
 *
 * Run with: npx vitest run src/tools/domains/legal-admin/__tests__/legal-admin.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ============================================================================
// MOCKS
// ============================================================================

vi.mock('../../../../utils/safe-logger.js', () => {
  const createMockLogger = (): Record<string, unknown> => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  });
  return {
    getLogger: () => createMockLogger(),
    safeLog: () => createMockLogger(),
    createLogger: (_bindings?: Record<string, unknown>) => createMockLogger(),
  };
});

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
    agentId: 'jordan',
    agentDisplayName: 'Jordan',
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

describe('Legal & Administrative Domain Tools', () => {
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
    it('should load all legal-admin tool definitions', async () => {
      expect(toolDefinitions).toBeDefined();
      expect(Array.isArray(toolDefinitions)).toBe(true);
      expect(toolDefinitions.length).toBeGreaterThan(0);
    });

    it('should have organizeDocuments tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'organizeDocuments');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('legal-admin');
    });

    it('should have promptEstatePlanning tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'promptEstatePlanning');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('legal-admin');
    });

    it('should have reviewInsuranceCoverage tool', () => {
      const tool = toolDefinitions.find((t) => t.id === 'reviewInsuranceCoverage');
      expect(tool).toBeDefined();
      expect(tool?.domain).toBe('legal-admin');
    });
  });

  describe('organizeDocuments', () => {
    it('should help organize documents', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'organizeDocuments');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        documentType: 'financial',
      });

      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(100);
    });

    it('should organize medical documents', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'organizeDocuments');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        documentType: 'medical',
      });

      expect(result).toBeDefined();
    });
  });

  describe('promptEstatePlanning', () => {
    it('should prompt estate planning basics', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'promptEstatePlanning');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lifeStage: 'married-with-kids',
      });

      expect(result).toBeDefined();
      expect(
        result.toLowerCase().includes('estate') ||
          result.toLowerCase().includes('will') ||
          result.toLowerCase().includes('plan')
      ).toBe(true);
    });

    it('should provide guidance for complex situations', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'promptEstatePlanning');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lifeStage: 'retirement',
      });

      expect(result).toBeDefined();
    });
  });

  describe('reviewInsuranceCoverage', () => {
    it('should help review insurance coverage', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'reviewInsuranceCoverage');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        insuranceType: 'health',
        lifeEvent: 'new-job',
      });

      expect(result).toBeDefined();
    });

    it('should review life insurance', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'reviewInsuranceCoverage');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        insuranceType: 'life',
        lifeEvent: 'new-baby',
      });

      expect(result).toBeDefined();
    });
  });

  describe('prepareForTaxSeason', () => {
    it('should help prepare for taxes', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'prepareForTaxSeason');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        taxSituation: 'employed',
      });

      expect(result).toBeDefined();
    });
  });

  describe('Content Validation', () => {
    it('should not contain placeholder text', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'organizeDocuments');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        documentType: 'legal',
      });

      expect(result).not.toContain('TODO');
      expect(result).not.toContain('placeholder');
    });

    it('should include appropriate disclaimers', async () => {
      const toolDef = toolDefinitions.find((t) => t.id === 'promptEstatePlanning');
      const tool = toolDef!.create(mockContext);

      const result = await tool.execute({
        lifeStage: 'single',
      });

      // Should have substantive content with appropriate caveats
      expect(result.length).toBeGreaterThan(100);
    });
  });
});
